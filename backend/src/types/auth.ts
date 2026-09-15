import type { UserRole } from '../generated/prisma/enums';
import type { Permission } from '../config/permissions';

/**
 * Everything downstream code may know about the caller. `organizationId` comes
 * from the verified token, never from the request body or a header — that is
 * the single mechanism that makes cross-tenant access impossible.
 */
export interface AuthContext {
  userId: string;
  organizationId: string;
  role: UserRole;
  email: string;
  name: string;
  permissions: ReadonlySet<Permission>;
  tokenId: string;
}

export interface AuthenticatedActor {
  userId: string;
  organizationId: string;
  role: UserRole;
}
