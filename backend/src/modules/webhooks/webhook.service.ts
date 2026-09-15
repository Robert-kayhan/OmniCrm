import { prisma } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import {
  IntegrationStatus,
  MessageStatus,
  NotificationType,
  WebhookEventStatus,
} from '../../generated/prisma/enums';
import { logger } from '../../config/logger';
import type {
  MessagingProvider,
  NormalizedEvent,
  NormalizedMessage,
  WebhookParseResult,
} from '../../channels';
import { emitConversationChanged } from '../../realtime';
import { conversationSelect, toConversationDto } from '../conversations/conversation.select';
import { ingestNormalizedMessage, type ResolvedIntegration } from '../conversations/conversation.ingest';
import { getCredentialsForIntegration } from '../integrations/integration.service';
import { createNotification } from '../notifications/notification.service';

/**
 * The webhook pipeline.
 *
 * A delivery is recorded, parsed by its provider, resolved to a tenant and
 * pushed through the same ingest path the dev simulator uses. Nothing here is
 * Facebook-specific: it takes a `MessagingProvider` and works for whichever one
 * owns the route.
 */

export interface WebhookProcessResult {
  received: number;
  created: number;
  duplicates: number;
  unmatched: number;
  failed: number;
}

const EMPTY_RESULT: WebhookProcessResult = {
  received: 0,
  created: 0,
  duplicates: 0,
  unmatched: 0,
  failed: 0,
};

/**
 * Records the raw delivery before anything is parsed.
 *
 * This row is the audit trail: when a customer swears they sent something, the
 * question "did Meta deliver it and what did we do with it" is answerable
 * without provider support. It is written outside the ingest transaction so a
 * processing failure still leaves the evidence behind.
 */
export async function recordWebhookDelivery(input: {
  provider: string;
  eventType: string;
  externalEventId?: string | null;
  payload: unknown;
  integrationId?: string | null;
}): Promise<string | null> {
  try {
    const row = await prisma.webhookEvent.create({
      data: {
        provider: input.provider,
        eventType: input.eventType,
        externalEventId: input.externalEventId ?? null,
        integrationId: input.integrationId ?? null,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        status: WebhookEventStatus.RECEIVED,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    logger.error({ err: error, provider: input.provider }, 'Failed to record webhook delivery');
    return null;
  }
}

async function finishWebhookDelivery(
  webhookEventId: string | null,
  status: WebhookEventStatus,
  error?: string,
): Promise<void> {
  if (!webhookEventId) return;
  try {
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: {
        status,
        processedAt: new Date(),
        attempts: { increment: 1 },
        ...(error ? { error: error.slice(0, 500) } : {}),
      },
    });
  } catch (updateError) {
    logger.error({ err: updateError, webhookEventId }, 'Failed to close webhook delivery');
  }
}

/**
 * Backfills a newly created contact's name and picture.
 *
 * Meta sends a bare PSID, so the first message from a new person lands as
 * "Unknown" until this runs. It is best-effort by design: a missing permission
 * or a rate limit must not fail an ingest that already succeeded.
 */
async function backfillContactProfile(
  provider: MessagingProvider,
  integration: ResolvedIntegration,
  normalized: NormalizedMessage,
  customerId: string,
): Promise<boolean> {
  if (!provider.fetchContactProfile) return false;

  try {
    const credentials = await getCredentialsForIntegration(
      integration.organizationId,
      integration.id,
    );
    const profile = await provider.fetchContactProfile({
      credentials,
      externalUserId: normalized.contact.externalUserId,
    });

    const firstName = profile.firstName?.trim();
    const lastName = profile.lastName?.trim();
    const avatar = profile.avatar ?? null;
    if (!firstName && !lastName && !avatar) return false;

    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customerId },
        data: {
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
          ...(avatar ? { avatar } : {}),
        },
      }),
      prisma.customerChannel.updateMany({
        where: {
          integrationId: integration.id,
          externalUserId: normalized.contact.externalUserId,
        },
        data: {
          ...(profile.username ? { username: profile.username } : {}),
          ...(avatar ? { avatar } : {}),
          ...(profile.profileUrl ? { profileUrl: profile.profileUrl } : {}),
        },
      }),
    ]);

    return true;
  } catch (error) {
    logger.debug(
      { err: error, integrationId: integration.id },
      'Contact profile backfill skipped',
    );
    return false;
  }
}

/**
 * Tells the people who should answer.
 *
 * An assigned conversation notifies its owner. An unassigned one notifies
 * nobody in particular — the inbox itself is the queue, and manufacturing a
 * notification for every agent on every unclaimed message would train them to
 * ignore notifications entirely.
 */
async function notifyForInboundMessage(
  organizationId: string,
  conversationId: string,
  assignedUserId: string | null,
  customerName: string,
  preview: string | null,
): Promise<void> {
  if (!assignedUserId) return;

  // createNotification pushes over the socket itself, so there is exactly one
  // place a notification can be written and exactly one place it is delivered.
  await createNotification({
    organizationId,
    userId: assignedUserId,
    conversationId,
    type: NotificationType.NEW_MESSAGE,
    title: `New message from ${customerName}`,
    message: preview?.slice(0, 160) ?? 'Sent an attachment',
    data: { conversationId },
  });
}

/** Marks our own sent messages as delivered or read when Meta says so. */
async function applyReceipt(event: NormalizedEvent): Promise<void> {
  const mids = event.externalMessageIds ?? [];
  if (mids.length === 0) return;

  const now = event.occurredAt;
  if (event.type === 'DELIVERY') {
    await prisma.message.updateMany({
      where: { externalMessageId: { in: mids }, status: MessageStatus.SENT },
      data: { status: MessageStatus.DELIVERED, deliveredAt: now },
    });
  } else if (event.type === 'READ') {
    await prisma.message.updateMany({
      where: { externalMessageId: { in: mids }, readAt: null },
      data: { status: MessageStatus.READ, readAt: now },
    });
  }
}

/**
 * Resolves one provider inbox to a tenant.
 *
 * The (type, externalPageId) unique index makes this a single lookup with no
 * ambiguity, which is precisely why a webhook can never be attributed to the
 * wrong organization.
 */
async function resolveIntegration(
  provider: MessagingProvider,
  externalPageId: string,
): Promise<ResolvedIntegration | null> {
  const integration = await prisma.integration.findUnique({
    where: {
      type_externalPageId: { type: provider.integrationType, externalPageId },
    },
    select: { id: true, organizationId: true, status: true },
  });

  if (!integration) return null;

  // A disconnected Page is one somebody deliberately switched off. Accepting
  // its traffic anyway would quietly resurrect it.
  if (integration.status === IntegrationStatus.DISCONNECTED) return null;

  return integration;
}

async function processMessage(
  provider: MessagingProvider,
  normalized: NormalizedMessage,
  result: WebhookProcessResult,
): Promise<void> {
  const integration = await resolveIntegration(provider, normalized.externalPageId);
  if (!integration) {
    result.unmatched += 1;
    logger.warn(
      { externalPageId: normalized.externalPageId, channel: normalized.channel },
      'Webhook received for an inbox that is not connected to any workspace',
    );
    return;
  }

  const ingested = await ingestNormalizedMessage(integration, normalized);

  if (!ingested.created) {
    result.duplicates += 1;
    return;
  }
  result.created += 1;

  const { message, conversation } = ingested;
  if (!message || !conversation) return;

  // The message itself was already broadcast by the ingest path. What is left
  // here is the provider-specific follow-up: resolving the bare PSID into a
  // real name, which arrives a moment later and updates the same row.
  let current = conversation;
  if (ingested.customerCreated) {
    const enriched = await backfillContactProfile(
      provider,
      integration,
      normalized,
      conversation.customerId,
    );
    if (enriched) {
      const refreshed = await prisma.conversation.findUnique({
        where: { id: conversation.id },
        select: conversationSelect,
      });
      if (refreshed) {
        current = toConversationDto(refreshed);
        emitConversationChanged(current, 'message');
      }
    }
  }

  if (normalized.direction === 'INBOUND') {
    await notifyForInboundMessage(
      integration.organizationId,
      conversation.id,
      current.assignedUser?.id ?? null,
      current.customer.fullName,
      message.content,
    );
  }
}

/**
 * Runs a parsed delivery into the CRM.
 *
 * Every message is processed independently: one malformed entry in a batch of
 * ten must not cost the other nine, because Meta will not resend the batch.
 */
export async function processWebhookPayload(
  provider: MessagingProvider,
  parsed: WebhookParseResult,
): Promise<WebhookProcessResult> {
  const result: WebhookProcessResult = { ...EMPTY_RESULT };
  result.received = parsed.messages.length;

  for (const normalized of parsed.messages) {
    try {
      await processMessage(provider, normalized, result);
    } catch (error) {
      result.failed += 1;
      logger.error(
        {
          err: error,
          channel: normalized.channel,
          externalMessageId: normalized.externalMessageId,
        },
        'Failed to ingest a webhook message',
      );
    }
  }

  for (const event of parsed.events) {
    try {
      await applyReceipt(event);
    } catch (error) {
      logger.error({ err: error, type: event.type }, 'Failed to apply a webhook receipt');
    }
  }

  return result;
}

/**
 * The full path from raw body to rows, including bookkeeping.
 *
 * Called after the route has already answered Meta with 200. A provider that
 * waits for processing gets retried, and a retry storm during a slow database
 * is worse than a late message.
 */
export async function handleProviderDelivery(
  provider: MessagingProvider,
  payload: unknown,
  webhookEventId: string | null,
): Promise<WebhookProcessResult> {
  try {
    const parsed = await provider.handleWebhook(payload);

    if (parsed.messages.length === 0 && parsed.events.length === 0) {
      await finishWebhookDelivery(webhookEventId, WebhookEventStatus.IGNORED);
      return { ...EMPTY_RESULT };
    }

    const result = await processWebhookPayload(provider, parsed);

    const status =
      result.failed > 0
        ? WebhookEventStatus.FAILED
        : result.created === 0 && result.duplicates > 0
          ? WebhookEventStatus.DUPLICATE
          : WebhookEventStatus.PROCESSED;

    await finishWebhookDelivery(
      webhookEventId,
      status,
      result.failed > 0 ? `${result.failed} of ${result.received} messages failed` : undefined,
    );

    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ err: error, provider: provider.channel }, 'Webhook processing failed');
    await finishWebhookDelivery(webhookEventId, WebhookEventStatus.FAILED, reason);
    return { ...EMPTY_RESULT, failed: 1 };
  }
}
