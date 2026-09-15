import type { Request, Response } from 'express';
import { logger } from '../../config/logger';
import { facebookProvider } from '../../channels/facebook/facebook.provider';
import { handleProviderDelivery, recordWebhookDelivery } from './webhook.service';

/**
 * Meta's subscription handshake.
 *
 * Meta calls this once when the webhook is registered and expects the challenge
 * echoed back as plain text. Anything else — wrong token, wrong mode — answers
 * 403 with no detail, because this endpoint is public.
 */
export function verifyFacebookWebhookHandler(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const answer = facebookProvider.verifySubscription(
    typeof mode === 'string' ? mode : undefined,
    typeof token === 'string' ? token : undefined,
    typeof challenge === 'string' ? challenge : undefined,
  );

  if (answer === null) {
    logger.warn({ mode }, 'Rejected a Facebook webhook verification attempt');
    res.status(403).send('Forbidden');
    return;
  }

  res.status(200).type('text/plain').send(answer);
}

/**
 * Inbound Messenger events.
 *
 * The order is deliberate: verify the signature over the raw bytes, acknowledge
 * immediately, then process. Meta retries anything it does not see acknowledged
 * within seconds, so doing the database work first turns one slow query into a
 * redelivery storm. The work still runs — it is just not on the response path.
 */
export function receiveFacebookWebhookHandler(req: Request, res: Response): void {
  const rawBody = req.rawBody;

  if (!rawBody) {
    // The body parser only captures raw bytes for /api/webhooks/*. Reaching
    // here means the route moved without the parser being told.
    logger.error('Facebook webhook received without a raw body; signature cannot be verified');
    res.status(400).send('Bad Request');
    return;
  }

  const verified = facebookProvider.verifyWebhookSignature({
    rawBody,
    headers: req.headers,
  });

  if (!verified) {
    logger.warn({ ip: req.ip }, 'Rejected a Facebook webhook with an invalid signature');
    res.status(401).send('Unauthorized');
    return;
  }

  const payload: unknown = req.body;
  const object = (payload as { object?: unknown })?.object;

  // Acknowledge first. Everything below happens after the response.
  res.status(200).send('EVENT_RECEIVED');

  void (async () => {
    const webhookEventId = await recordWebhookDelivery({
      provider: 'facebook',
      eventType: typeof object === 'string' ? object : 'unknown',
      payload,
    });

    const result = await handleProviderDelivery(facebookProvider, payload, webhookEventId);

    if (result.received > 0 || result.failed > 0) {
      logger.info({ ...result, provider: 'facebook' }, 'Processed a Facebook webhook delivery');
    }
  })();
}
