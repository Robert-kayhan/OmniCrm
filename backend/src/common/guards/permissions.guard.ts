import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Permission } from '../../config/permissions';
import type { UserRole } from '../../generated/prisma/enums';
import {
  ANY_PERMISSIONS_KEY,
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_ROLES_KEY,
} from '../decorators/auth.decorators';
import { ForbiddenError, UnauthorizedError } from '../errors/app.error';

/**
 * Enforces the @RequirePermissions / @RequireAnyPermission / @RequireRoles
 * declarations. Runs after JwtAuthGuard, so `request.auth` is populated for any
 * route that declares a requirement.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const targets = [context.getHandler(), context.getClass()];
    const required = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_PERMISSIONS_KEY,
      targets,
    );
    const any = this.reflector.getAllAndOverride<Permission[]>(ANY_PERMISSIONS_KEY, targets);
    const roles = this.reflector.getAllAndOverride<UserRole[]>(REQUIRED_ROLES_KEY, targets);

    if (!required?.length && !any?.length && !roles?.length) return true;

    const auth = context.switchToHttp().getRequest<Request>().auth;
    if (!auth) {
      throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
    }

    if (required?.length) {
      const missing = required.filter((permission) => !auth.permissions.has(permission));
      if (missing.length > 0) {
        throw new ForbiddenError(
          `Missing required permission: ${missing.join(', ')}`,
          'INSUFFICIENT_PERMISSIONS',
        );
      }
    }

    if (any?.length && !any.some((permission) => auth.permissions.has(permission))) {
      throw new ForbiddenError(`Requires one of: ${any.join(', ')}`, 'INSUFFICIENT_PERMISSIONS');
    }

    if (roles?.length && !roles.includes(auth.role)) {
      throw new ForbiddenError('Your role cannot perform this action', 'INSUFFICIENT_ROLE');
    }

    return true;
  }
}
