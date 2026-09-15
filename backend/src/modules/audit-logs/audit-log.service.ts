import type { Request } from 'express';
import type { Prisma } from '../../generated/prisma/client';
import type { Db } from '../../database/prisma';
import { prisma } from '../../database/prisma';
import { logger } from '../../config/logger';
import { buildPaginationMeta } from '../../utils/response';
import { toSkipTake, type PageQuery } from '../../utils/pagination';
import type { AuditAction, AuditEntity } from './audit-log.actions';

export interface AuditInput {
  organizationId: string;
  userId?: string | null;
  action: AuditAction | string;
  entityType: AuditEntity | string;
  entityId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Pass an open transaction to make the audit row atomic with the change. */
  db?: Db;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'tokenHash',
  'pageAccessToken',
]);

/**
 * Strips credentials before anything is persisted. Audit rows are widely
 * readable inside an organization, so they must never carry secrets.
 */
function scrub(value: unknown, depth = 0): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) {
    return value.map((item) => scrub(item, depth + 1) ?? null) as Prisma.InputJsonValue;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key)) {
        output[key] = '[redacted]';
        continue;
      }
      const scrubbed = scrub(entry, depth + 1);
      if (scrubbed !== undefined) output[key] = scrubbed;
    }
    return output as Prisma.InputJsonValue;
  }
  if (typeof value === 'bigint') return value.toString();
  return value as Prisma.InputJsonValue;
}

/**
 * Writes an audit row. Never throws: an audit failure must not roll back or
 * fail the business operation that triggered it (unless it is inside a caller
 * supplied transaction, where the caller has already accepted that coupling).
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  const db = input.db ?? prisma;
  try {
    await db.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        oldData: scrub(input.oldData),
        newData: scrub(input.newData),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    logger.error(
      { err: error, action: input.action, organizationId: input.organizationId },
      'Failed to write audit log',
    );
  }
}

/** Pulls the client fingerprint used on every audit row. */
export function auditContextFromRequest(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
  };
}

export interface AuditLogFilters extends PageQuery {
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
}

export async function listAuditLogs(organizationId: string, filters: AuditLogFilters) {
  const where: Prisma.AuditLogWhereInput = {
    organizationId,
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const { skip, take } = toSkipTake(filters);

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, meta: buildPaginationMeta(filters.page, filters.limit, total) };
}
