import type { Request, Response } from 'express';
import { logger } from '../../config/logger';
import { findProviderBySlug } from '../../channels';
import type { MessagingProvider } from '../../channels';
import { handleProviderDelivery, recordWebhookDelivery } from './webhook.service';

/**
 * The public provider callback surface.
 *
 * One pair of handlers serves every channel: the slug in the URL
 * (`/api/webhooks/facebook`, `/api/webhooks/instagram`) selects the provider,
 * and the provider decides how its own deliveries are authenticated and
 * parsed. A new channel gets a working webhook by registering its provider —
 * this file does not change.
 */

/**
 * Resolves `:provider` to a registered provider.
 *
 * An unknown or unimplemented slug answers 404 with no detail. This endpoint is
 * public, so it should not confirm which channels a deployment has built.
 */
function resolveProvider(req: Request, res: Response): MessagingProvider | null {
  const slug = typeof req.params.provider === 'string' ? req.params.provider : '';
  const provider = findProviderBySlug(slug);

  if (!provider) {
    logger.warn({ slug }, 'Webhook received for an unknown provider');
    res.status(404).send('Not Found');
    return null;
  }
  return provider;
}

/**
 * A provider's subscription handshake.
 *
 * Meta calls this once when the webhook is registered and expects the challenge
 * echoed back as plain text. Anything else — wrong token, wrong mode, a
 * provider that does not verify — answers 403 with no detail.
 */
export function verifyWebhookHandler(req: Request, res: Response): void {
  const provider = resolveProvider(req, res);
  if (!provider) return;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const answer =
    provider.verifySubscription?.(
      typeof mode === 'string' ? mode : undefined,
      typeof token === 'string' ? token : undefined,
      typeof challenge === 'string' ? challenge : undefined,
    ) ?? null;

  if (answer === null) {
    logger.warn({ mode, channel: provider.channel }, 'Rejected a webhook verification attempt');
    res.status(403).send('Forbidden');
    return;
  }

  res.status(200).type('text/plain').send(answer);
}

/**
 * Inbound provider events.
 *
 * The order is deliberate: verify the signature over the raw bytes, acknowledge
 * immediately, then process. Meta retries anything it does not see acknowledged
 * within seconds, so doing the database work first turns one slow query into a
 * redelivery storm. The work still runs — it is just not on the response path.
 */
export function receiveWebhookHandler(req: Request, res: Response): void {
  const provider = resolveProvider(req, res);
  if (!provider) return;

  const slug = provider.channel.toLowerCase();
  const rawBody = req.rawBody;

  if (!rawBody) {
    // The body parser only captures raw bytes for /api/webhooks/*. Reaching
    // here means the route moved without the parser being told.
    logger.error({ slug }, 'Webhook received without a raw body; signature cannot be verified');
    res.status(400).send('Bad Request');
    return;
  }

  const verified = provider.verifyWebhookSignature({ rawBody, headers: req.headers });

  if (!verified) {
    logger.warn({ ip: req.ip, slug }, 'Rejected a webhook with an invalid signature');
    res.status(401).send('Unauthorized');
    return;
  }

  const payload: unknown = req.body;
  const object = (payload as { object?: unknown })?.object;

  // Acknowledge first. Everything below happens after the response.
  res.status(200).send('EVENT_RECEIVED');

  void (async () => {
    const webhookEventId = await recordWebhookDelivery({
      provider: slug,
      eventType: typeof object === 'string' ? object : 'unknown',
      payload,
    });

    const result = await handleProviderDelivery(provider, payload, webhookEventId);

    if (result.received > 0 || result.failed > 0) {
      logger.info({ ...result, provider: slug }, 'Processed a webhook delivery');
    }
  })();
}
