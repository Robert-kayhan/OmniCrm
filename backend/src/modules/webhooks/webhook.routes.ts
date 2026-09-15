import { Router } from 'express';
import { webhookRateLimiter } from '../../middleware/rate-limit';
import { receiveWebhookHandler, verifyWebhookHandler } from './webhook.controller';

/**
 * Public provider callbacks.
 *
 * Deliberately unauthenticated: Meta has no bearer token to present. `POST` is
 * authenticated instead by an HMAC over the raw body, checked in the controller
 * before the payload is looked at. The limiter here is generous rather than
 * absent — a burst of real traffic must get through, but an unauthenticated
 * public endpoint should not be an unbounded write path either.
 *
 * The `:provider` segment is the channel slug — `facebook`, `instagram` — and
 * resolves through the channel registry, so adding a channel adds a webhook
 * without touching this file.
 */
export const webhookRouter = Router();

webhookRouter.use(webhookRateLimiter());

webhookRouter.get('/:provider', verifyWebhookHandler);
webhookRouter.post('/:provider', receiveWebhookHandler);
