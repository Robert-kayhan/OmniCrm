import crypto from 'node:crypto';
import { prisma } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { UserRole, UserStatus } from '../../generated/prisma/enums';
import { canManageRole } from '../../config/permissions';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { hashPassword } from '../../utils/password';
import { buildPaginationMeta } from '../../utils/response';
import { toSkipTake } from '../../utils/pagination';
import { recordAudit } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import type { AuthContext } from '../../types/auth';
import type { ClientContext } from '../auth/auth.service';
import { revokeAllSessions } from '../auth/auth.service';
import {
  toUserWithTeamsDto,
  userWithTeamsSelect,
  type UserWithTeamsDto,
} from './user.select';
import type {
  CreateUserInput,
  ListUsersQuery,
  ResetUserPasswordInput,
  UpdateProfileInput,
  UpdateUserInput,
} from './user.schema';

/** Meets the password policy without a round trip to the caller. */
function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  const body = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `Aa1${body}`;
}

async function assertTeamsBelongToOrganization(
  organizationId: string,
  teamIds: string[],
): Promise<void> {
  if (teamIds.length === 0) return;
  const count = await prisma.team.count({
    where: { id: { in: teamIds }, organizationId },
  });
  if (count !== teamIds.length) {
    throw new BadRequestError('One or more teams do not exist', 'TEAM_NOT_FOUND');
  }
}

export async function listUsers(organizationId: string, query: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {
    // Tenant scope is applied here, once, for every caller of this function.
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
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: { [query.sort]: query.order },
      select: userWithTeamsSelect,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: rows.map(toUserWithTeamsDto),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function getUserById(
  organizationId: string,
  userId: string,
): Promise<UserWithTeamsDto> {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: userWithTeamsSelect,
  });
  if (!user) throw new NotFoundError('User', 'USER_NOT_FOUND');
  return toUserWithTeamsDto(user);
}

export interface CreateUserResult {
  user: UserWithTeamsDto;
  /** Present only when the server generated the password. Shown once, never stored. */
  temporaryPassword: string | null;
}

export async function createUser(
  actor: AuthContext,
  input: CreateUserInput,
  context: ClientContext,
): Promise<CreateUserResult> {
  // Nobody may mint an account more privileged than their own.
  if (!canManageRole(actor.role, input.role)) {
    throw new ForbiddenError(
      `Your role cannot create a ${input.role} user`,
      'ROLE_ESCALATION_DENIED',
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError('An account with this email already exists', 'EMAIL_ALREADY_IN_USE');
  }

  const teamIds = input.teamIds ?? [];
  await assertTeamsBelongToOrganization(actor.organizationId, teamIds);

  // INVITED users deliberately have no password: they cannot sign in until an
  // administrator issues one.
  const invited = input.status === UserStatus.INVITED;
  const generated = !invited && !input.password ? generateTemporaryPassword() : null;
  const plainPassword = input.password ?? generated;

  const created = await prisma.user.create({
    data: {
      organizationId: actor.organizationId,
      name: input.name,
      email: input.email,
      role: input.role,
      status: input.status,
      avatar: input.avatar ?? null,
      password: plainPassword ? await hashPassword(plainPassword) : null,
      ...(teamIds.length > 0
        ? { teams: { create: teamIds.map((teamId) => ({ teamId })) } }
        : {}),
    },
    select: userWithTeamsSelect,
  });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.USER_CREATED,
    entityType: AUDIT_ENTITIES.USER,
    entityId: created.id,
    newData: { name: created.name, email: created.email, role: created.role, status: created.status },
    ...context,
  });

  return { user: toUserWithTeamsDto(created), temporaryPassword: generated };
}

export async function updateUser(
  actor: AuthContext,
  userId: string,
  input: UpdateUserInput,
  context: ClientContext,
): Promise<UserWithTeamsDto> {
  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    select: { id: true, name: true, role: true, status: true, avatar: true },
  });
  if (!target) throw new NotFoundError('User', 'USER_NOT_FOUND');

  if (!canManageRole(actor.role, target.role)) {
    throw new ForbiddenError('You cannot modify a user with a higher role', 'ROLE_ESCALATION_DENIED');
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
      await assertNotLastSuperAdmin(actor.organizationId, userId);
    }
  }

  if (input.teamIds) {
    await assertTeamsBelongToOrganization(actor.organizationId, input.teamIds);
  }

  const updated = await prisma.$transaction(async (tx) => {
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
    await revokeAllSessions(userId);
  }

  await recordAudit({
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

export async function updateOwnProfile(
  actor: AuthContext,
  input: UpdateProfileInput,
): Promise<UserWithTeamsDto> {
  const updated = await prisma.user.update({
    where: { id: actor.userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
    },
    select: userWithTeamsSelect,
  });
  return toUserWithTeamsDto(updated);
}

async function assertNotLastSuperAdmin(organizationId: string, excludingUserId: string) {
  const remaining = await prisma.user.count({
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

export async function deleteUser(
  actor: AuthContext,
  userId: string,
  context: ClientContext,
): Promise<void> {
  if (actor.userId === userId) {
    throw new ForbiddenError('You cannot delete your own account', 'SELF_DELETE_DENIED');
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!target) throw new NotFoundError('User', 'USER_NOT_FOUND');

  if (!canManageRole(actor.role, target.role)) {
    throw new ForbiddenError('You cannot delete a user with a higher role', 'ROLE_ESCALATION_DENIED');
  }
  if (target.role === UserRole.SUPER_ADMIN) {
    await assertNotLastSuperAdmin(actor.organizationId, userId);
  }

  // Conversations, messages and audit rows survive: their relations are
  // SetNull, so history stays intact after the account is gone.
  await prisma.user.delete({ where: { id: userId } });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.USER_DELETED,
    entityType: AUDIT_ENTITIES.USER,
    entityId: userId,
    oldData: target,
    ...context,
  });
}

export async function resetUserPassword(
  actor: AuthContext,
  userId: string,
  input: ResetUserPasswordInput,
  context: ClientContext,
): Promise<{ temporaryPassword: string | null }> {
  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    select: { id: true, role: true },
  });
  if (!target) throw new NotFoundError('User', 'USER_NOT_FOUND');
  if (!canManageRole(actor.role, target.role)) {
    throw new ForbiddenError('You cannot reset this password', 'ROLE_ESCALATION_DENIED');
  }

  const generated = input.password ? null : generateTemporaryPassword();
  const plainPassword = input.password ?? generated;

  await prisma.user.update({
    where: { id: userId },
    data: {
      password: await hashPassword(plainPassword as string),
      // Issuing a password is what activates an invited account.
      status: UserStatus.ACTIVE,
    },
  });

  await revokeAllSessions(userId);

  await recordAudit({
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
export async function listAssignableUsers(organizationId: string) {
  return prisma.user.findMany({
    where: { organizationId, status: UserStatus.ACTIVE },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, avatar: true, role: true },
  });
}
