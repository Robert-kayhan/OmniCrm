import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'rawResponse';

/**
 * Opts a handler out of the `{ success, data }` envelope.
 *
 * Needed by the two routes whose body is dictated by somebody else: the webhook
 * handshake, which must echo Meta's challenge as bare text, and the OAuth
 * callback, which issues a redirect rather than JSON.
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
