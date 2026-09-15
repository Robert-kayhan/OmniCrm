import { describe, expect, it } from 'vitest';
import { api, createCustomer, createWorkspace } from '../helpers/factories';
import { prisma } from '../../src/database/prisma';
import { Channel, ConversationStatus } from '../../src/generated/prisma/enums';

async function seedConversation(organizationId: string, overrides: Record<string, unknown> = {}) {
  const customer = await createCustomer(organizationId);
  const conversation = await prisma.conversation.create({
    data: {
      organizationId,
      customerId: customer.id,
      channel: Channel.WEBSITE,
      ...overrides,
    },
  });
  return { customer, conversation };
}

describe('POST /api/conversations', () => {
  it('creates a conversation for a customer', async () => {
    const { admin, organization } = await createWorkspace();
    const customer = await createCustomer(organization.id);

    const response = await api()
      .post('/api/conversations')
      .set('Authorization', admin.auth)
      .send({
        customerId: customer.id,
        channel: 'WEBSITE',
        subject: 'Pricing question',
        priority: 'HIGH',
      })
      .expect(201);

    expect(response.body.data).toMatchObject({
      customerId: customer.id,
      channel: 'WEBSITE',
      subject: 'Pricing question',
      priority: 'HIGH',
      status: 'OPEN',
    });
  });

  it('refuses a customer from another organization', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    const foreign = await createCustomer(alpha.organization.id);

    const response = await api()
      .post('/api/conversations')
      .set('Authorization', beta.admin.auth)
      .send({ customerId: foreign.id, channel: 'WEBSITE' })
      .expect(404);

    expect(response.body.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('records the opening assignment in the history', async () => {
    const { admin, agent, organization } = await createWorkspace();
    const customer = await createCustomer(organization.id);

    const response = await api()
      .post('/api/conversations')
      .set('Authorization', admin.auth)
      .send({ customerId: customer.id, channel: 'EMAIL', assignedUserId: agent.userId })
      .expect(201);

    const history = await prisma.conversationAssignment.findMany({
      where: { conversationId: response.body.data.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ assignedUserId: agent.userId, unassignedAt: null });
  });
});

describe('PATCH /api/conversations/:id/status', () => {
  it('closes a conversation and stamps closedAt', async () => {
    const { admin, organization } = await createWorkspace();
    const { conversation } = await seedConversation(organization.id);

    const response = await api()
      .patch(`/api/conversations/${conversation.id}/status`)
      .set('Authorization', admin.auth)
      .send({ status: 'CLOSED' })
      .expect(200);

    expect(response.body.data.status).toBe('CLOSED');
    expect(response.body.data.closedAt).not.toBeNull();
  });

  it('clears closedAt when a conversation is reopened', async () => {
    const { admin, organization } = await createWorkspace();
    const { conversation } = await seedConversation(organization.id, {
      status: ConversationStatus.CLOSED,
      closedAt: new Date(),
    });

    const response = await api()
      .patch(`/api/conversations/${conversation.id}/status`)
      .set('Authorization', admin.auth)
      .send({ status: 'OPEN' })
      .expect(200);

    expect(response.body.data.closedAt).toBeNull();
  });

  it('rejects an unknown status', async () => {
    const { admin, organization } = await createWorkspace();
    const { conversation } = await seedConversation(organization.id);

    await api()
      .patch(`/api/conversations/${conversation.id}/status`)
      .set('Authorization', admin.auth)
      .send({ status: 'ARCHIVED' })
      .expect(422);
  });
});

describe('POST /api/conversations/:id/read', () => {
  it('clears the unread badge', async () => {
    const { admin, organization } = await createWorkspace();
    const { conversation } = await seedConversation(organization.id, { unreadCount: 4 });

    const response = await api()
      .post(`/api/conversations/${conversation.id}/read`)
      .set('Authorization', admin.auth)
      .expect(200);

    expect(response.body.data.unreadCount).toBe(0);
  });
});

describe('GET /api/conversations/stats', () => {
  it('groups counts by status, channel and priority', async () => {
    const { admin, organization } = await createWorkspace();
    await seedConversation(organization.id, { status: ConversationStatus.OPEN });
    await seedConversation(organization.id, {
      status: ConversationStatus.CLOSED,
      channel: Channel.EMAIL,
    });

    const response = await api()
      .get('/api/conversations/stats')
      .set('Authorization', admin.auth)
      .expect(200);

    expect(response.body.data.total).toBe(2);
    expect(response.body.data.byStatus).toMatchObject({ OPEN: 1, CLOSED: 1 });
    expect(response.body.data.byChannel).toMatchObject({ WEBSITE: 1, EMAIL: 1 });
  });
});
