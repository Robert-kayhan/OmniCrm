/**
 * The subset of Meta's Messenger wire format this provider reads.
 *
 * Every field is optional and every shape is `unknown` at the boundary: Meta
 * adds fields without notice and omits others depending on the app's approved
 * permissions, so the parser validates what it needs and ignores the rest
 * rather than trusting a declared type.
 */

// The wire format itself is shared with Instagram Direct, which Meta delivers
// through the same envelope. Re-exported here so the Messenger provider reads
// from one obvious place.
export type {
  MetaAttachment,
  MetaAttachmentPayload,
  MetaEntry,
  MetaError,
  MetaGraphError,
  MetaMessage,
  MetaMessagingEvent,
  MetaSendResponse,
  MetaWebhookBody,
} from '../meta/meta.types';
import type { MetaError } from '../meta/meta.types';

export interface MetaProfileResponse {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  profile_pic?: string;
  locale?: string;
  error?: MetaError;
}
