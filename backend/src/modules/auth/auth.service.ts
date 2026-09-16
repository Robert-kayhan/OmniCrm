import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { permissionsForRole } from '../../config/permissions';
import { CryptoService } from '../../common/crypto/crypto.service';
import { PasswordService } from '../../common/crypto/password.service';
import { TokenService } from '../../common/auth/token.service';
import type { ClientContext } from '../../common/decorators/client-context.decorator';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../common/errors/app.error';
import { uniqueSlug } from '../../common/util/slug';
import { PrismaService } from '../../database/prisma.service';
import { UserRole, UserStatus } from '../../generated/prisma/enums';
import type { AuthContext } from '../../types/auth';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import { userSelect, type UserDto } from '../users/user.select';
import type { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';

export type { ClientContext };

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

export interface CurrentUserDto extends UserDto {
  organization: { id: string; name: string; slug: string };
  teams: { id: string; name: string }[];
  permissions: string[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly crypto: CryptoService,
    private readonly auditLogs: AuditLogService,
  ) {}

  /**
   * Mints an access/refresh pair and persists the hashed refresh token. Only the
   * SHA-256 digest is stored, so a database dump cannot be replayed as a session.
   */
  private async issueTokens(
    user: { id: string; organizationId: string; role: UserRole },
    context: ClientContext,
  ): Promise<IssuedTokens> {
    const accessToken = this.tokens.signAccessToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });
    const refresh = this.tokens.signRefreshToken({
      userId: user.id,
      organizationId: user.organizationId,
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.crypto.sha256(refresh.token),
        expiresAt: refresh.expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent?.slice(0, 512) ?? null,
      },
    });

    return {
      accessToken,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt,
      expiresIn: this.tokens.accessTokenTtlSeconds(accessToken),
      tokenType: 'Bearer',
    };
  }

  /**
   * Creates an organization together with its first SUPER_ADMIN. Both rows are
   * written in one transaction so a failure cannot leave an ownerless tenant.
   */
  async register(input: RegisterDto, context: ClientContext): Promise<AuthResult> {
    if (!this.config.publicRegistrationEnabled) {
      throw new ForbiddenError(
        'Public registration is disabled. Ask an administrator for an invitation.',
        'REGISTRATION_DISABLED',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError('An account with this email already exists', 'EMAIL_ALREADY_IN_USE');
    }

    const slug = await uniqueSlug(input.organizationName, async (candidate) => {
      const found = await this.prisma.organization.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return found !== null;
    });

    const passwordHash = await this.passwords.hash(input.password);

    const { user, organization } = await this.prisma.$transaction(async (tx) => {
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

    const tokens = await this.issueTokens(user, context);

    await this.auditLogs.record({
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

  async login(input: LoginDto, context: ClientContext): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
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
      await this.passwords.fakeVerify();
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const passwordMatches = await this.passwords.verify(input.password, user.password);
    if (!passwordMatches) {
      await this.auditLogs.record({
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

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
      select: userSelect,
    });

    const tokens = await this.issueTokens(user, context);

    await this.auditLogs.record({
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
  async refresh(token: string, context: ClientContext): Promise<AuthResult> {
    const payload = this.tokens.verifyRefreshToken(token);
    const tokenHash = this.crypto.sha256(token);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, revokedAt: true, expiresAt: true },
    });

    if (!stored || stored.revokedAt) {
      await this.revokeAllSessions(payload.sub);
      this.logger.warn(
        { userId: payload.sub, reason: stored ? 'revoked_token_reused' : 'unknown_token' },
        'Refresh token reuse detected, all sessions revoked',
      );
      await this.auditLogs.record({
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

    const user = await this.prisma.user.findUnique({
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

    const tokens = await this.issueTokens(user, context);

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: new Date(),
        replacedBy: this.crypto.sha256(tokens.refreshToken),
      },
    });

    const { organization, ...userFields } = user;

    return {
      user: userFields,
      organization,
      permissions: permissionsForRole(user.role),
      tokens,
    };
  }

  async logout(options: {
    token: string | null;
    userId?: string;
    allDevices?: boolean;
  }): Promise<void> {
    if (options.allDevices && options.userId) {
      await this.revokeAllSessions(options.userId);
      return;
    }
    if (!options.token) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.crypto.sha256(options.token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getCurrentUser(userId: string): Promise<CurrentUserDto> {
    const user = await this.prisma.user.findUnique({
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

  async changePassword(
    userId: string,
    input: ChangePasswordDto,
    context: ClientContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, organizationId: true },
    });
    if (!user?.password) throw new NotFoundError('User', 'USER_NOT_FOUND');

    const matches = await this.passwords.verify(input.currentPassword, user.password);
    if (!matches) {
      throw new UnauthorizedError('Current password is incorrect', 'INVALID_CREDENTIALS');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: await this.passwords.hash(input.newPassword) },
    });

    // Every other device must re-authenticate with the new password.
    await this.revokeAllSessions(userId);

    await this.auditLogs.record({
      organizationId: user.organizationId,
      userId,
      action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
      entityType: AUDIT_ENTITIES.USER,
      entityId: userId,
      ...context,
    });
  }

  /** Records the logout in the audit trail, when the caller was identified. */
  async recordLogout(auth: AuthContext, context: ClientContext): Promise<void> {
    await this.auditLogs.record({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: AUDIT_ACTIONS.AUTH_LOGOUT,
      entityType: AUDIT_ENTITIES.SESSION,
      entityId: auth.userId,
      ...context,
    });
  }

  /** Housekeeping for expired and long-revoked rows; safe to run from a cron. */
  async purgeExpiredRefreshTokens(): Promise<number> {
    const cutoff = new Date(Date.now() - 7 * 86_400_000);
    const result = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }] },
    });
    return result.count;
  }
}
