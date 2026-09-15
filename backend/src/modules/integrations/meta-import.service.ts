import { logger } from '../../config/logger';
import { prisma } from '../../database/prisma';
import { Channel, MessageType } from '../../generated/prisma/enums';
import type { NormalizedAttachment, NormalizedMessage } from '../../channels';
import {
  fetchRecentConversations,
  type MetaPlatform,
  type MetaThread,
} from '../../channels/meta/meta.oauth';
import {
  ingestNormalizedMessage,
  type ResolvedIntegration,
} from '../conversations/conversation.ingest';

/**
 * Backfilling the threads that already exist on a Page or Instagram account.
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
export function toNormalizedMessages(
  thread: MetaThread,
  /** The inbox id messages are attributed to: a Page id, or an IG account id. */
  inboxId: string,
  channel: Channel = Channel.FACEBOOK,
  /** Every id that counts as the business, used to decide message direction. */
  selfIds: string[] = [inboxId],
): NormalizedMessage[] {
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

    // The business is one participant and the customer the other, so the
    // sender id is the whole direction check. Instagram reports the IG account
    // id here rather than the Page id, which is why the caller passes the full
    // set rather than a single id.
    const isFromPage = Boolean(message.fromId && selfIds.includes(message.fromId));

    normalized.push({
      channel,
      externalPageId: inboxId,
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
        provider: channel.toLowerCase(),
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
export interface ImportHistoryInput {
  integration: ResolvedIntegration;
  /** The Page whose conversations edge is read — a Page id for both channels. */
  pageId: string;
  /**
   * The inbox messages are attributed to. The Page id for Messenger, the
   * Instagram account id for Instagram Direct, because that is what the
   * webhook reports and what resolves the integration.
   */
  inboxId: string;
  accessToken: string;
  channel: Channel;
  limits?: { threadLimit: number; messageLimit: number };
}

export async function importRecentHistory(input: ImportHistoryInput): Promise<ImportSummary> {
  const { integration, pageId, inboxId, accessToken, channel } = input;
  const limits = input.limits ?? DEFAULT_IMPORT_LIMITS;
  const platform: MetaPlatform = channel === Channel.INSTAGRAM ? 'instagram' : 'messenger';

  // Both ids count as the business: a Messenger thread reports the Page as
  // sender, an Instagram thread reports the IG account.
  const selfIds = Array.from(new Set([pageId, inboxId]));

  const summary: ImportSummary = { threads: 0, messagesCreated: 0, duplicates: 0, failures: 0 };

  let threads: MetaThread[];
  try {
    threads = await fetchRecentConversations({
      pageId,
      accessToken,
      platform,
      selfIds,
      threadLimit: limits.threadLimit,
      messageLimit: limits.messageLimit,
    });
  } catch (error) {
    logger.warn(
      { err: error, integrationId: integration.id, pageId, platform },
      'Meta history import could not read conversations; live messages are unaffected',
    );
    summary.failures += 1;
    return summary;
  }

  summary.threads = threads.length;

  for (const thread of threads) {
    for (const normalized of toNormalizedMessages(thread, inboxId, channel, selfIds)) {
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

  logger.info(
    { integrationId: integration.id, pageId, inboxId, channel, ...summary },
    'Meta history import finished',
  );
  return summary;
}
