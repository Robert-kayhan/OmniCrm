import { Injectable, Logger } from '@nestjs/common';
import type { NormalizedMessage } from '../../channels/types';
import { PrismaService, type Db } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import {
  ConversationStatus,
  CustomerSource,
  IntegrationStatus,
  MessageStatus,
  SenderType,
} from '../../generated/prisma/enums';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { messageSelect, type MessageDto } from '../messages/message.select';
import { conversationSelect, toConversationDto, type ConversationDto } from './conversation.select';

/**
 * The channel-agnostic intake path.
 *
 * Every inbound message from every provider lands here as a `NormalizedMessage`
 * and is turned into CRM rows by exactly this code. Facebook, Instagram, email
 * and website chat differ only in how they produce that struct — which is what
 * keeps "add a channel" from touching the conversation system at all.
 */

export interface IngestResult {
  /** False when the provider redelivered a message we already stored. */
  created: boolean;
  message: MessageDto | null;
  conversation: ConversationDto | null;
  customerCreated: boolean;
  conversationCreated: boolean;
}

const DUPLICATE: IngestResult = {
  created: false,
  message: null,
  conversation: null,
  customerCreated: false,
  conversationCreated: false,
};

export interface ResolvedIntegration {
  id: string;
  organizationId: string;
  status: IntegrationStatus;
}

/**
 * Splits a provider display name into first/last. Providers hand us a single
 * string; the CRM stores two fields because agents search and sort on them.
 */
function splitName(normalized: NormalizedMessage): { firstName: string; lastName: string | null } {
  const { contact } = normalized;
  if (contact.firstName || contact.lastName) {
    return {
      firstName: contact.firstName?.trim() || contact.username?.trim() || 'Unknown',
      lastName: contact.lastName?.trim() || null,
    };
  }

  const display = contact.username?.trim();
  if (!display) {
    // Meta withholds profile details until the person messages the Page and the
    // app holds the right permission. A placeholder keeps the row usable; the
    // profile backfill in the provider layer fills it in when it can.
    return { firstName: 'Unknown', lastName: null };
  }

  const parts = display.split(/\s+/);
  if (parts.length === 1) return { firstName: display, lastName: null };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1] ?? null,
  };
}

function sourceForChannel(normalized: NormalizedMessage): CustomerSource {
  switch (normalized.channel) {
    case 'FACEBOOK':
      return CustomerSource.FACEBOOK;
    case 'INSTAGRAM':
      return CustomerSource.INSTAGRAM;
    case 'EMAIL':
      return CustomerSource.EMAIL;
    case 'WEBSITE':
      return CustomerSource.WEBSITE;
    case 'WHATSAPP':
      return CustomerSource.WHATSAPP;
    default:
      return CustomerSource.MANUAL;
  }
}

/** Lock key for one provider identity: unique per (integration, external user). */
function identityLockKey(integrationId: string, externalUserId: string): string {
  return `ingest:${integrationId}:${externalUserId}`;
}

@Injectable()
export class ConversationIngestService {
  private readonly logger = new Logger(ConversationIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Resolves the provider identity to a CustomerChannel, creating the Customer
   * and the identity row when this person has never written before.
   *
   * The (integrationId, externalUserId) unique index is the single source of
   * truth for "have we seen this person" — no name or email heuristics, so two
   * concurrent webhooks cannot produce two customers for one PSID.
   */
  private async resolveCustomerChannel(
    tx: Db,
    integration: ResolvedIntegration,
    normalized: NormalizedMessage,
  ): Promise<{ customerChannelId: string; customerId: string; customerCreated: boolean }> {
    const existing = await tx.customerChannel.findUnique({
      where: {
        integrationId_externalUserId: {
          integrationId: integration.id,
          externalUserId: normalized.contact.externalUserId,
        },
      },
      select: { id: true, customerId: true, username: true, avatar: true },
    });

    if (existing) {
      // Refresh the display fields when the provider sends better ones, but never
      // overwrite something with nothing.
      const patch: Prisma.CustomerChannelUpdateInput = {};
      if (normalized.contact.username && normalized.contact.username !== existing.username) {
        patch.username = normalized.contact.username;
      }
      if (normalized.contact.avatar && normalized.contact.avatar !== existing.avatar) {
        patch.avatar = normalized.contact.avatar;
      }
      if (Object.keys(patch).length > 0) {
        await tx.customerChannel.update({ where: { id: existing.id }, data: patch });
      }
      return { customerChannelId: existing.id, customerId: existing.customerId, customerCreated: false };
    }

    const { firstName, lastName } = splitName(normalized);

    const customer = await tx.customer.create({
      data: {
        organizationId: integration.organizationId,
        firstName,
        lastName,
        email: normalized.contact.email ?? null,
        phone: normalized.contact.phone ?? null,
        avatar: normalized.contact.avatar ?? null,
        source: sourceForChannel(normalized),
      },
      select: { id: true },
    });

    const channel = await tx.customerChannel.create({
      data: {
        customerId: customer.id,
        integrationId: integration.id,
        channel: normalized.channel,
        externalUserId: normalized.contact.externalUserId,
        username: normalized.contact.username ?? null,
        profileUrl: normalized.contact.profileUrl ?? null,
        avatar: normalized.contact.avatar ?? null,
      },
      select: { id: true },
    });

    return { customerChannelId: channel.id, customerId: customer.id, customerCreated: true };
  }

  /**
   * Finds the live conversation for this identity, or opens one.
   *
   * A CLOSED conversation is left closed and a new one is opened, so a resolved
   * ticket stays resolved and reporting on time-to-close keeps its meaning. A
   * PENDING one is reused — it is still the same open issue.
   */
  private async resolveConversation(
    tx: Db,
    integration: ResolvedIntegration,
    normalized: NormalizedMessage,
    customerChannelId: string,
    customerId: string,
  ): Promise<{ conversationId: string; conversationCreated: boolean }> {
    const open = await tx.conversation.findFirst({
      where: {
        customerChannelId,
        status: { in: [ConversationStatus.OPEN, ConversationStatus.PENDING] },
      },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });

    if (open) return { conversationId: open.id, conversationCreated: false };

    const created = await tx.conversation.create({
      data: {
        organizationId: integration.organizationId,
        customerId,
        integrationId: integration.id,
        customerChannelId,
        channel: normalized.channel,
        subject: normalized.subject ?? null,
        status: ConversationStatus.OPEN,
      },
      select: { id: true },
    });

    return { conversationId: created.id, conversationCreated: true };
  }

  /**
   * Persists one normalized message.
   *
   * Idempotency has two layers. The cheap pre-check short-circuits the common
   * redelivery, and the unique index on `externalMessageId` catches the race
   * where two webhook deliveries arrive at once — Meta retries aggressively, so
   * this is a real case, not a theoretical one.
   */
  async ingest(
    integration: ResolvedIntegration,
    normalized: NormalizedMessage,
  ): Promise<IngestResult> {
    if (normalized.externalMessageId) {
      const seen = await this.prisma.message.findUnique({
        where: { externalMessageId: normalized.externalMessageId },
        select: { id: true },
      });
      if (seen) {
        this.logger.debug(
          { externalMessageId: normalized.externalMessageId, channel: normalized.channel },
          'Skipping duplicate inbound message',
        );
        return DUPLICATE;
      }
    }

    const isInbound = normalized.direction === 'INBOUND';

    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        // Serialise ingest per sender.
        //
        // Without this, two messages from the same person arriving at once both
        // see "no open conversation" and each create one, or both try to create
        // the customer and the loser dies on the unique index. The lock is keyed
        // on the provider identity, so traffic from different people stays fully
        // parallel, and it is released when the transaction ends.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identityLockKey(
          integration.id,
          normalized.contact.externalUserId,
        )}, 0))`;

        const { customerChannelId, customerId, customerCreated } = await this.resolveCustomerChannel(
          tx,
          integration,
          normalized,
        );

        const { conversationId, conversationCreated } = await this.resolveConversation(
          tx,
          integration,
          normalized,
          customerChannelId,
          customerId,
        );

        const message = await tx.message.create({
          data: {
            conversationId,
            organizationId: integration.organizationId,
            // An OUTBOUND echo is something the business sent from the provider's
            // own inbox, so it is attributed to no CRM user.
            senderType: isInbound ? SenderType.CUSTOMER : SenderType.AGENT,
            externalMessageId: normalized.externalMessageId,
            messageType: normalized.messageType,
            content: normalized.content,
            isInternal: false,
            status: MessageStatus.DELIVERED,
            deliveredAt: normalized.sentAt,
            createdAt: normalized.sentAt,
            ...(normalized.metadata
              ? { metadata: normalized.metadata as Prisma.InputJsonValue }
              : {}),
            ...(normalized.attachments.length > 0
              ? {
                  attachments: {
                    create: normalized.attachments.map((attachment) => ({
                      type: attachment.type,
                      url: attachment.url,
                      name: attachment.name ?? null,
                      mimeType: attachment.mimeType ?? null,
                      externalId: attachment.externalId ?? null,
                    })),
                  },
                }
              : {}),
          },
          select: messageSelect,
        });

        await tx.conversation.update({
          where: { id: conversationId },
          data: {
            lastMessageAt: normalized.sentAt,
            ...(isInbound
              ? {
                  lastCustomerMessageAt: normalized.sentAt,
                  unreadCount: { increment: 1 },
                  // A customer reply on a resolved thread is not possible here
                  // (a closed thread spawns a new conversation), but a PENDING
                  // thread becomes OPEN again because the ball is back with us.
                  status: ConversationStatus.OPEN,
                }
              : {}),
          },
        });

        const conversation = await tx.conversation.findUnique({
          where: { id: conversationId },
          select: conversationSelect,
        });

        return {
          created: true,
          message,
          conversation: conversation ? toConversationDto(conversation) : null,
          customerCreated,
          conversationCreated,
        } satisfies IngestResult;
      });

      /**
       * Broadcast from the intake path itself, not from each caller.
       *
       * A webhook and the dev simulator both land here, so emitting once at the
       * bottom of ingest is what guarantees the two can never drift — a message
       * that reached the database has reached the connected agents.
       */
      if (outcome.created && outcome.message) {
        this.realtime.emitMessageCreated(
          integration.organizationId,
          outcome.message,
          outcome.conversation,
        );
        if (outcome.conversation) {
          this.realtime.emitConversationChanged(
            outcome.conversation,
            outcome.conversationCreated ? 'created' : 'message',
          );
        }
      }

      return outcome;
    } catch (error) {
      // Lost the race against a concurrent delivery of the same message.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.debug(
          { externalMessageId: normalized.externalMessageId },
          'Concurrent duplicate inbound message ignored',
        );
        return DUPLICATE;
      }
      throw error;
    }
  }
}
