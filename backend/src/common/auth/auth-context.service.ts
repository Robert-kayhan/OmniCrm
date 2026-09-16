import { Injectable } from '@nestjs/common';
import { ROLE_PERMISSIONS } from '../../config/permissions';
import { PrismaService } from '../../database/prisma.service';
import { UserStatus } from '../../generated/prisma/enums';
import type { AuthContext } from '../../types/auth';
import { UnauthorizedError } from '../errors/app.error';
import { TokenService } from './token.service';

@Injectable()
export class AuthContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Resolves a bearer token to an AuthContext.
   *
   * The user row is re-read on every request rather than trusted from the
   * token, so deactivating a user or changing their role takes effect
   * immediately instead of at the next token expiry. Both the HTTP guard and
   * the socket handshake go through here, so the two surfaces can never drift.
   */
  async fromToken(token: string): Promise<AuthContext> {
    const payload = this.tokens.verifyAccessToken(token);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        organizationId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('Account no longer exists', 'ACCOUNT_NOT_FOUND');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError('Account is not active', 'ACCOUNT_INACTIVE');
    }
    // A token minted before the user was moved between organizations is refused.
    if (user.organizationId !== payload.organizationId) {
      throw new UnauthorizedError('Token no longer valid for this organization', 'TOKEN_INVALID');
    }

    return {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
      name: user.name,
      permissions: ROLE_PERMISSIONS[user.role] ?? new Set(),
      tokenId: payload.jti,
    };
  }
}
