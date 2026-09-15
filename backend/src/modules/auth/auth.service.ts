import { prisma } from '../../database/prisma';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { permissionsForRole } from '../../config/permissions';
import { UserRole, UserStatus } from '../../generated/prisma/enums';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/errors';
import { sha256 } from '../../utils/crypto';
import { fakeVerify, hashPassword, verifyPassword } from '../../utils/password';
import {
  accessTokenTtlSeconds,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt';
import { uniqueSlug } from '../../utils/slug';
import { recordAudit } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import { userSelect, type UserDto } from '../users/user.select';
import type { ChangePasswordInput, LoginInput, RegisterInput } from './auth.schema';

export interface ClientContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface AuthResult {
  user: UserDto;
  organization: { id: string; name: string; slug: string };
  permissions: string[];
  tokens: IssuedTokens;
}

/**
 * Mints an access/refresh pair and persists the hashed refresh token. Only the
 * SHA-256 digest is stored, so a database dump cannot be replayed as a session.
 */
async function issueTokens(
  user: { id: string; organizationId: string; role: UserRole },
  context: ClientContext,
): Promise<IssuedTokens> {
  const accessToken = signAccessToken({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
  });
  const refresh = signRefreshToken({ userId: user.id, organizationId: user.organizationId });

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refresh.token),
      expiresAt: refresh.expiresAt,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent?.slice(0, 512) ?? null,
    },
  });

  return {
    accessToken,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
    expiresIn: accessTokenTtlSeconds(accessToken),
    tokenType: 'Bearer',
  };
}

/**
 * Creates an organization together with its first SUPER_ADMIN. Both rows are
 * written in one transaction so a failure cannot leave an ownerless tenant.
 */
export async function register(input: RegisterInput, context: ClientContext): Promise<AuthResult> {
  if (!env.ALLOW_PUBLIC_REGISTRATION) {
    throw new ForbiddenError(
      'Public registration is disabled. Ask an administrator for an invitation.',
      'REGISTRATION_DISABLED',
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError('An account with this email already exists', 'EMAIL_ALREADY_IN_USE');
  }

  const slug = await uniqueSlug(input.organizationName, async (candidate) => {
    const found = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    return found !== null;
  });

  const passwordHash = await hashPassword(input.password);

  const { user, organization } = await prisma.$transaction(async (tx) => {
    const createdOrganization = await tx.organization.create({
      data: { name: input.organizationName, slug },
      select: { id: true, name: true, slug: true },
    });

    const createdUser = await tx.user.create({
      data: {
        organizationId: createdOrganization.id,
        name: input.name,
        email: input.email,
        password: passwordHash,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      },
      select: userSelect,
    });

    // Every new tenant starts with the two teams the inbox UI assumes exist.
    await tx.team.createMany({
      data: [
        {
          organizationId: createdOrganization.id,
          name: 'Sales',
          description: 'Pre-sales enquiries',
        },
        {
          organizationId: createdOrganization.id,
          name: 'Support',
          description: 'Customer support',
        },
      ],
    });

    return { user: createdUser, organization: createdOrganization };
  });

  const tokens = await issueTokens(user, context);

  await recordAudit({
    organizationId: organization.id,
    userId: user.id,
    action: AUDIT_ACTIONS.AUTH_REGISTER,
    entityType: AUDIT_ENTITIES.ORGANIZATION,
    entityId: organization.id,
    newData: { organizationName: organization.name, slug: organization.slug },
    ...context,
  });

  return { user, organization, permissions: permissionsForRole(user.role), tokens };
}

export async function login(input: LoginInput, context: ClientContext): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      password: true,
      status: true,
      role: true,
      organizationId: true,
      organization: { select: { id: true, name: true, slug: true } },
    },
  });

  // Identical error and comparable timing whether the email is unknown, the
  // account has no password yet, or the password is simply wrong.
  if (!user || !user.password) {
    await fakeVerify();
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await verifyPassword(input.password, user.password);
  if (!passwordMatches) {
    await recordAudit({
      organizationId: user.organizationId,
      userId: user.id,
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      entityType: AUDIT_ENTITIES.SESSION,
      entityId: user.id,
      ...context,
    });
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (user.status !== UserStatus.ACTIVE) {
    const invited = user.status === UserStatus.INVITED;
    throw new UnauthorizedError(
      invited
        ? 'Finish setting up your account from the invitation email'
        : 'This account has been deactivated',
      invited ? 'ACCOUNT_INVITED' : 'ACCOUNT_INACTIVE',
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() },
    select: userSelect,
  });

  const tokens = await issueTokens(user, context);

  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: AUDIT_ACTIONS.AUTH_LOGIN,
    entityType: AUDIT_ENTITIES.SESSION,
    entityId: user.id,
    ...context,
  });

  return {
    user: updated,
    organization: user.organization,
    permissions: permissionsForRole(updated.role),
    tokens,
  };
}

/**
 * Rotates a refresh token.
 *
 * A token that verifies cryptographically but is missing or already revoked in
 * the database was stolen or replayed, so every session for that user is
 * revoked rather than only the presented one.
 */
export async function refresh(token: string, context: ClientContext): Promise<AuthResult> {
  const payload = verifyRefreshToken(token);
  const tokenHash = sha256(token);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, revokedAt: true, expiresAt: true },
  });

  if (!stored || stored.revokedAt) {
    await revokeAllSessions(payload.sub);
    logger.warn(
      { userId: payload.sub, reason: stored ? 'revoked_token_reused' : 'unknown_token' },
      'Refresh token reuse detected, all sessions revoked',
    );
    await recordAudit({
      organizationId: payload.organizationId,
      userId: payload.sub,
      action: AUDIT_ACTIONS.AUTH_REFRESH_REUSE_DETECTED,
      entityType: AUDIT_ENTITIES.SESSION,
      entityId: payload.sub,
      ...context,
    });
    throw new UnauthorizedError('Refresh token is no longer valid', 'REFRESH_TOKEN_REVOKED');
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedError('Refresh token has expired', 'TOKEN_EXPIRED');
  }

  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    select: {
      ...userSelect,
      organization: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!user) throw new UnauthorizedError('Account no longer exists', 'ACCOUNT_NOT_FOUND');
  if (user.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedError('Account is not active', 'ACCOUNT_INACTIVE');
  }

  const tokens = await issueTokens(user, context);

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date(), replacedBy: sha256(tokens.refreshToken) },
  });

  const { organization, ...userFields } = user;

  return {
    user: userFields,
    organization,
    permissions: permissionsForRole(user.role),
    tokens,
  };
}

export async function logout(options: {
  token: string | null;
  userId?: string;
  allDevices?: boolean;
}): Promise<void> {
  if (options.allDevices && options.userId) {
    await revokeAllSessions(options.userId);
    return;
  }
  if (!options.token) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(options.token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export interface CurrentUser extends UserDto {
  organization: { id: string; name: string; slug: string };
  teams: { id: string; name: string }[];
  permissions: string[];
}

export async function getCurrentUser(userId: string): Promise<CurrentUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...userSelect,
      organization: { select: { id: true, name: true, slug: true } },
      teams: { select: { team: { select: { id: true, name: true } } } },
    },
  });

  if (!user) throw new NotFoundError('User', 'USER_NOT_FOUND');

  const { teams, organization, ...rest } = user;
  return {
    ...rest,
    organization,
    teams: teams.map((membership) => membership.team),
    permissions: permissionsForRole(user.role),
  };
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  context: ClientContext,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true, organizationId: true },
  });
  if (!user?.password) throw new NotFoundError('User', 'USER_NOT_FOUND');

  const matches = await verifyPassword(input.currentPassword, user.password);
  if (!matches) {
    throw new UnauthorizedError('Current password is incorrect', 'INVALID_CREDENTIALS');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { password: await hashPassword(input.newPassword) },
  });

  // Every other device must re-authenticate with the new password.
  await revokeAllSessions(userId);

  await recordAudit({
    organizationId: user.organizationId,
    userId,
    action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
    entityType: AUDIT_ENTITIES.USER,
    entityId: userId,
    ...context,
  });
}

/** Housekeeping for expired and long-revoked rows; safe to run from a cron. */
export async function purgeExpiredRefreshTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  const result = await prisma.refreshToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }] },
  });
  return result.count;
}
