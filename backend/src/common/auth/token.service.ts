import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { AppConfigService } from '../../config/app-config.service';
import type { UserRole } from '../../generated/prisma/enums';
import { UnauthorizedError } from '../errors/app.error';

const ISSUER = 'omni-crm';
const AUDIENCE = 'omni-crm-api';

export interface AccessTokenPayload {
  sub: string;
  organizationId: string;
  role: UserRole;
  type: 'access';
  jti: string;
}

export interface RefreshTokenPayload {
  sub: string;
  organizationId: string;
  type: 'refresh';
  jti: string;
}

type ExpiresIn = SignOptions['expiresIn'];

@Injectable()
export class TokenService {
  constructor(private readonly config: AppConfigService) {}

  private baseOptions(expiresIn: string): SignOptions {
    return { expiresIn: expiresIn as ExpiresIn, issuer: ISSUER, audience: AUDIENCE };
  }

  signAccessToken(input: {
    userId: string;
    organizationId: string;
    role: UserRole;
  }): string {
    const payload: Omit<AccessTokenPayload, 'sub'> = {
      organizationId: input.organizationId,
      role: input.role,
      type: 'access',
      jti: crypto.randomUUID(),
    };
    return jwt.sign(payload, this.config.get('JWT_SECRET'), {
      ...this.baseOptions(this.config.get('JWT_ACCESS_EXPIRES_IN')),
      subject: input.userId,
    });
  }

  signRefreshToken(input: { userId: string; organizationId: string }): {
    token: string;
    jti: string;
    expiresAt: Date;
  } {
    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { organizationId: input.organizationId, type: 'refresh', jti },
      this.config.get('JWT_REFRESH_SECRET'),
      {
        ...this.baseOptions(this.config.get('JWT_REFRESH_EXPIRES_IN')),
        subject: input.userId,
      },
    );

    const decoded = jwt.decode(token) as JwtPayload | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 30 * 86_400_000);

    return { token, jti, expiresAt };
  }

  private verify<T>(token: string, secret: string, expectedType: 'access' | 'refresh'): T {
    let decoded: unknown;
    try {
      decoded = jwt.verify(token, secret, { issuer: ISSUER, audience: AUDIENCE });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token has expired', 'TOKEN_EXPIRED');
      }
      throw new UnauthorizedError('Invalid token', 'TOKEN_INVALID');
    }

    if (typeof decoded !== 'object' || decoded === null) {
      throw new UnauthorizedError('Invalid token', 'TOKEN_INVALID');
    }

    const payload = decoded as Record<string, unknown>;
    // A refresh token must never be accepted where an access token is expected.
    if (payload.type !== expectedType) {
      throw new UnauthorizedError('Invalid token type', 'TOKEN_INVALID');
    }
    if (typeof payload.sub !== 'string' || typeof payload.organizationId !== 'string') {
      throw new UnauthorizedError('Invalid token payload', 'TOKEN_INVALID');
    }

    return payload as T;
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.verify<AccessTokenPayload>(token, this.config.get('JWT_SECRET'), 'access');
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return this.verify<RefreshTokenPayload>(
      token,
      this.config.get('JWT_REFRESH_SECRET'),
      'refresh',
    );
  }

  /** Seconds until the access token expires — handed to the client so it can pre-refresh. */
  accessTokenTtlSeconds(token: string): number {
    const decoded = jwt.decode(token) as JwtPayload | null;
    if (!decoded?.exp) return 0;
    return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
  }
}
