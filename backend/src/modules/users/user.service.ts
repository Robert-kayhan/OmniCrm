import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { canManageRole } from '../../config/permissions';
import { PasswordService } from '../../common/crypto/password.service';
import type { ClientContext } from '../../common/decorators/client-context.decorator';
import { toSkipTake } from '../../common/dto/pagination.dto';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../common/errors/app.error';
import { buildPaginationMeta } from '../../common/http/api-response';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { UserRole, UserStatus } from '../../generated/prisma/enums';
import type { AuthContext } from '../../types/auth';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import { AuthService } from '../auth/auth.service';
import type {
  CreateUserDto,
  ListUsersQueryDto,
  ResetUserPasswordDto,
  UpdateProfileDto,
  UpdateUserDto,
} from './dto/user.dto';
import { toUserWithTeamsDto, userWithTeamsSelect, type UserWithTeamsDto } from './user.select';

/** Meets the password policy without a round trip to the caller. */
function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  const body = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `Aa1${body}`;
}

export interface CreateUserResult {
  user: UserWithTeamsDto;
  /** Present only when the server generated the password. Shown once, never stored. */
  temporaryPassword: string | null;
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly auditLogs: AuditLogService,
    private readonly auth: AuthService,
  ) {}

  private async assertTeamsBelongToOrganization(
    organizationId: string,
    teamIds: string[],
  ): Promise<void> {
    if (teamIds.length === 0) return;
    const count = await this.prisma.team.count({
      where: { id: { in: teamIds }, organizationId },
    });
    if (count !== teamIds.length) {
      throw new BadRequestError('One or more teams do not exist', 'TEAM_NOT_FOUND');
    }
  }

  private async assertNotLastSuperAdmin(
    organizationId: string,
    excludingUserId: string,
  ): Promise<void> {
    const remaining = await this.prisma.user.count({
      where: {
        organizationId,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        id: { not: excludingUserId },
      },
    });
    if (remaining === 0) {
      throw new ConflictError(
        'An organization must keep at least one active super administrator',
        'LAST_SUPER_ADMIN',
      );
    }
  }

  async list(organizationId: string, query: ListUsersQueryDto) {
    const where: Prisma.UserWhereInput = {
      // Tenant scope is applied here, once, for every caller of this method.
      organizationId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.teamId ? { teams: { some: { teamId: query.teamId } } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const { skip, take } = toSkipTake(query);

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sort]: query.order },
        select: userWithTeamsSelect,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: rows.map(toUserWithTeamsDto),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async getById(organizationId: string, userId: string): Promise<UserWithTeamsDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: userWithTeamsSelect,
    });
    if (!user) throw new NotFoundError('User', 'USER_NOT_FOUND');
    return toUserWithTeamsDto(user);
  }

  async create(
    actor: AuthContext,
    input: CreateUserDto,
    context: ClientContext,
  ): Promise<CreateUserResult> {
    // Nobody may mint an account more privileged than their own.
    if (!canManageRole(actor.role, input.role)) {
      throw new ForbiddenError(
        `Your role cannot create a ${input.role} user`,
        'ROLE_ESCALATION_DENIED',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError('An account with this email already exists', 'EMAIL_ALREADY_IN_USE');
    }

    const teamIds = input.teamIds ?? [];
    await this.assertTeamsBelongToOrganization(actor.organizationId, teamIds);

    // INVITED users deliberately have no password: they cannot sign in until an
    // administrator issues one.
    const invited = input.status === UserStatus.INVITED;
    const generated = !invited && !input.password ? generateTemporaryPassword() : null;
    const plainPassword = input.password ?? generated;

    const created = await this.prisma.user.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name,
        email: input.email,
        role: input.role,
        status: input.status,
        avatar: input.avatar ?? null,
        password: plainPassword ? await this.passwords.hash(plainPassword) : null,
        ...(teamIds.length > 0 ? { teams: { create: teamIds.map((teamId) => ({ teamId })) } } : {}),
      },
      select: userWithTeamsSelect,
    });

    await this.auditLogs.record({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: AUDIT_ACTIONS.USER_CREATED,
      entityType: AUDIT_ENTITIES.USER,
      entityId: created.id,
      newData: {
        name: created.name,
        email: created.email,
        role: created.role,
        status: created.status,
      },
      ...context,
    });

    return { user: toUserWithTeamsDto(created), temporaryPassword: generated };
  }

  async update(
    actor: AuthContext,
    userId: string,
    input: UpdateUserDto,
    context: ClientContext,
  ): Promise<UserWithTeamsDto> {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: actor.organizationId },
      select: { id: true, name: true, role: true, status: true, avatar: true },
    });
    if (!target) throw new NotFoundError('User', 'USER_NOT_FOUND');

    if (!canManageRole(actor.role, target.role)) {
      throw new ForbiddenError(
        'You cannot modify a user with a higher role',
        'ROLE_ESCALATION_DENIED',
      );
    }
    if (input.role && !canManageRole(actor.role, input.role)) {
      throw new ForbiddenError(`Your role cannot grant ${input.role}`, 'ROLE_ESCALATION_DENIED');
    }
    if (actor.userId === userId && input.role && input.role !== target.role) {
      throw new ForbiddenError('You cannot change your own role', 'SELF_ROLE_CHANGE_DENIED');
    }
    if (actor.userId === userId && input.status && input.status !== UserStatus.ACTIVE) {
      throw new ForbiddenError('You cannot deactivate your own account', 'SELF_DEACTIVATION_DENIED');
    }

    if (target.role === UserRole.SUPER_ADMIN) {
      const demoting = input.role && input.role !== UserRole.SUPER_ADMIN;
      const deactivating = input.status && input.status !== UserStatus.ACTIVE;
      if (demoting || deactivating) {
        await this.assertNotLastSuperAdmin(actor.organizationId, userId);
      }
    }

    if (input.teamIds) {
      await this.assertTeamsBelongToOrganization(actor.organizationId, input.teamIds);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.teamIds) {
        await tx.userTeam.deleteMany({ where: { userId } });
        if (input.teamIds.length > 0) {
          await tx.userTeam.createMany({
            data: input.teamIds.map((teamId) => ({ userId, teamId })),
          });
        }
      }

      return tx.user.update({
        where: { id: userId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
        },
        select: userWithTeamsSelect,
      });
    });

    // A user who is no longer active must lose their live sessions immediately.
    if (input.status && input.status !== UserStatus.ACTIVE) {
      await this.auth.revokeAllSessions(userId);
    }

    await this.auditLogs.record({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action:
        input.role && input.role !== target.role
          ? AUDIT_ACTIONS.USER_ROLE_CHANGED
          : AUDIT_ACTIONS.USER_UPDATED,
      entityType: AUDIT_ENTITIES.USER,
      entityId: userId,
      oldData: target,
      newData: { name: updated.name, role: updated.role, status: updated.status },
      ...context,
    });

    return toUserWithTeamsDto(updated);
  }

  async updateOwnProfile(actor: AuthContext, input: UpdateProfileDto): Promise<UserWithTeamsDto> {
    const updated = await this.prisma.user.update({
      where: { id: actor.userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
      },
      select: userWithTeamsSelect,
    });
    return toUserWithTeamsDto(updated);
  }

  async remove(actor: AuthContext, userId: string, context: ClientContext): Promise<void> {
    if (actor.userId === userId) {
      throw new ForbiddenError('You cannot delete your own account', 'SELF_DELETE_DENIED');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: actor.organizationId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!target) throw new NotFoundError('User', 'USER_NOT_FOUND');

    if (!canManageRole(actor.role, target.role)) {
      throw new ForbiddenError(
        'You cannot delete a user with a higher role',
        'ROLE_ESCALATION_DENIED',
      );
    }
    if (target.role === UserRole.SUPER_ADMIN) {
      await this.assertNotLastSuperAdmin(actor.organizationId, userId);
    }

    // Conversations, messages and audit rows survive: their relations are
    // SetNull, so history stays intact after the account is gone.
    await this.prisma.user.delete({ where: { id: userId } });

    await this.auditLogs.record({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: AUDIT_ACTIONS.USER_DELETED,
      entityType: AUDIT_ENTITIES.USER,
      entityId: userId,
      oldData: target,
      ...context,
    });
  }

  async resetPassword(
    actor: AuthContext,
    userId: string,
    input: ResetUserPasswordDto,
    context: ClientContext,
  ): Promise<{ temporaryPassword: string | null }> {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: actor.organizationId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundError('User', 'USER_NOT_FOUND');
    if (!canManageRole(actor.role, target.role)) {
      throw new ForbiddenError('You cannot reset this password', 'ROLE_ESCALATION_DENIED');
    }

    const generated = input.password ? null : generateTemporaryPassword();
    const plainPassword = input.password ?? generated;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await this.passwords.hash(plainPassword as string),
        // Issuing a password is what activates an invited account.
        status: UserStatus.ACTIVE,
      },
    });

    await this.auth.revokeAllSessions(userId);

    await this.auditLogs.record({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
      entityType: AUDIT_ENTITIES.USER,
      entityId: userId,
      ...context,
    });

    return { temporaryPassword: generated };
  }

  /** Lightweight directory used by assignment dropdowns. */
  async listAssignable(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId, status: UserStatus.ACTIVE },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, avatar: true, role: true },
    });
  }
}
