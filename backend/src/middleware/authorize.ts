import type { RequestHandler } from 'express';
import type { Permission } from '../config/permissions';
import type { UserRole } from '../generated/prisma/enums';
import { ForbiddenError } from '../utils/errors';
import { getAuth } from './authenticate';

/** Requires every listed permission. */
export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    try {
      const auth = getAuth(req);
      const missing = permissions.filter((permission) => !auth.permissions.has(permission));
      if (missing.length > 0) {
        next(
          new ForbiddenError(
            `Missing required permission: ${missing.join(', ')}`,
            'INSUFFICIENT_PERMISSIONS',
          ),
        );
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Requires at least one of the listed permissions. */
export function requireAnyPermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    try {
      const auth = getAuth(req);
      if (!permissions.some((permission) => auth.permissions.has(permission))) {
        next(
          new ForbiddenError(
            `Requires one of: ${permissions.join(', ')}`,
            'INSUFFICIENT_PERMISSIONS',
          ),
        );
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Role gate, for the rare case where a capability maps to exact roles. */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    try {
      const auth = getAuth(req);
      if (!roles.includes(auth.role)) {
        next(new ForbiddenError('Your role cannot perform this action', 'INSUFFICIENT_ROLE'));
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
