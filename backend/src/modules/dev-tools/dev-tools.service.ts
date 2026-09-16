import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { NormalizedMessage } from '../../channels/types';
import { PrismaService } from '../../database/prisma.service';
import { Channel, IntegrationStatus, IntegrationType } from '../../generated/prisma/enums';
import type { AuthContext } from '../../types/auth';
import {
  ConversationIngestService,
  type IngestResult,
} from '../conversations/conversation.ingest';
import type { SeedSampleDataDto, SimulateInboundDto } from './dto/dev-tools.dto';

/**
 * A per-organization sandbox integration.
 *
 * It carries no access token and is marked PENDING, so the outbound send path
 * refuses it with a clear configuration error rather than silently pretending
 * a message reached Facebook. Simulation covers intake, not delivery.
 */
const SANDBOX_PAGE_PREFIX = 'sandbox-';

const SAMPLE_PEOPLE = [
  { name: 'John Smith', opener: 'Hi, I need help with my recent order.' },
  { name: 'Sarah Wilson', opener: 'What is the price for the premium plan?' },
  { name: 'Mike Chen', opener: 'My delivery has not arrived yet.' },
  { name: 'Priya Nair', opener: 'Do you ship internationally?' },
  { name: 'Diego Martins', opener: 'Can I get a refund on invoice 4471?' },
  { name: 'Amelia Novak', opener: 'Is there a discount for annual billing?' },
];

const SAMPLE_REPLIES = [
  'Thanks for getting back to me.',
  'That works, when can I expect an update?',
  'I have attached the details you asked for.',
  'Still waiting on this one.',
  'Perfect, that answers my question.',
  'Could you escalate this please?',
];

@Injectable()
export class DevToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: ConversationIngestService,
  ) {}

  private async getOrCreateSandboxIntegration(actor: AuthContext, channel: Channel) {
    const type = channel as unknown as IntegrationType;
    const externalPageId = `${SANDBOX_PAGE_PREFIX}${actor.organizationId}-${channel.toLowerCase()}`;

    const existing = await this.prisma.integration.findUnique({
      where: { type_externalPageId: { type, externalPageId } },
      select: { id: true, organizationId: true, status: true },
    });
    if (existing) return existing;

    return this.prisma.integration.create({
      data: {
        organizationId: actor.organizationId,
        type,
        name: `${channel} (sandbox)`,
        status: IntegrationStatus.PENDING,
        externalPageId,
        metadata: { sandbox: true },
      },
      select: { id: true, organizationId: true, status: true },
    });
  }

  async simulateInboundMessage(
    actor: AuthContext,
    input: SimulateInboundDto,
  ): Promise<IngestResult> {
    const integration = input.integrationId
      ? await this.prisma.integration.findFirstOrThrow({
          where: { id: input.integrationId, organizationId: actor.organizationId },
          select: { id: true, organizationId: true, status: true },
        })
      : await this.getOrCreateSandboxIntegration(actor, input.channel);

    const externalUserId = input.externalUserId ?? `sim-${randomUUID()}`;

    const normalized: NormalizedMessage = {
      channel: input.channel,
      externalPageId: `${SANDBOX_PAGE_PREFIX}${actor.organizationId}`,
      externalMessageId: `sim-${randomUUID()}`,
      contact: {
        externalUserId,
        username: input.name ?? null,
      },
      direction: 'INBOUND',
      messageType: input.messageType,
      content: input.content,
      attachments: [],
      sentAt: new Date(),
      metadata: { simulated: true },
    };

    return this.ingest.ingest(integration, normalized);
  }

  /**
   * Fills an empty inbox with believable traffic.
   *
   * Each simulated customer is pushed through the real ingest path one message at
   * a time, so the resulting conversations, unread counts and last-message
   * timestamps are indistinguishable from live ones.
   */
  async seedSampleConversations(
    actor: AuthContext,
    input: SeedSampleDataDto,
  ): Promise<{ conversations: number; messages: number }> {
    const integration = await this.getOrCreateSandboxIntegration(actor, Channel.FACEBOOK);

    let conversations = 0;
    let messages = 0;

    for (let index = 0; index < input.conversations; index += 1) {
      const person = SAMPLE_PEOPLE[index % SAMPLE_PEOPLE.length];
      if (!person) continue;

      const externalUserId = `sim-seed-${actor.organizationId}-${index}`;
      // Spread the threads over the past few days so ordering and date grouping
      // in the UI have something real to do.
      const baseTime = Date.now() - index * 3_600_000 * 7;

      for (let messageIndex = 0; messageIndex < input.messagesPerConversation; messageIndex += 1) {
        const isOpener = messageIndex === 0;
        const content = isOpener
          ? person.opener
          : (SAMPLE_REPLIES[(index + messageIndex) % SAMPLE_REPLIES.length] ?? 'Thanks!');

        const result = await this.ingest.ingest(integration, {
          channel: Channel.FACEBOOK,
          externalPageId: `${SANDBOX_PAGE_PREFIX}${actor.organizationId}`,
          externalMessageId: `sim-seed-${actor.organizationId}-${index}-${messageIndex}`,
          contact: { externalUserId, username: person.name },
          direction: 'INBOUND',
          messageType: 'TEXT',
          content,
          attachments: [],
          sentAt: new Date(baseTime + messageIndex * 60_000),
          metadata: { simulated: true },
        });

        if (result.created) messages += 1;
        if (result.conversationCreated) conversations += 1;
      }
    }

    return { conversations, messages };
  }

  /** Removes everything the simulator created, leaving real data untouched. */
  async resetSimulatedData(
    actor: AuthContext,
  ): Promise<{ customersRemoved: number }> {
    const sandboxIntegrations = await this.prisma.integration.findMany({
      where: {
        organizationId: actor.organizationId,
        externalPageId: { startsWith: SANDBOX_PAGE_PREFIX },
      },
      select: { id: true },
    });

    if (sandboxIntegrations.length === 0) return { customersRemoved: 0 };

    const integrationIds = sandboxIntegrations.map((integration) => integration.id);

    const customerIds = await this.prisma.customerChannel.findMany({
      where: { integrationId: { in: integrationIds } },
      select: { customerId: true },
    });

    // Conversations, messages and channel identities cascade from the customer.
    const removed = await this.prisma.customer.deleteMany({
      where: {
        organizationId: actor.organizationId,
        id: { in: customerIds.map((row) => row.customerId) },
      },
    });

    return { customersRemoved: removed.count };
  }
}
