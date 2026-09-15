import { Router } from 'express';
import { webhookRateLimiter } from '../../middleware/rate-limit';
import {
  receiveFacebookWebhookHandler,
  verifyFacebookWebhookHandler,
} from './webhook.controller';

/**
 * Public provider callbacks.
 *
 * Deliberately unauthenticated: Meta has no bearer token to present. `POST` is
 * authenticated instead by an HMAC over the raw body, checked in the controller
 * before the payload is looked at. The limiter here is generous rather than
 * absent — a burst of real traffic must get through, but an unauthenticated
 * public endpoint should not be an unbounded write path either.
 */
export const webhookRouter = Router();

webhookRouter.use(webhookRateLimiter());

webhookRouter.get('/facebook', verifyFacebookWebhookHandler);
webhookRouter.post('/facebook', receiveFacebookWebhookHandler);
