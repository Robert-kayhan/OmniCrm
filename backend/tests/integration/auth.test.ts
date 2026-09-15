import { describe, expect, it } from 'vitest';
import { api, createActor, createOrganization, TEST_PASSWORD } from '../helpers/factories';
import { UserRole, UserStatus } from '../../src/generated/prisma/enums';
import { prisma } from '../../src/database/prisma';
import { hashPassword } from '../../src/utils/password';

describe('POST /api/auth/login', () => {
  it('issues an access token for valid credentials', async () => {
    const organization = await createOrganization();
    const actor = await createActor({ organizationId: organization.id, role: UserRole.ADMIN });

    const response = await api()
      .post('/api/auth/login')
      .send({ email: actor.email, password: TEST_PASSWORD })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.user.email).toBe(actor.email);
    // The hash must never reach a response body.
    expect(response.body.data.user.password).toBeUndefined();
  });

  it('rejects a wrong password without revealing which field was wrong', async () => {
    const organization = await createOrganization();
    const actor = await createActor({ organizationId: organization.id });

    const response = await api()
      .post('/api/auth/login')
      .send({ email: actor.email, password: 'WrongPassword123!' })
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns the same error for an unknown email', async () => {
    const response = await api()
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', password: TEST_PASSWORD })
      .expect(401);

    expect(response.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('refuses a user who has been invited but not activated', async () => {
    const organization = await createOrganization();
    await prisma.user.create({
      data: {
        organizationId: organization.id,
        name: 'Invited',
        email: 'invited@test.local',
        password: await hashPassword(TEST_PASSWORD),
        role: UserRole.AGENT,
        status: UserStatus.INVITED,
      },
    });

    const response = await api()
      .post('/api/auth/login')
      .send({ email: 'invited@test.local', password: TEST_PASSWORD })
      // 401, not 403: the credentials did not produce a usable session.
      .expect(401);

    expect(response.body.code).toBe('ACCOUNT_INVITED');
  });

  it('validates the request body', async () => {
    const response = await api()
      .post('/api/auth/login')
      .send({ email: 'not-an-email' })
      .expect(422);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the caller derived from the token, not from the request', async () => {
    const organization = await createOrganization();
    const actor = await createActor({ organizationId: organization.id, role: UserRole.MANAGER });

    const response = await api().get('/api/auth/me').set('Authorization', actor.auth).expect(200);

    expect(response.body.data.id).toBe(actor.userId);
    expect(response.body.data.organizationId).toBe(actor.organizationId);
    expect(response.body.data.password).toBeUndefined();
    expect(response.body.data.permissions).toContain('conversation:read:all');
  });

  it('rejects a missing token', async () => {
    const response = await api().get('/api/auth/me').expect(401);
    expect(response.body.code).toBe('TOKEN_MISSING');
  });

  it('rejects a malformed token', async () => {
    await api().get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt').expect(401);
  });
});
