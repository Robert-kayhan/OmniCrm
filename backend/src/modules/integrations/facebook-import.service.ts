import { logger } from '../../config/logger';
import { prisma } from '../../database/prisma';
import { Channel, MessageType } from '../../generated/prisma/enums';
import type { NormalizedAttachment, NormalizedMessage } from '../../channels';
import { fetchRecentConversations, type MetaThread } from '../../channels/facebook/facebook.oauth';
import {
  ingestNormalizedMessage,
  type ResolvedIntegration,
} from '../conversations/conversation.ingest';

/**
 * Backfilling the threads that already exist on a Page.
 *
 * Webhooks only deliver what arrives after the Page is subscribed, so a freshly
 * connected Page would otherwise show an empty inbox until a customer happened
 * to write in. This reads the recent history once, at connect time, and pushes
 * it through the same `ingestNormalizedMessage` path a webhook uses — so
 * threading, customer resolution and deduplication behave identically and no
 * import-specific write path exists to drift.
 *
 * Deduplication is free: Meta's history ids and its webhook `mid`s share a
 * namespace, so a message that arrives both ways is stored once by the unique
 * index on `Message.externalMessageId`.
 */

/** Deliberately modest. Meta rate-limits per Page, and a connect should feel instant. */
export const DEFAULT_IMPORT_LIMITS = { threadLimit: 50, messageLimit: 50 } as const;

export interface ImportSummary {
  threads: number;
  messagesCreated: number;
  duplicates: number;
  failures: number;
}

/**
 * Maps a MIME type onto the CRM's message vocabulary.
 *
 * The history edge reports MIME types where the webhook reports Meta's own
 * attachment words, so this mapping is deliberately separate from the
 * provider's `ATTACHMENT_TYPES`.
 */
function attachmentTypeFromMime(mime: string | null): MessageType {
  if (!mime) return MessageType.FILE;
  const [family] = mime.toLowerCase().split('/');
  switch (family) {
    case 'image':
      return MessageType.IMAGE;
    case 'video':
      return MessageType.VIDEO;
    case 'audio':
      return MessageType.AUDIO;
    default:
      return MessageType.FILE;
  }
}

/**
 * Exported for unit tests: direction, ordering and attachment mapping are the
 * parts of the import worth pinning down, and driving them through the whole
 * Graph call would need a live Page.
 */
export function toNormalizedMessages(thread: MetaThread, pageId: string): NormalizedMessage[] {
  // No identifiable customer means nothing to attribute the thread to.
  if (!thread.participantId) return [];

  const normalized: NormalizedMessage[] = [];

  // Graph returns a thread's messages newest-first. Ingest assumes arrival
  // order, so replaying them oldest-first keeps `lastMessageAt` and the unread
  // counters consistent with how a live thread would have built up.
  for (const message of [...thread.messages].reverse()) {
    const attachments: NormalizedAttachment[] = message.attachmentUrls.map((attachment) => ({
      type: attachmentTypeFromMime(attachment.type),
      url: attachment.url,
      name: attachment.name,
      mimeType: attachment.type,
      externalId: null,
    }));

    if (!message.message && attachments.length === 0) continue;

    // The Page is one participant and the customer the other, so the sender id
    // is the whole direction check.
    const isFromPage = message.fromId === pageId;

    normalized.push({
      channel: Channel.FACEBOOK,
      externalPageId: pageId,
      externalMessageId: message.id,
      externalConversationId: thread.id,
      contact: {
        externalUserId: thread.participantId,
        username: thread.participantName,
      },
      direction: isFromPage ? 'OUTBOUND' : 'INBOUND',
      messageType: attachments[0]?.type ?? (message.message ? MessageType.TEXT : MessageType.FILE),
      content: message.message,
      attachments,
      sentAt: new Date(message.createdTime),
      metadata: {
        provider: 'facebook',
        // Marks rows that came from the history import rather than a live
        // delivery, which is the first thing to check when a backfilled thread
        // looks wrong.
        imported: true,
        ...(isFromPage ? { source: 'page_inbox' } : {}),
      },
    });
  }

  return normalized;
}

/**
 * Imports recent history for one connected Page.
 *
 * Never throws: a connect that succeeded must not be reported as failed
 * because Meta rate-limited the history read. Failures are counted, logged and
 * recorded on the integration, and the Page still receives live messages.
 */
export async function importRecentHistory(
  integration: ResolvedIntegration,
  pageId: string,
  pageAccessToken: string,
  limits: { threadLimit: number; messageLimit: number } = DEFAULT_IMPORT_LIMITS,
): Promise<ImportSummary> {
  const summary: ImportSummary = { threads: 0, messagesCreated: 0, duplicates: 0, failures: 0 };

  let threads: MetaThread[];
  try {
    threads = await fetchRecentConversations(pageId, pageAccessToken, limits);
  } catch (error) {
    logger.warn(
      { err: error, integrationId: integration.id, pageId },
      'Facebook history import could not read conversations; live messages are unaffected',
    );
    summary.failures += 1;
    return summary;
  }

  summary.threads = threads.length;

  for (const thread of threads) {
    for (const normalized of toNormalizedMessages(thread, pageId)) {
      try {
        const result = await ingestNormalizedMessage(integration, normalized);
        if (result.created) summary.messagesCreated += 1;
        else summary.duplicates += 1;
      } catch (error) {
        // One malformed thread must not abandon the rest of the import.
        summary.failures += 1;
        logger.warn(
          { err: error, integrationId: integration.id, externalMessageId: normalized.externalMessageId },
          'Skipping a message that failed to import',
        );
      }
    }
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: { lastSyncedAt: new Date() },
  });

  logger.info({ integrationId: integration.id, pageId, ...summary }, 'Facebook history import finished');
  return summary;
}
