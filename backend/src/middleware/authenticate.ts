import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '../database/prisma';
import { ROLE_PERMISSIONS } from '../config/permissions';
import { UserStatus } from '../generated/prisma/enums';
import { UnauthorizedError } from '../utils/errors';
import { verifyAccessToken } from '../utils/jwt';
import type { AuthContext } from '../types/auth';

function extractBearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/**
 * Resolves the bearer token to an AuthContext.
 *
 * The user row is re-read on every request rather than trusted from the token,
 * so deactivating a user or changing their role takes effect immediately
 * instead of at the next token expiry.
 */
export async function resolveAuthFromToken(token: string): Promise<AuthContext> {
  const payload = verifyAccessToken(token);

  const user = await prisma.user.findUnique({
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

export const authenticate: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = extractBearerToken(req);
  if (!token) {
    next(new UnauthorizedError('Missing bearer token', 'TOKEN_MISSING'));
    return;
  }

  resolveAuthFromToken(token)
    .then((auth) => {
      req.auth = auth;
      next();
    })
    .catch(next);
};

/** Attaches auth when a valid token is present; never rejects. */
export const optionalAuthenticate: RequestHandler = (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    next();
    return;
  }
  resolveAuthFromToken(token)
    .then((auth) => {
      req.auth = auth;
      next();
    })
    .catch(() => next());
};

/**
 * Narrows `req.auth` for controllers. Throwing here rather than returning
 * `undefined` means a route accidentally mounted without `authenticate` fails
 * closed with a 401 instead of leaking data.
 */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
  }
  return req.auth;
}
