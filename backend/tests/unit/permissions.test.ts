import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  canManageRole,
  permissionsForRole,
  roleHasPermission,
} from '../../src/config/permissions';
import { UserRole } from '../../src/generated/prisma/enums';

describe('role permissions', () => {
  it('gives every higher role a superset of the one below', () => {
    const agent = new Set(permissionsForRole(UserRole.AGENT));
    const manager = new Set(permissionsForRole(UserRole.MANAGER));
    const admin = new Set(permissionsForRole(UserRole.ADMIN));
    const superAdmin = new Set(permissionsForRole(UserRole.SUPER_ADMIN));

    for (const permission of agent) expect(manager.has(permission)).toBe(true);
    for (const permission of manager) expect(admin.has(permission)).toBe(true);
    for (const permission of admin) expect(superAdmin.has(permission)).toBe(true);
  });

  it('withholds cross-agent visibility from agents', () => {
    expect(roleHasPermission(UserRole.AGENT, PERMISSIONS.CONVERSATION_READ)).toBe(true);
    expect(roleHasPermission(UserRole.AGENT, PERMISSIONS.CONVERSATION_READ_ALL)).toBe(false);
    expect(roleHasPermission(UserRole.MANAGER, PERMISSIONS.CONVERSATION_READ_ALL)).toBe(true);
  });

  it('restricts integration management to admins', () => {
    expect(roleHasPermission(UserRole.MANAGER, PERMISSIONS.INTEGRATION_MANAGE)).toBe(false);
    expect(roleHasPermission(UserRole.ADMIN, PERMISSIONS.INTEGRATION_MANAGE)).toBe(true);
  });

  it('restricts dev tools to the super admin', () => {
    expect(roleHasPermission(UserRole.ADMIN, PERMISSIONS.DEV_TOOLS)).toBe(false);
    expect(roleHasPermission(UserRole.SUPER_ADMIN, PERMISSIONS.DEV_TOOLS)).toBe(true);
  });

  it('stops a role from managing one above it', () => {
    expect(canManageRole(UserRole.ADMIN, UserRole.MANAGER)).toBe(true);
    expect(canManageRole(UserRole.ADMIN, UserRole.ADMIN)).toBe(true);
    // An admin must not be able to edit or create a super admin.
    expect(canManageRole(UserRole.ADMIN, UserRole.SUPER_ADMIN)).toBe(false);
    expect(canManageRole(UserRole.AGENT, UserRole.MANAGER)).toBe(false);
  });
});
