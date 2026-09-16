import crypto from 'node:crypto';
import { env } from '../../config/env';
import type { WebhookSignatureInput } from '../types';

/**
 * Webhook authentication shared by every Meta channel.
 *
 * Messenger and Instagram Direct are delivered by the same app, signed with the
 * same app secret and verified with the same token. This lives in one place
 * deliberately: two copies of a signature check are two chances to weaken one
 * of them.
 */

/**
 * Meta signs the exact bytes it sent with the app secret. The comparison is
 * timing-safe, and a missing secret fails closed — an unverifiable delivery is
 * treated as forged rather than waved through.
 */
export function verifyMetaWebhookSignature({ rawBody, headers }: WebhookSignatureInput): boolean {
  if (!env.META_APP_SECRET) return false;

  const header = headers['x-hub-signature-256'];
  const signature = Array.isArray(header) ? header[0] : header;
  if (typeof signature !== 'string' || !signature.startsWith('sha256=')) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', env.META_APP_SECRET)
    .update(rawBody)
    .digest('hex')}`;

  const received = Buffer.from(signature);
  const computed = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so check that first.
  if (received.length !== computed.length) return false;
  return crypto.timingSafeEqual(received, computed);
}

/**
 * Answers Meta's subscription handshake, returning the challenge to echo back
 * or null when the token does not match.
 */
export function verifyMetaSubscription(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined,
): string | null {
  if (mode !== 'subscribe') return null;
  if (!env.META_WEBHOOK_VERIFY_TOKEN) return null;
  if (token !== env.META_WEBHOOK_VERIFY_TOKEN) return null;
  return challenge ?? null;
}
