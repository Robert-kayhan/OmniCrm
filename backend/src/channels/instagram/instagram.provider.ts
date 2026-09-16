import { env } from '../../config/env';
import { Logger } from '@nestjs/common';
import { Channel, IntegrationType, MessageType } from '../../generated/prisma/enums';
import { IntegrationConfigurationError, ProviderError } from '../../common/errors/app.error';
import { verifyMetaSubscription, verifyMetaWebhookSignature } from '../meta/meta.webhook';
import type {
  MetaAttachment,
  MetaEntry,
  MetaMessage,
  MetaMessagingEvent,
  MetaSendResponse,
  MetaWebhookBody,
} from '../meta/meta.types';
import type {
  FetchProfileInput,
  MessagingProvider,
  NormalizedAttachment,
  NormalizedContact,
  NormalizedEvent,
  NormalizedMessage,
  ProviderCredentials,
  SendMessageInput,
  SendMessageResult,
  WebhookParseResult,
  WebhookSignatureInput,
} from '../types';
import type { InstagramProfileResponse } from './instagram.types';

/**
 * Providers are plain adapters rather than Nest providers — they hold no
 * state and touch neither the database nor the container — so the logger is
 * instantiated directly. Nest routes it through the same pino transport as
 * everything else once the application logger is installed.
 */
const logger = new Logger('InstagramProvider');

/**
 * Instagram Direct.
 *
 * Structurally the same integration as Messenger — same Graph API, same app
 * secret, same `entry[].messaging[]` envelope — with four differences that are
 * the whole reason this is a separate provider:
 *
 *   1. The inbox id is the Instagram Professional account id, not the Page id,
 *      so `entry.id` resolves to a different integration row.
 *   2. The webhook `object` is `instagram` rather than `page`.
 *   3. Attachments add `story_mention`, `share` and `ig_reel`, which Messenger
 *      has no equivalent for.
 *   4. Sends omit `messaging_type`, which the Instagram endpoint rejects.
 *
 * The credential is still the *Page* access token: Instagram Direct has none
 * of its own, which is why connecting one always goes through a Page.
 */

/** Meta drops a delivery that has not been answered quickly; fail before it does. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Instagram's attachment vocabulary mapped onto ours.
 *
 * `story_mention` and `share` are Instagram-only and carry a media URL, so
 * they land as IMAGE rather than being dropped — an agent needs to see that
 * someone tagged the account in a story.
 */
const ATTACHMENT_TYPES: Record<string, MessageType> = {
  image: MessageType.IMAGE,
  video: MessageType.VIDEO,
  audio: MessageType.AUDIO,
  file: MessageType.FILE,
  story_mention: MessageType.IMAGE,
  share: MessageType.IMAGE,
  ig_reel: MessageType.VIDEO,
  reel: MessageType.VIDEO,
};

function attachmentType(raw: string | undefined): MessageType {
  if (!raw) return MessageType.FILE;
  return ATTACHMENT_TYPES[raw.toLowerCase()] ?? MessageType.FILE;
}

function toNormalizedAttachments(attachments: MetaAttachment[] | undefined): NormalizedAttachment[] {
  if (!Array.isArray(attachments)) return [];

  const result: NormalizedAttachment[] = [];
  for (const attachment of attachments) {
    const url = attachment?.payload?.url;
    // An attachment with no URL has nothing to store, and a row with an empty
    // href renders as a broken link.
    if (typeof url !== 'string' || url.length === 0) continue;

    result.push({
      type: attachmentType(attachment.type),
      url,
      name: attachment.payload?.title ?? null,
      mimeType: null,
      externalId: attachment.payload?.sticker_id ? String(attachment.payload.sticker_id) : null,
    });
  }
  return result;
}

/** Attachments win over text when reducing a mixed message to one type. */
function resolveMessageType(
  content: string | null,
  attachments: NormalizedAttachment[],
): MessageType {
  const first = attachments[0];
  if (first) return first.type;
  return content ? MessageType.TEXT : MessageType.FILE;
}

/**
 * True when an echo is one of this CRM's own Send API calls coming back.
 *
 * Identical reasoning to Messenger: re-ingesting our own sends would duplicate
 * every agent reply, while an echo *without* our app id is a human replying
 * from the Instagram app and must be kept, or the CRM transcript silently
 * diverges from what the customer actually saw.
 */
function isOwnEcho(message: MetaMessage): boolean {
  if (!message.is_echo) return false;
  if (message.app_id === undefined || message.app_id === null) return false;
  if (!env.META_APP_ID) return false;
  return String(message.app_id) === String(env.META_APP_ID);
}

function messagingEvents(
  body: MetaWebhookBody,
): Array<{ entry: MetaEntry; event: MetaMessagingEvent }> {
  if (!Array.isArray(body.entry)) return [];

  const pairs: Array<{ entry: MetaEntry; event: MetaMessagingEvent }> = [];
  for (const entry of body.entry) {
    if (!Array.isArray(entry?.messaging)) continue;
    for (const event of entry.messaging) {
      if (event) pairs.push({ entry, event });
    }
  }
  return pairs;
}

async function graphFetch<T>(url: string, init: RequestInit, context: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'network error';
    throw new ProviderError(`Instagram ${context} failed: ${reason}`, 'INSTAGRAM_UNREACHABLE');
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  const payload = (parsed ?? {}) as { error?: { message?: string; code?: number } };

  // Meta returns 200 with an `error` object often enough that the status alone
  // is not a reliable success signal.
  if (!response.ok || payload.error) {
    const detail = payload.error?.message ?? `HTTP ${response.status}`;
    throw new ProviderError(`Instagram ${context} failed: ${detail}`, 'INSTAGRAM_API_ERROR', {
      status: response.status,
      code: payload.error?.code,
    });
  }

  return parsed as T;
}

export class InstagramProvider implements MessagingProvider {
  public readonly channel = Channel.INSTAGRAM;
  public readonly integrationType = IntegrationType.INSTAGRAM;
  public readonly displayName = 'Instagram Direct';

  private get graphBase(): string {
    return `${env.META_GRAPH_API_BASE_URL}/${env.META_GRAPH_API_VERSION}`;
  }

  /**
   * The same three process-level credentials as Messenger, because it is the
   * same Meta app: Instagram Direct adds no configuration of its own.
   */
  isConfigured(): boolean {
    return Boolean(env.META_APP_ID && env.META_APP_SECRET && env.META_WEBHOOK_VERIFY_TOKEN);
  }

  assertReady(credentials: ProviderCredentials): void {
    if (!credentials.accessToken) {
      throw new IntegrationConfigurationError(
        'This Instagram account has no stored access token. Reconnect it from Settings, Integrations.',
        'INSTAGRAM_TOKEN_MISSING',
        { integrationId: credentials.integrationId },
      );
    }
    if (!credentials.externalPageId) {
      throw new IntegrationConfigurationError(
        'This Instagram integration is not bound to an account id.',
        'INSTAGRAM_ACCOUNT_ID_MISSING',
        { integrationId: credentials.integrationId },
      );
    }
  }

  /** Shared with Messenger — same app secret, same header. */
  verifyWebhookSignature(input: WebhookSignatureInput): boolean {
    return verifyMetaWebhookSignature(input);
  }

  /** Shared with Messenger — same verify token. */
  verifySubscription(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string | null {
    return verifyMetaSubscription(mode, token, challenge);
  }

  async handleWebhook(payload: unknown): Promise<WebhookParseResult> {
    const body = (payload ?? {}) as MetaWebhookBody;
    const messages: NormalizedMessage[] = [];
    const events: NormalizedEvent[] = [];

    for (const { entry, event } of messagingEvents(body)) {
      // The Instagram account id — not the Page id — is what resolves this
      // delivery to exactly one tenant.
      const accountId = entry.id;
      if (!accountId) continue;

      const occurredAt = new Date(event.timestamp ?? entry.time ?? Date.now());

      if (event.delivery || event.read) {
        events.push({
          channel: Channel.INSTAGRAM,
          externalPageId: accountId,
          externalEventId: null,
          type: event.delivery ? 'DELIVERY' : 'READ',
          externalMessageIds: event.delivery?.mids ?? [],
          occurredAt,
          metadata: {
            watermark: event.delivery?.watermark ?? event.read?.watermark ?? null,
          },
        });
        continue;
      }

      const message = event.message;
      if (!message) {
        // An icebreaker or a button tap. Worth recording, but the customer did
        // not write anything, so it creates no message.
        if (event.postback) {
          events.push({
            channel: Channel.INSTAGRAM,
            externalPageId: accountId,
            externalEventId: event.postback.mid ?? null,
            type: 'OTHER',
            occurredAt,
            metadata: {
              postback: event.postback.payload ?? null,
              title: event.postback.title ?? null,
            },
          });
        }
        continue;
      }

      if (isOwnEcho(message)) {
        events.push({
          channel: Channel.INSTAGRAM,
          externalPageId: accountId,
          externalEventId: message.mid ?? null,
          type: 'ECHO',
          externalMessageIds: message.mid ? [message.mid] : [],
          occurredAt,
          metadata: { reason: 'sent_by_this_app' },
        });
        continue;
      }

      const isEcho = Boolean(message.is_echo);
      // On an echo the account is the sender, so the customer is the recipient.
      const externalUserId = isEcho ? event.recipient?.id : event.sender?.id;
      if (!externalUserId) continue;

      const attachments = toNormalizedAttachments(message.attachments);
      const content =
        typeof message.text === 'string' && message.text.length > 0 ? message.text : null;

      // Nothing renderable: a read receipt dressed as a message, or an
      // attachment type with no URL.
      if (!content && attachments.length === 0) continue;

      const contact: NormalizedContact = { externalUserId };

      messages.push({
        channel: Channel.INSTAGRAM,
        externalPageId: accountId,
        externalMessageId: message.mid ?? null,
        contact,
        direction: isEcho ? 'OUTBOUND' : 'INBOUND',
        messageType: resolveMessageType(content, attachments),
        content,
        attachments,
        sentAt: occurredAt,
        metadata: {
          provider: 'instagram',
          ...(message.quick_reply?.payload ? { quickReply: message.quick_reply.payload } : {}),
          ...(message.reply_to?.mid ? { replyToMid: message.reply_to.mid } : {}),
          ...(isEcho ? { echo: true, source: 'instagram_app' } : {}),
        },
      });
    }

    return { messages, events };
  }

  /**
   * Delivers one CRM message.
   *
   * Posts to the Instagram account's own `/messages` edge, authorised by the
   * Page token. Unlike Messenger this omits `messaging_type` — the Instagram
   * endpoint rejects it — and, as there, text and attachments are separate
   * calls because one request carries one or the other.
   */
  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    this.assertReady(input.credentials);

    const url = `${this.graphBase}/${input.credentials.externalPageId}/messages`;
    const token = input.credentials.accessToken as string;
    const attachments = input.attachments ?? [];
    const messageIds: string[] = [];

    const post = async (message: Record<string, unknown>): Promise<void> => {
      const response = await graphFetch<MetaSendResponse>(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: input.recipientExternalId },
            message,
            access_token: token,
          }),
        },
        'send',
      );
      if (response.message_id) messageIds.push(response.message_id);
    };

    if (input.content) {
      await post({ text: input.content });
    }

    for (const attachment of attachments) {
      const type = attachment.type.toLowerCase();
      await post({
        attachment: {
          // Instagram accepts image, video and audio. Anything else has no
          // representation, so it goes as an image and at least renders.
          type: type === 'video' || type === 'audio' ? type : 'image',
          payload: { url: attachment.url, is_reusable: true },
        },
      });
    }

    const [primary, ...rest] = messageIds;

    return {
      externalMessageId: primary ?? null,
      metadata: {
        provider: 'instagram',
        ...(rest.length > 0 ? { additionalMessageIds: rest } : {}),
        ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      },
    };
  }

  /**
   * Best-effort profile lookup.
   *
   * Instagram exposes the handle and follower counts for a person who has
   * messaged the account, which is more than Messenger gives — but it still
   * fails routinely, and must never fail the ingest that triggered it.
   */
  async fetchContactProfile(input: FetchProfileInput): Promise<Partial<NormalizedContact>> {
    if (!input.credentials.accessToken) return {};

    const params = new URLSearchParams({
      fields: 'name,username,profile_pic',
      access_token: input.credentials.accessToken,
    });

    try {
      const profile = await graphFetch<InstagramProfileResponse>(
        `${this.graphBase}/${input.externalUserId}?${params.toString()}`,
        { method: 'GET' },
        'profile lookup',
      );

      const display = profile.name ?? profile.username ?? null;
      const parts = display ? display.trim().split(/\s+/) : [];

      return {
        firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : display,
        lastName: parts.length > 1 ? (parts[parts.length - 1] ?? null) : null,
        username: profile.username ?? display,
        avatar: profile.profile_pic ?? null,
        profileUrl: profile.username ? `https://www.instagram.com/${profile.username}` : null,
      };
    } catch (error) {
      logger.debug(
        { err: error, externalUserId: input.externalUserId },
        'Instagram profile lookup failed; keeping the placeholder name',
      );
      return {};
    }
  }
}

export const instagramProvider = new InstagramProvider();
