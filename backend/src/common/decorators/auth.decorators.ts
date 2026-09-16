import {
  SetMetadata,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Permission } from '../../config/permissions';
import type { UserRole } from '../../generated/prisma/enums';
import { UnauthorizedError } from '../errors/app.error';
import type { AuthContext } from '../../types/auth';

export const IS_PUBLIC_KEY = 'auth:public';
export const IS_OPTIONAL_AUTH_KEY = 'auth:optional';
export const REQUIRED_PERMISSIONS_KEY = 'auth:permissions:all';
export const ANY_PERMISSIONS_KEY = 'auth:permissions:any';
export const REQUIRED_ROLES_KEY = 'auth:roles';

/**
 * Opens a route to unauthenticated callers.
 *
 * The JwtAuthGuard is registered globally, so authentication is the default and
 * every exception has to say so out loud — a new route added without thinking
 * about auth fails closed with a 401 rather than silently leaking data.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Attaches the caller when a valid token is present and lets the request
 * through when it is not. Used by logout, which must still clear the cookie
 * after the access token has expired.
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);

/** Requires every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

/** Requires at least one of the listed permissions. */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);

/** Role gate, for the rare case where a capability maps to exact roles. */
export const RequireRoles = (...roles: UserRole[]) => SetMetadata(REQUIRED_ROLES_KEY, roles);

/**
 * Injects the verified caller into a handler parameter.
 *
 * Throwing rather than returning `undefined` means a route accidentally left
 * @Public while still asking for the caller fails closed with a 401 instead of
 * running with no tenant scope.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.auth) {
      throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
    }
    return request.auth;
  },
);

/** The caller when there is one, `undefined` when the route is @OptionalAuth. */
export const OptionalUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext | undefined =>
    context.switchToHttp().getRequest<Request>().auth,
);
