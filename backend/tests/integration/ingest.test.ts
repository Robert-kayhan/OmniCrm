import { describe, expect, it } from 'vitest';
import { createWorkspace } from '../helpers/factories';
import { prisma } from '../../src/database/prisma';
import { Channel, IntegrationStatus, IntegrationType } from '../../src/generated/prisma/enums';
import {
  ingestNormalizedMessage,
  type ResolvedIntegration,
} from '../../src/modules/conversations/conversation.ingest';
import type { NormalizedMessage } from '../../src/channels';

/**
 * These exercise the channel-agnostic intake path directly. Every provider
 * webhook funnels into `ingestNormalizedMessage`, so the guarantees proven here
 * (one customer per identity, one message per provider id) hold for Facebook,
 * Instagram, email and website chat alike.
 */
async function seedIntegration(organizationId: string): Promise<ResolvedIntegration> {
  return prisma.integration.create({
    data: {
      organizationId,
      type: IntegrationType.FACEBOOK,
      name: 'Test Page',
      status: IntegrationStatus.CONNECTED,
      externalPageId: `page-${Math.random().toString(36).slice(2)}`,
    },
    select: { id: true, organizationId: true, status: true },
  });
}

function inbound(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    channel: Channel.FACEBOOK,
    externalPageId: 'page-1',
    externalMessageId: `mid-${Math.random().toString(36).slice(2)}`,
    contact: { externalUserId: 'psid-100', username: 'John Smith' },
    direction: 'INBOUND',
    messageType: 'TEXT',
    content: 'Hello there',
    attachments: [],
    sentAt: new Date(),
    ...overrides,
  };
}

describe('inbound message ingestion', () => {
  it('creates the customer, identity, conversation and message on first contact', async () => {
    const { organization } = await createWorkspace();
    const integration = await seedIntegration(organization.id);

    const result = await ingestNormalizedMessage(integration, inbound());

    expect(result.created).toBe(true);
    expect(result.customerCreated).toBe(true);
    expect(result.conversationCreated).toBe(true);
    expect(result.message?.content).toBe('Hello there');
    expect(result.message?.senderType).toBe('CUSTOMER');

    const customer = await prisma.customer.findFirstOrThrow({
      where: { organizationId: organization.id },
    });
    expect(customer.firstName).toBe('John');
    expect(customer.lastName).toBe('Smith');
    expect(customer.source).toBe('FACEBOOK');

    const channel = await prisma.customerChannel.findFirstOrThrow({
      where: { customerId: customer.id },
    });
    expect(channel.externalUserId).toBe('psid-100');
  });

  it('reuses the customer and conversation on the next message', async () => {
    const { organization } = await createWorkspace();
    const integration = await seedIntegration(organization.id);

    await ingestNormalizedMessage(integration, inbound());
    const second = await ingestNormalizedMessage(integration, inbound({ content: 'Still there?' }));

    expect(second.created).toBe(true);
    expect(second.customerCreated).toBe(false);
    expect(second.conversationCreated).toBe(false);

    expect(await prisma.customer.count({ where: { organizationId: organization.id } })).toBe(1);
    expect(await prisma.conversation.count({ where: { organizationId: organization.id } })).toBe(1);
    expect(await prisma.message.count({ where: { organizationId: organization.id } })).toBe(2);
  });

  it('ignores a redelivered webhook with the same provider message id', async () => {
    const { organization } = await createWorkspace();
    const integration = await seedIntegration(organization.id);
    const message = inbound();

    const first = await ingestNormalizedMessage(integration, message);
    const replay = await ingestNormalizedMessage(integration, message);

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.message).toBeNull();
    expect(await prisma.message.count({ where: { organizationId: organization.id } })).toBe(1);
  });

  it('survives two identical deliveries racing each other', async () => {
    const { organization } = await createWorkspace();
    const integration = await seedIntegration(organization.id);
    const message = inbound();

    // Both pass the pre-check; the unique index decides the winner.
    const results = await Promise.all([
      ingestNormalizedMessage(integration, message),
      ingestNormalizedMessage(integration, message),
    ]);

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await prisma.message.count({ where: { organizationId: organization.id } })).toBe(1);
  });

  it('increments the unread counter and stamps the customer timestamp', async () => {
    const { organization } = await createWorkspace();
    const integration = await seedIntegration(organization.id);

    await ingestNormalizedMessage(integration, inbound());
    await ingestNormalizedMessage(integration, inbound());

    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { organizationId: organization.id },
    });
    expect(conversation.unreadCount).toBe(2);
    expect(conversation.lastCustomerMessageAt).not.toBeNull();
    expect(conversation.lastMessageAt).not.toBeNull();
  });

  it('opens a new conversation when the previous one was closed', async () => {
    const { organization } = await createWorkspace();
    const integration = await seedIntegration(organization.id);

    await ingestNormalizedMessage(integration, inbound());
    await prisma.conversation.updateMany({
      where: { organizationId: organization.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    const second = await ingestNormalizedMessage(integration, inbound({ content: 'New issue' }));

    expect(second.conversationCreated).toBe(true);
    expect(await prisma.conversation.count({ where: { organizationId: organization.id } })).toBe(2);
    // The resolved thread stays resolved.
    expect(
      await prisma.conversation.count({
        where: { organizationId: organization.id, status: 'CLOSED' },
      }),
    ).toBe(1);
  });

  it('keeps two identities on separate integrations apart', async () => {
    const { organization } = await createWorkspace();
    const first = await seedIntegration(organization.id);
    const second = await prisma.integration.create({
      data: {
        organizationId: organization.id,
        type: IntegrationType.INSTAGRAM,
        name: 'IG',
        status: IntegrationStatus.CONNECTED,
        externalPageId: `ig-${Math.random().toString(36).slice(2)}`,
      },
      select: { id: true, organizationId: true, status: true },
    });

    await ingestNormalizedMessage(first, inbound());
    await ingestNormalizedMessage(
      second,
      inbound({ channel: Channel.INSTAGRAM, contact: { externalUserId: 'psid-100' } }),
    );

    // The same raw id on two providers is two different people.
    expect(await prisma.customer.count({ where: { organizationId: organization.id } })).toBe(2);
  });

  it('attributes a provider echo of an outbound message to the agent side', async () => {
    const { organization } = await createWorkspace();
    const integration = await seedIntegration(organization.id);

    const result = await ingestNormalizedMessage(
      integration,
      inbound({ direction: 'OUTBOUND', content: 'Sent from the Page inbox' }),
    );

    expect(result.message?.senderType).toBe('AGENT');
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { organizationId: organization.id },
    });
    // An outbound echo is not an unread customer message.
    expect(conversation.unreadCount).toBe(0);
  });

  it('stores attachments alongside the message', async () => {
    const { organization } = await createWorkspace();
    const integration = await seedIntegration(organization.id);

    const result = await ingestNormalizedMessage(
      integration,
      inbound({
        messageType: 'IMAGE',
        content: null,
        attachments: [{ type: 'IMAGE', url: 'https://cdn.test/photo.jpg', name: 'photo.jpg' }],
      }),
    );

    expect(result.message?.attachments).toHaveLength(1);
    expect(result.message?.attachments[0]?.url).toBe('https://cdn.test/photo.jpg');
  });

  it('creates one customer and one conversation when a sender first messages twice at once', async () => {
    const { organization } = await createWorkspace();
    const integration = await seedIntegration(organization.id);

    // Two distinct messages (different provider ids, so the dedupe guard does
    // not apply) from a sender we have never seen, arriving together.
    const results = await Promise.all([
      ingestNormalizedMessage(integration, inbound({ content: 'first' })),
      ingestNormalizedMessage(integration, inbound({ content: 'second' })),
    ]);

    expect(results.every((result) => result.created)).toBe(true);
    // Both messages land, but on one customer and one thread.
    expect(await prisma.message.count({ where: { organizationId: organization.id } })).toBe(2);
    expect(await prisma.customer.count({ where: { organizationId: organization.id } })).toBe(1);
    expect(await prisma.conversation.count({ where: { organizationId: organization.id } })).toBe(1);
  });
});
