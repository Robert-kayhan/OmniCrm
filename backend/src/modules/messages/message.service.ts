import { Injectable, Logger } from '@nestjs/common';
import { ChannelRegistryService } from '../../channels/channel-registry.service';
import type { OutboundAttachment, SendMessageResult } from '../../channels/types';
import { buildCursorPage } from '../../common/dto/pagination.dto';
import { BadRequestError, ProviderError } from '../../common/errors/app.error';
import type { CursorMeta } from '../../common/http/api-response';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { MessageStatus, MessageType, SenderType } from '../../generated/prisma/enums';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import type { AuthContext } from '../../types/auth';
import { ConversationAccessService } from '../conversations/conversation.access';
import { conversationSelect, toConversationDto } from '../conversations/conversation.select';
import { IntegrationService } from '../integrations/integration.service';
import type { ListMessagesQueryDto, SendMessageDto } from './dto/message.dto';
import { messageSelect, type MessageDto } from './message.select';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConversationAccessService,
    private readonly integrations: IntegrationService,
    private readonly channels: ChannelRegistryService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Chat history is cursor-paginated: rows arrive at the head constantly, so an
   * offset would skip or repeat messages between requests.
   *
   * Rows are fetched newest-first (that is the page the UI opens on) and then
   * reversed so the caller receives them in reading order.
   */
  async list(
    actor: AuthContext,
    conversationId: string,
    query: ListMessagesQueryDto,
  ): Promise<{ items: MessageDto[]; meta: CursorMeta }> {
    await this.access.assertAccess(actor, conversationId);

    const where: Prisma.MessageWhereInput = {
      conversationId,
      ...(query.includeInternal ? {} : { isInternal: false }),
    };

    const rows = await this.prisma.message.findMany({
      where,
      // One extra row tells us whether an older page exists.
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: messageSelect,
    });

    const page = buildCursorPage(rows, query.limit);

    return {
      items: [...page.items].reverse(),
      meta: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: query.limit },
    };
  }

  /** Highest-fidelity type for a mixed message: attachments win over plain text. */
  private resolveMessageType(input: SendMessageDto): MessageType {
    const first = input.attachments?.[0];
    if (!first) return MessageType.TEXT;
    return first.type;
  }

  private async touchConversationOutbound(conversationId: string, sentAt: Date): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: sentAt },
    });
  }

  /**
   * Pushes a message the agent just sent to everyone watching.
   *
   * The sender's own client sees it twice — once as the HTTP response, once over
   * the socket — and dedupes on message id. That is deliberate: the alternative,
   * excluding the sender's socket, breaks the common case of one agent with the
   * inbox open in two tabs.
   */
  private async broadcastOutbound(organizationId: string, message: MessageDto): Promise<void> {
    const row = await this.prisma.conversation.findUnique({
      where: { id: message.conversationId },
      select: conversationSelect,
    });
    const conversation = row ? toConversationDto(row) : null;

    this.realtime.emitMessageCreated(organizationId, message, conversation);
    if (conversation && !message.isInternal) {
      this.realtime.emitConversationChanged(conversation, 'message');
    }
  }

  /**
   * Sends an agent reply.
   *
   * Ordering matters here. Everything that can fail without leaving a trace —
   * access, channel support, credentials — is checked before any row is written.
   * Only then is a PENDING message persisted and handed to the provider, so a
   * provider outage leaves a visible FAILED message in the thread rather than a
   * silently dropped reply.
   */
  async send(
    actor: AuthContext,
    conversationId: string,
    input: SendMessageDto,
  ): Promise<MessageDto> {
    const conversation = await this.access.assertAccess(actor, conversationId);
    const messageType = this.resolveMessageType(input);
    const attachments = input.attachments ?? [];

    // Internal notes never touch a provider — no integration lookup, no send.
    if (input.isInternal) {
      const created = await this.prisma.message.create({
        data: {
          conversationId,
          organizationId: conversation.organizationId,
          senderType: SenderType.AGENT,
          senderUserId: actor.userId,
          messageType,
          content: input.content ?? null,
          isInternal: true,
          status: MessageStatus.SENT,
          ...(attachments.length > 0
            ? {
                attachments: {
                  create: attachments.map((attachment) => ({
                    type: attachment.type,
                    url: attachment.url,
                    name: attachment.name ?? null,
                  })),
                },
              }
            : {}),
        },
        select: messageSelect,
      });

      await this.broadcastOutbound(conversation.organizationId, created);
      return created;
    }

    if (!conversation.integrationId || !conversation.customerChannelId) {
      throw new BadRequestError(
        'This conversation is not connected to a channel, so replies cannot be delivered. Add it as an internal note instead.',
        'CONVERSATION_NOT_DELIVERABLE',
      );
    }

    // Throws 503 with the channel named when no provider is built yet.
    const provider = this.channels.get(conversation.channel);

    const [credentials, customerChannel] = await Promise.all([
      this.integrations.getCredentials(
        conversation.organizationId,
        conversation.integrationId,
      ),
      this.prisma.customerChannel.findUnique({
        where: { id: conversation.customerChannelId },
        select: { externalUserId: true },
      }),
    ]);

    if (!customerChannel) {
      throw new BadRequestError(
        'The customer identity for this conversation is missing',
        'CUSTOMER_CHANNEL_NOT_FOUND',
      );
    }

    // Names the exact missing credential rather than letting the provider 400.
    provider.assertReady(credentials);

    const pending = await this.prisma.message.create({
      data: {
        conversationId,
        organizationId: conversation.organizationId,
        senderType: SenderType.AGENT,
        senderUserId: actor.userId,
        messageType,
        content: input.content ?? null,
        isInternal: false,
        status: MessageStatus.PENDING,
        ...(attachments.length > 0
          ? {
              attachments: {
                create: attachments.map((attachment) => ({
                  type: attachment.type,
                  url: attachment.url,
                  name: attachment.name ?? null,
                })),
              },
            }
          : {}),
      },
      select: { id: true },
    });

    let result: SendMessageResult;
    try {
      result = await provider.sendMessage({
        credentials,
        recipientExternalId: customerChannel.externalUserId,
        content: input.content ?? null,
        attachments: attachments as OutboundAttachment[],
        correlationId: pending.id,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown provider error';
      await this.prisma.message.update({
        where: { id: pending.id },
        data: { status: MessageStatus.FAILED, failureReason: reason.slice(0, 500) },
      });
        this.logger.error(
        {
          err: error,
          conversationId,
          messageId: pending.id,
          channel: conversation.channel,
          integrationId: conversation.integrationId,
        },
        'Outbound message failed',
      );
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(`Failed to deliver message: ${reason}`, 'MESSAGE_SEND_FAILED');
    }

    const sentAt = new Date();
    const sent = await this.prisma.message.update({
      where: { id: pending.id },
      data: {
        status: MessageStatus.SENT,
        externalMessageId: result.externalMessageId,
        deliveredAt: sentAt,
        ...(result.metadata ? { metadata: result.metadata as Prisma.InputJsonValue } : {}),
      },
      select: messageSelect,
    });

    await this.touchConversationOutbound(conversationId, sentAt);
    await this.broadcastOutbound(conversation.organizationId, sent);

    return sent;
  }
}
