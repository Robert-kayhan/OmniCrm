import { describe, expect, it } from 'vitest';
import { api, createActor, createCustomer, createOrganization, createWorkspace } from '../helpers/factories';
import { UserRole } from '../../src/generated/prisma/enums';
import { prisma } from '../../src/database/prisma';
import { Channel } from '../../src/generated/prisma/enums';

describe('multi-tenant isolation', () => {
  it('never returns another organization records in a list', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();

    await createCustomer(alpha.organization.id, { firstName: 'Alpha' });
    await createCustomer(beta.organization.id, { firstName: 'Beta' });

    const response = await api()
      .get('/api/customers')
      .set('Authorization', beta.admin.auth)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].firstName).toBe('Beta');
  });

  it('answers 404, not 403, when reading another organization record by id', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    const victim = await createCustomer(alpha.organization.id);

    // 404 rather than 403: a 403 would confirm the id exists.
    const response = await api()
      .get(`/api/customers/${victim.id}`)
      .set('Authorization', beta.admin.auth)
      .expect(404);

    expect(response.body.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('refuses to mutate another organization record', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    const victim = await createCustomer(alpha.organization.id);

    await api()
      .patch(`/api/customers/${victim.id}`)
      .set('Authorization', beta.admin.auth)
      .send({ firstName: 'Hijacked' })
      .expect(404);

    const unchanged = await prisma.customer.findUnique({ where: { id: victim.id } });
    expect(unchanged?.firstName).toBe('Test');
  });

  it('ignores an organizationId supplied by the client', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();

    const response = await api()
      .post('/api/customers')
      .set('Authorization', beta.admin.auth)
      // The body tries to plant the record in another tenant.
      .send({ firstName: 'Planted', organizationId: alpha.organization.id })
      .expect(201);

    // The organization comes from the token, so the attempt is silently ignored.
    expect(response.body.data.organizationId).toBe(beta.organization.id);
  });
});

describe('role-based authorization', () => {
  it('lets an admin manage integrations but not an agent', async () => {
    const { admin, agent } = await createWorkspace();

    await api().get('/api/integrations').set('Authorization', agent.auth).expect(200);

    const forbidden = await api()
      .post('/api/integrations/facebook')
      .set('Authorization', agent.auth)
      .send({ name: 'Page', pageId: '123456', pageAccessToken: 'x'.repeat(40) })
      .expect(403);
    expect(forbidden.body.code).toBe('INSUFFICIENT_PERMISSIONS');

    // The admin passes authorization and fails later, on configuration.
    const allowed = await api()
      .post('/api/integrations/facebook')
      .set('Authorization', admin.auth)
      .send({ name: 'Page', pageId: '123456', pageAccessToken: 'x'.repeat(40) });
    expect(allowed.status).not.toBe(403);
  });

  it('stops an agent from assigning conversations', async () => {
    const { agent, organization } = await createWorkspace();
    const customer = await createCustomer(organization.id);
    const conversation = await prisma.conversation.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        channel: Channel.WEBSITE,
      },
    });

    await api()
      .post(`/api/conversations/${conversation.id}/assign`)
      .set('Authorization', agent.auth)
      .send({ assignedUserId: agent.userId })
      .expect(403);
  });

  it('hides conversations owned by another agent', async () => {
    const { organization, agent, otherAgent, manager } = await createWorkspace();
    const customer = await createCustomer(organization.id);

    await prisma.conversation.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        channel: Channel.WEBSITE,
        assignedUserId: otherAgent.userId,
      },
    });

    const asAgent = await api()
      .get('/api/conversations')
      .set('Authorization', agent.auth)
      .expect(200);
    expect(asAgent.body.data).toHaveLength(0);

    // A manager holds conversation:read:all and sees everything.
    const asManager = await api()
      .get('/api/conversations')
      .set('Authorization', manager.auth)
      .expect(200);
    expect(asManager.body.data).toHaveLength(1);
  });

  it('shows an agent conversations that are unassigned or theirs', async () => {
    const { organization, agent, otherAgent } = await createWorkspace();
    const customer = await createCustomer(organization.id);

    await prisma.conversation.createMany({
      data: [
        { organizationId: organization.id, customerId: customer.id, channel: Channel.WEBSITE },
        {
          organizationId: organization.id,
          customerId: customer.id,
          channel: Channel.EMAIL,
          assignedUserId: agent.userId,
        },
        {
          organizationId: organization.id,
          customerId: customer.id,
          channel: Channel.FACEBOOK,
          assignedUserId: otherAgent.userId,
        },
      ],
    });

    const response = await api()
      .get('/api/conversations')
      .set('Authorization', agent.auth)
      .expect(200);

    expect(response.body.data).toHaveLength(2);
  });

  it('blocks dev tools for a role without the permission', async () => {
    const organization = await createOrganization();
    const agent = await createActor({ organizationId: organization.id, role: UserRole.AGENT });

    await api()
      .post('/api/dev/simulate/seed')
      .set('Authorization', agent.auth)
      .send({ conversations: 1 })
      .expect(403);
  });
});
