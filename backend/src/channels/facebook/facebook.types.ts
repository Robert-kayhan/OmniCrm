/**
 * The subset of Meta's Messenger wire format this provider reads.
 *
 * Every field is optional and every shape is `unknown` at the boundary: Meta
 * adds fields without notice and omits others depending on the app's approved
 * permissions, so the parser validates what it needs and ignores the rest
 * rather than trusting a declared type.
 */

export interface MetaError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

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
  /** True when Meta is echoing a message the Page sent, including our own. */
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
  /** The Page id. This is what resolves the delivery to a tenant. */
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

export interface MetaProfileResponse {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  profile_pic?: string;
  locale?: string;
  error?: MetaError;
}

/**
 * The error envelope shared by every Graph response.
 *
 * Meta returns this alongside a 200 as readily as with a 4xx, so the OAuth
 * client checks for it regardless of status.
 */
export interface MetaGraphError {
  error?: MetaError;
}
