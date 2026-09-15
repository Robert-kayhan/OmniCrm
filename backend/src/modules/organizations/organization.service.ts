import { prisma } from '../../database/prisma';
import { ConversationStatus, UserStatus } from '../../generated/prisma/enums';
import { NotFoundError } from '../../utils/errors';
import { uniqueSlug } from '../../utils/slug';
import { recordAudit } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import type { AuthContext } from '../../types/auth';
import type { ClientContext } from '../auth/auth.service';
import type { UpdateOrganizationInput } from './organization.schema';

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  counts: {
    users: number;
    teams: number;
    customers: number;
    conversations: number;
    integrations: number;
  };
}

export async function getOrganization(organizationId: string): Promise<OrganizationDto> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          users: true,
          teams: true,
          customers: true,
          conversations: true,
          integrations: true,
        },
      },
    },
  });

  if (!organization) throw new NotFoundError('Organization', 'ORGANIZATION_NOT_FOUND');

  const { _count, ...rest } = organization;
  return { ...rest, counts: _count };
}

export async function updateOrganization(
  actor: AuthContext,
  input: UpdateOrganizationInput,
  context: ClientContext,
): Promise<OrganizationDto> {
  const existing = await prisma.organization.findUnique({
    where: { id: actor.organizationId },
    select: { id: true, name: true, slug: true },
  });
  if (!existing) throw new NotFoundError('Organization', 'ORGANIZATION_NOT_FOUND');

  // Renaming only regenerates the slug when the caller did not pin one.
  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    slug = await uniqueSlug(input.slug, async (candidate) => {
      const found = await prisma.organization.findFirst({
        where: { slug: candidate, id: { not: existing.id } },
        select: { id: true },
      });
      return found !== null;
    });
  }

  await prisma.organization.update({
    where: { id: actor.organizationId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(slug !== existing.slug ? { slug } : {}),
    },
  });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
    entityType: AUDIT_ENTITIES.ORGANIZATION,
    entityId: actor.organizationId,
    oldData: existing,
    newData: { name: input.name ?? existing.name, slug },
    ...context,
  });

  return getOrganization(actor.organizationId);
}

export interface OrganizationStats {
  conversations: { open: number; pending: number; closed: number; unassigned: number; total: number };
  messages: { last24h: number; total: number };
  customers: { total: number; newLast7Days: number };
  users: { active: number; total: number };
  integrations: { connected: number; total: number };
}

/** Backing data for the dashboard tiles. One round trip, five parallel counts. */
export async function getOrganizationStats(organizationId: string): Promise<OrganizationStats> {
  const now = Date.now();
  const dayAgo = new Date(now - 86_400_000);
  const weekAgo = new Date(now - 7 * 86_400_000);

  const [
    open,
    pending,
    closed,
    unassigned,
    conversationTotal,
    messagesLast24h,
    messageTotal,
    customerTotal,
    customersNew,
    activeUsers,
    userTotal,
    connectedIntegrations,
    integrationTotal,
  ] = await Promise.all([
    prisma.conversation.count({ where: { organizationId, status: ConversationStatus.OPEN } }),
    prisma.conversation.count({ where: { organizationId, status: ConversationStatus.PENDING } }),
    prisma.conversation.count({ where: { organizationId, status: ConversationStatus.CLOSED } }),
    prisma.conversation.count({
      where: {
        organizationId,
        assignedUserId: null,
        assignedTeamId: null,
        status: { not: ConversationStatus.CLOSED },
      },
    }),
    prisma.conversation.count({ where: { organizationId } }),
    prisma.message.count({ where: { organizationId, createdAt: { gte: dayAgo } } }),
    prisma.message.count({ where: { organizationId } }),
    prisma.customer.count({ where: { organizationId } }),
    prisma.customer.count({ where: { organizationId, createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { organizationId, status: UserStatus.ACTIVE } }),
    prisma.user.count({ where: { organizationId } }),
    prisma.integration.count({ where: { organizationId, status: 'CONNECTED' } }),
    prisma.integration.count({ where: { organizationId } }),
  ]);

  return {
    conversations: { open, pending, closed, unassigned, total: conversationTotal },
    messages: { last24h: messagesLast24h, total: messageTotal },
    customers: { total: customerTotal, newLast7Days: customersNew },
    users: { active: activeUsers, total: userTotal },
    integrations: { connected: connectedIntegrations, total: integrationTotal },
  };
}
