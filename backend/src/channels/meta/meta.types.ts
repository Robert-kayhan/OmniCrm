/**
 * Wire shapes shared by every Meta-owned channel.
 *
 * Facebook Messenger and Instagram Direct are two surfaces of one Graph API:
 * the same error envelope, the same signature header, the same OAuth. What
 * differs — the webhook `object`, the attachment vocabulary, which id
 * identifies the inbox — stays in each channel's own types file.
 */

export interface MetaError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

/**
 * The error envelope carried by every Graph response.
 *
 * Meta returns this alongside a 200 as readily as with a 4xx, so callers check
 * for it regardless of status.
 */
export interface MetaGraphError {
  error?: MetaError;
}

/**
 * The messaging wire format, shared by Messenger and Instagram Direct.
 *
 * Meta delivers both through the same `entry[].messaging[]` envelope — only
 * the `object` discriminator and the attachment vocabulary differ. Every field
 * is optional on purpose: Meta adds fields without notice and omits others
 * depending on the app's approved permissions, so a parser validates what it
 * needs and ignores the rest rather than trusting a declared type.
 */

export interface MetaAttachmentPayload {
  url?: string;
  sticker_id?: number;
  title?: string;
  coordinates?: { lat?: number; long?: number };
}

export interface MetaAttachment {
  type?: string;
  payload?: MetaAttachmentPayload;
}

export interface MetaMessage {
  mid?: string;
  text?: string;
  /** True when Meta is echoing a message the business sent, including our own. */
  is_echo?: boolean;
  /** Present on echoes of Send API calls; identifies the app that sent it. */
  app_id?: number | string;
  metadata?: string;
  attachments?: MetaAttachment[];
  quick_reply?: { payload?: string };
  reply_to?: { mid?: string };
}

export interface MetaMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: MetaMessage;
  delivery?: { mids?: string[]; watermark?: number };
  read?: { watermark?: number };
  postback?: { mid?: string; title?: string; payload?: string };
}

export interface MetaEntry {
  /** The inbox id: a Page id for Messenger, an IG account id for Instagram. */
  id?: string;
  time?: number;
  messaging?: MetaMessagingEvent[];
}

export interface MetaWebhookBody {
  /** `page` for Messenger, `instagram` for IG Direct. */
  object?: string;
  entry?: MetaEntry[];
}

export interface MetaSendResponse {
  recipient_id?: string;
  message_id?: string;
  error?: MetaError;
}
