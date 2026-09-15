import { UserRole } from '../generated/prisma/enums';

/**
 * Authorisation is permission-based, not role-based, at the call site. Routes
 * declare the capability they need; roles are only a bundle of capabilities.
 * Adding a role later means editing one map instead of every route.
 */
export const PERMISSIONS = {
  ORG_READ: 'organization:read',
  ORG_UPDATE: 'organization:update',

  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',

  TEAM_READ: 'team:read',
  TEAM_CREATE: 'team:create',
  TEAM_UPDATE: 'team:update',
  TEAM_DELETE: 'team:delete',

  INTEGRATION_READ: 'integration:read',
  INTEGRATION_MANAGE: 'integration:manage',

  CUSTOMER_READ: 'customer:read',
  CUSTOMER_CREATE: 'customer:create',
  CUSTOMER_UPDATE: 'customer:update',
  CUSTOMER_DELETE: 'customer:delete',

  CONVERSATION_READ: 'conversation:read',
  /** Read conversations assigned to somebody else. Agents get the scoped form. */
  CONVERSATION_READ_ALL: 'conversation:read:all',
  CONVERSATION_CREATE: 'conversation:create',
  CONVERSATION_UPDATE: 'conversation:update',
  CONVERSATION_ASSIGN: 'conversation:assign',

  MESSAGE_READ: 'message:read',
  /** Send a reply out through a channel provider, or post an internal message. */
  MESSAGE_SEND: 'message:send',

  TAG_READ: 'tag:read',
  TAG_MANAGE: 'tag:manage',

  NOTE_READ: 'note:read',
  NOTE_CREATE: 'note:create',
  NOTE_DELETE: 'note:delete',

  AUDIT_LOG_READ: 'auditLog:read',
  DEV_TOOLS: 'dev:tools',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const AGENT_PERMISSIONS: Permission[] = [
  PERMISSIONS.ORG_READ,
  PERMISSIONS.USER_READ,
  PERMISSIONS.TEAM_READ,
  PERMISSIONS.INTEGRATION_READ,
  PERMISSIONS.CUSTOMER_READ,
  PERMISSIONS.CUSTOMER_CREATE,
  PERMISSIONS.CUSTOMER_UPDATE,
  PERMISSIONS.CONVERSATION_READ,
  PERMISSIONS.CONVERSATION_CREATE,
  PERMISSIONS.CONVERSATION_UPDATE,
  PERMISSIONS.MESSAGE_READ,
  PERMISSIONS.MESSAGE_SEND,
  PERMISSIONS.TAG_READ,
  PERMISSIONS.NOTE_READ,
  PERMISSIONS.NOTE_CREATE,
];

const MANAGER_PERMISSIONS: Permission[] = [
  ...AGENT_PERMISSIONS,
  PERMISSIONS.CONVERSATION_READ_ALL,
  PERMISSIONS.CONVERSATION_ASSIGN,
  PERMISSIONS.CUSTOMER_DELETE,
  PERMISSIONS.TEAM_CREATE,
  PERMISSIONS.TEAM_UPDATE,
  PERMISSIONS.TAG_MANAGE,
  PERMISSIONS.NOTE_DELETE,
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...MANAGER_PERMISSIONS,
  PERMISSIONS.USER_CREATE,
  PERMISSIONS.USER_UPDATE,
  PERMISSIONS.USER_DELETE,
  PERMISSIONS.TEAM_DELETE,
  PERMISSIONS.INTEGRATION_MANAGE,
  PERMISSIONS.AUDIT_LOG_READ,
];

const SUPER_ADMIN_PERMISSIONS: Permission[] = [
  ...ADMIN_PERMISSIONS,
  PERMISSIONS.ORG_UPDATE,
  PERMISSIONS.DEV_TOOLS,
];

export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  [UserRole.AGENT]: new Set(AGENT_PERMISSIONS),
  [UserRole.MANAGER]: new Set(MANAGER_PERMISSIONS),
  [UserRole.ADMIN]: new Set(ADMIN_PERMISSIONS),
  [UserRole.SUPER_ADMIN]: new Set(SUPER_ADMIN_PERMISSIONS),
};

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function permissionsForRole(role: UserRole): Permission[] {
  return Array.from(ROLE_PERMISSIONS[role] ?? []);
}

/** Ranking used to stop a user from escalating to (or editing) a higher role. */
const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.AGENT]: 1,
  [UserRole.MANAGER]: 2,
  [UserRole.ADMIN]: 3,
  [UserRole.SUPER_ADMIN]: 4,
};

export function roleRank(role: UserRole): number {
  return ROLE_RANK[role] ?? 0;
}

export function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return roleRank(actorRole) >= roleRank(targetRole);
}
