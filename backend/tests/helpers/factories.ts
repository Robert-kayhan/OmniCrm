import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/database/prisma';
import { UserRole, UserStatus } from '../../src/generated/prisma/enums';
import { hashPassword } from '../../src/utils/password';
import { signAccessToken } from '../../src/utils/jwt';

export const TEST_PASSWORD = 'Password123!';

let app: Express | null = null;

/** One Express instance for the whole run — creating it per test is wasteful. */
export function getApp(): Express {
  app ??= createApp();
  return app;
}

export function api() {
  return request(getApp());
}

export interface TestActor {
  userId: string;
  organizationId: string;
  email: string;
  role: UserRole;
  accessToken: string;
  /** `Authorization: Bearer ...`, ready to hand to supertest. */
  auth: string;
}

let sequence = 0;
function unique(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createOrganization(name = 'Test Org') {
  return prisma.organization.create({
    data: { name, slug: unique('test-org') },
    select: { id: true, name: true, slug: true },
  });
}

/**
 * Creates an active user and mints the access token directly.
 *
 * The token is signed by the same helper the login endpoint uses and is
 * validated by the same middleware, so route tests lose nothing — while
 * skipping a login round trip per fixture user. The login flow itself is
 * covered end to end in `auth.test.ts`, which is where it belongs.
 */
export async function createActor(options: {
  organizationId: string;
  role?: UserRole;
  name?: string;
  email?: string;
}): Promise<TestActor> {
  const role = options.role ?? UserRole.AGENT;
  const email = options.email ?? `${unique('user')}@test.local`;

  const user = await prisma.user.create({
    data: {
      organizationId: options.organizationId,
      name: options.name ?? `Test ${role}`,
      email,
      password: await hashPassword(TEST_PASSWORD),
      role,
      status: UserStatus.ACTIVE,
    },
    select: { id: true, organizationId: true, email: true, role: true },
  });

  const accessToken = signAccessToken({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
  });

  return {
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    role: user.role,
    accessToken,
    auth: `Bearer ${accessToken}`,
  };
}

/** An organization pre-populated with the four roles. */
export async function createWorkspace() {
  const organization = await createOrganization();
  const [admin, manager, agent, otherAgent] = await Promise.all([
    createActor({ organizationId: organization.id, role: UserRole.ADMIN, name: 'Admin' }),
    createActor({ organizationId: organization.id, role: UserRole.MANAGER, name: 'Manager' }),
    createActor({ organizationId: organization.id, role: UserRole.AGENT, name: 'Agent One' }),
    createActor({ organizationId: organization.id, role: UserRole.AGENT, name: 'Agent Two' }),
  ]);
  return { organization, admin, manager, agent, otherAgent };
}

export async function createCustomer(organizationId: string, overrides: Record<string, unknown> = {}) {
  return prisma.customer.create({
    data: {
      organizationId,
      firstName: 'Test',
      lastName: 'Customer',
      email: `${unique('customer')}@test.local`,
      ...overrides,
    },
    select: { id: true, organizationId: true, firstName: true, lastName: true, email: true },
  });
}
