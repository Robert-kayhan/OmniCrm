import { describe, expect, it } from 'vitest';
import { api, createCustomer, createWorkspace, db } from '../helpers/factories';
import { Channel, IntegrationType, SenderType } from '../../src/generated/prisma/enums';

async function seedConversation(organizationId: string) {
  const customer = await createCustomer(organizationId);
  const conversation = await db().conversation.create({
    data: { organizationId, customerId: customer.id, channel: Channel.WEBSITE },
  });
  return { customer, conversation };
}

describe('POST /api/conversations/:id/messages', () => {
  it('stores an internal note without contacting a provider', async () => {
    const { admin, organization } = await createWorkspace();
    const { conversation } = await seedConversation(organization.id);

    const response = await api()
      .post(`/api/conversations/${conversation.id}/messages`)
      .set('Authorization', admin.auth)
      .send({ content: 'Wants annual billing. Follow up tomorrow.', isInternal: true })
      .expect(201);

    expect(response.body.data).toMatchObject({
      isInternal: true,
      senderType: SenderType.AGENT,
      status: 'SENT',
    });
    expect(response.body.data.sender.id).toBe(admin.userId);
  });

  it('refuses an outbound reply when the conversation has no channel binding', async () => {
    const { admin, organization } = await createWorkspace();
    const { conversation } = await seedConversation(organization.id);

    const response = await api()
      .post(`/api/conversations/${conversation.id}/messages`)
      .set('Authorization', admin.auth)
      .send({ content: 'Hello there' })
      .expect(400);

    expect(response.body.code).toBe('CONVERSATION_NOT_DELIVERABLE');
    // Nothing is persisted when delivery was never possible.
    expect(await db().message.count({ where: { conversationId: conversation.id } })).toBe(0);
  });

  it('reports a clear configuration error when the channel has no provider', async () => {
    const { admin, organization } = await createWorkspace();
    const customer = await createCustomer(organization.id);

    // WhatsApp deliberately: it is a channel the product knows about but has
    // no provider for. Facebook and Instagram would both reach a real provider
    // and fail later, on the missing token, which is a different error.
    const integration = await db().integration.create({
      data: {
        organizationId: organization.id,
        type: IntegrationType.WHATSAPP,
        name: 'Test WhatsApp',
        status: 'CONNECTED',
        externalPageId: `wa-${Date.now()}`,
      },
    });
    const customerChannel = await db().customerChannel.create({
      data: {
        customerId: customer.id,
        integrationId: integration.id,
        channel: Channel.WHATSAPP,
        externalUserId: 'wa-1',
      },
    });
    const conversation = await db().conversation.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        channel: Channel.WHATSAPP,
        integrationId: integration.id,
        customerChannelId: customerChannel.id,
      },
    });

    const response = await api()
      .post(`/api/conversations/${conversation.id}/messages`)
      .set('Authorization', admin.auth)
      .send({ content: 'Hi' })
      .expect(503);

    // The API says the channel is unavailable rather than pretending it sent.
    expect(response.body.code).toBe('CHANNEL_NOT_SUPPORTED');
    expect(await db().message.count({ where: { conversationId: conversation.id } })).toBe(0);
  });

  it('requires content or an attachment', async () => {
    const { admin, organization } = await createWorkspace();
    const { conversation } = await seedConversation(organization.id);

    await api()
      .post(`/api/conversations/${conversation.id}/messages`)
      .set('Authorization', admin.auth)
      .send({ isInternal: true })
      .expect(422);
  });

  it('refuses to post into another organization conversation', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    const { conversation } = await seedConversation(alpha.organization.id);

    await api()
      .post(`/api/conversations/${conversation.id}/messages`)
      .set('Authorization', beta.admin.auth)
      .send({ content: 'leak', isInternal: true })
      .expect(404);
  });
});

describe('GET /api/conversations/:id/messages', () => {
  it('returns messages oldest-first with a cursor', async () => {
    const { admin, organization } = await createWorkspace();
    const { conversation } = await seedConversation(organization.id);

    for (let index = 0; index < 5; index += 1) {
      await db().message.create({
        data: {
          conversationId: conversation.id,
          organizationId: organization.id,
          senderType: SenderType.CUSTOMER,
          content: `message ${index}`,
          createdAt: new Date(Date.now() + index * 1000),
        },
      });
    }

    const firstPage = await api()
      .get(`/api/conversations/${conversation.id}/messages?limit=2`)
      .set('Authorization', admin.auth)
      .expect(200);

    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.meta.hasMore).toBe(true);
    // Newest page, in reading order.
    expect(firstPage.body.data[0].content).toBe('message 3');
    expect(firstPage.body.data[1].content).toBe('message 4');

    const secondPage = await api()
      .get(
        `/api/conversations/${conversation.id}/messages?limit=2&cursor=${firstPage.body.meta.nextCursor}`,
      )
      .set('Authorization', admin.auth)
      .expect(200);

    expect(secondPage.body.data.map((m: { content: string }) => m.content)).toEqual([
      'message 1',
      'message 2',
    ]);
  });

  it('can hide internal notes to preview the customer view', async () => {
    const { admin, organization } = await createWorkspace();
    const { conversation } = await seedConversation(organization.id);

    await db().message.createMany({
      data: [
        {
          conversationId: conversation.id,
          organizationId: organization.id,
          senderType: SenderType.CUSTOMER,
          content: 'public',
        },
        {
          conversationId: conversation.id,
          organizationId: organization.id,
          senderType: SenderType.AGENT,
          content: 'private note',
          isInternal: true,
        },
      ],
    });

    const all = await api()
      .get(`/api/conversations/${conversation.id}/messages`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(all.body.data).toHaveLength(2);

    const publicOnly = await api()
      .get(`/api/conversations/${conversation.id}/messages?includeInternal=false`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(publicOnly.body.data).toHaveLength(1);
    expect(publicOnly.body.data[0].content).toBe('public');
  });
});
