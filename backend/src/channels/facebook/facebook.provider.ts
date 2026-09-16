import { env } from '../../config/env';
import { verifyMetaSubscription, verifyMetaWebhookSignature } from '../meta/meta.webhook';
import { Logger } from '@nestjs/common';
import { Channel, IntegrationType, MessageType } from '../../generated/prisma/enums';
import { IntegrationConfigurationError, ProviderError } from '../../common/errors/app.error';
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
import type {
  MetaAttachment,
  MetaEntry,
  MetaMessage,
  MetaMessagingEvent,
  MetaProfileResponse,
  MetaSendResponse,
  MetaWebhookBody,
} from './facebook.types';

/**
 * Providers are plain adapters rather than Nest providers — they hold no
 * state and touch neither the database nor the container — so the logger is
 * instantiated directly. Nest routes it through the same pino transport as
 * everything else once the application logger is installed.
 */
const logger = new Logger('FacebookProvider');

/** Meta drops a delivery that has not been answered quickly; fail before it does. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Meta's attachment vocabulary mapped onto ours. `location`, `fallback` and
 * `template` have no CRM equivalent and become FILE when they carry a URL, so
 * an agent at least sees that something was sent.
 */
const ATTACHMENT_TYPES: Record<string, MessageType> = {
  image: MessageType.IMAGE,
  video: MessageType.VIDEO,
  audio: MessageType.AUDIO,
  file: MessageType.FILE,
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
    // Location and template attachments carry no URL. There is nothing to
    // store, and a row with an empty href renders as a broken link.
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
 * Meta echoes every message a Page sends, including the ones this API just
 * made, so re-ingesting them would duplicate every agent reply. An echo
 * *without* our app id is a human replying from Meta's own Page inbox — that
 * one is kept, because otherwise the CRM transcript silently diverges from what
 * the customer actually saw.
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

async function metaFetch<T>(url: string, init: RequestInit, context: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'network error';
    throw new ProviderError(`Facebook ${context} failed: ${reason}`, 'FACEBOOK_UNREACHABLE');
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
    throw new ProviderError(`Facebook ${context} failed: ${detail}`, 'FACEBOOK_API_ERROR', {
      status: response.status,
      code: payload.error?.code,
    });
  }

  return parsed as T;
}

export class FacebookProvider implements MessagingProvider {
  public readonly channel = Channel.FACEBOOK;
  public readonly integrationType = IntegrationType.FACEBOOK;
  public readonly displayName = 'Facebook Messenger';

  private get graphBase(): string {
    return `${env.META_GRAPH_API_BASE_URL}/${env.META_GRAPH_API_VERSION}`;
  }

  /**
   * Process-level readiness. The app id and secret verify webhook signatures
   * and the verify token completes the subscription handshake; without all
   * three the channel cannot receive anything, so offering it would be a lie.
   */
  isConfigured(): boolean {
    return Boolean(env.META_APP_ID && env.META_APP_SECRET && env.META_WEBHOOK_VERIFY_TOKEN);
  }

  assertReady(credentials: ProviderCredentials): void {
    if (!credentials.accessToken) {
      throw new IntegrationConfigurationError(
        'This Facebook Page has no stored access token. Reconnect it from Settings, Integrations.',
        'FACEBOOK_TOKEN_MISSING',
        { integrationId: credentials.integrationId },
      );
    }
    if (!credentials.externalPageId) {
      throw new IntegrationConfigurationError(
        'This Facebook integration is not bound to a Page id.',
        'FACEBOOK_PAGE_ID_MISSING',
        { integrationId: credentials.integrationId },
      );
    }
  }

  /** Shared with Instagram Direct — same app secret, same header. */
  verifyWebhookSignature(input: WebhookSignatureInput): boolean {
    return verifyMetaWebhookSignature(input);
  }

  /** Shared with Instagram Direct — same verify token. */
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
      // The Page id is what resolves this delivery to exactly one tenant.
      const pageId = entry.id;
      if (!pageId) continue;

      const occurredAt = new Date(event.timestamp ?? entry.time ?? Date.now());

      if (event.delivery || event.read) {
        events.push({
          channel: Channel.FACEBOOK,
          externalPageId: pageId,
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
        // A postback is a button tap. It is worth recording, but the customer
        // did not write anything, so it creates no message.
        if (event.postback) {
          events.push({
            channel: Channel.FACEBOOK,
            externalPageId: pageId,
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
          channel: Channel.FACEBOOK,
          externalPageId: pageId,
          externalEventId: message.mid ?? null,
          type: 'ECHO',
          externalMessageIds: message.mid ? [message.mid] : [],
          occurredAt,
          metadata: { reason: 'sent_by_this_app' },
        });
        continue;
      }

      const isEcho = Boolean(message.is_echo);
      // On an echo the Page is the sender, so the customer is the recipient.
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
        channel: Channel.FACEBOOK,
        externalPageId: pageId,
        externalMessageId: message.mid ?? null,
        contact,
        direction: isEcho ? 'OUTBOUND' : 'INBOUND',
        messageType: resolveMessageType(content, attachments),
        content,
        attachments,
        sentAt: occurredAt,
        metadata: {
          provider: 'facebook',
          ...(message.quick_reply?.payload ? { quickReply: message.quick_reply.payload } : {}),
          ...(message.reply_to?.mid ? { replyToMid: message.reply_to.mid } : {}),
          ...(isEcho ? { echo: true, source: 'page_inbox' } : {}),
        },
      });
    }

    return { messages, events };
  }

  /**
   * Delivers one CRM message.
   *
   * Messenger accepts either text or a single attachment per call, so a message
   * carrying both becomes several calls. The first provider id is stored on the
   * row and the rest kept in metadata; echoes of all of them are dropped by the
   * app-id rule above rather than re-entering the thread.
   */
  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    this.assertReady(input.credentials);

    const url = `${this.graphBase}/${input.credentials.externalPageId}/messages`;
    const token = input.credentials.accessToken as string;
    const attachments = input.attachments ?? [];
    const messageIds: string[] = [];

    const post = async (message: Record<string, unknown>): Promise<void> => {
      const response = await metaFetch<MetaSendResponse>(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: input.recipientExternalId },
            messaging_type: 'RESPONSE',
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
          // Messenger has no `text` attachment type; anything unrecognised is
          // delivered as a file.
          type: type === 'text' || type === 'system' ? 'file' : type,
          payload: { url: attachment.url, is_reusable: true },
        },
      });
    }

    const [primary, ...rest] = messageIds;

    return {
      externalMessageId: primary ?? null,
      metadata: {
        provider: 'facebook',
        ...(rest.length > 0 ? { additionalMessageIds: rest } : {}),
        ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      },
    };
  }

  /**
   * Best-effort profile lookup.
   *
   * Meta withholds names and pictures until the person has messaged the Page
   * and the app holds the right permission, so a failure here is routine and
   * must never fail the ingest that triggered it.
   */
  async fetchContactProfile(input: FetchProfileInput): Promise<Partial<NormalizedContact>> {
    if (!input.credentials.accessToken) return {};

    const params = new URLSearchParams({
      fields: 'first_name,last_name,profile_pic,locale',
      access_token: input.credentials.accessToken,
    });

    try {
      const profile = await metaFetch<MetaProfileResponse>(
        `${this.graphBase}/${input.externalUserId}?${params.toString()}`,
        { method: 'GET' },
        'profile lookup',
      );

      const firstName = profile.first_name ?? null;
      const lastName = profile.last_name ?? null;
      const username = [firstName, lastName].filter(Boolean).join(' ') || profile.name || null;

      return {
        firstName,
        lastName,
        username,
        avatar: profile.profile_pic ?? null,
        locale: profile.locale ?? null,
        profileUrl: `https://www.facebook.com/${input.externalUserId}`,
      };
    } catch (error) {
      logger.debug(
        { err: error, externalUserId: input.externalUserId },
        'Facebook profile lookup failed; keeping the placeholder name',
      );
      return {};
    }
  }
}

export const facebookProvider = new FacebookProvider();
