import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ChannelRegistryService } from '../../channels/channel-registry.service';
import type { MessagingProvider } from '../../channels/types';
import { Public } from '../../common/decorators/auth.decorators';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { THROTTLERS } from '../../common/throttler/throttler.constants';
import { WebhookService } from './webhook.service';

/**
 * The public provider callback surface.
 *
 * Deliberately unauthenticated: Meta has no bearer token to present. `POST` is
 * authenticated instead by an HMAC over the raw body, checked before the
 * payload is looked at. One pair of handlers serves every channel — the slug in
 * the URL (`/api/webhooks/facebook`, `/api/webhooks/instagram`) selects the
 * provider, and the provider decides how its own deliveries are authenticated
 * and parsed. A new channel gets a working webhook by registering its provider.
 *
 * It carries its own rate limit and skips the global one: provider traffic is
 * bursty and already authenticated per-delivery, so sharing an agent-sized
 * budget with it would drop real customer messages. The limit is generous
 * rather than absent — an unauthenticated public endpoint should still not be
 * an unbounded write path.
 *
 * Every response here is written by hand, so the routes opt out of the JSON
 * envelope: Meta expects a bare challenge string and a bare acknowledgement.
 */
@Public()
@RawResponse()
@SkipThrottle({ [THROTTLERS.GLOBAL]: true })
@Throttle({ [THROTTLERS.WEBHOOK]: {} })
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly channels: ChannelRegistryService,
    private readonly webhooks: WebhookService,
  ) {}

  /**
   * Resolves `:provider` to a registered provider.
   *
   * An unknown or unimplemented slug answers 404 with no detail. This endpoint
   * is public, so it should not confirm which channels a deployment has built.
   */
  private resolveProvider(slug: string, response: Response): MessagingProvider | null {
    const provider = this.channels.findBySlug(slug);

    if (!provider) {
      this.logger.warn({ slug }, 'Webhook received for an unknown provider');
      response.status(404).send('Not Found');
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
  @Get(':provider')
  @ApiOperation({
    summary: 'Provider subscription handshake',
    description:
      'Called once by the provider when the webhook URL is registered. Echoes ' +
      '`hub.challenge` back as plain text when the verify token matches.',
  })
  @ApiParam({
    name: 'provider',
    description: 'Channel slug.',
    schema: { type: 'string', enum: ['facebook', 'instagram'] },
  })
  @ApiQuery({ name: 'hub.mode', required: false, schema: { type: 'string', example: 'subscribe' } })
  @ApiQuery({ name: 'hub.verify_token', required: false, schema: { type: 'string' } })
  @ApiQuery({ name: 'hub.challenge', required: false, schema: { type: 'string' } })
  @ApiResponse({
    status: 200,
    description: 'The challenge, echoed verbatim as plain text.',
    content: { 'text/plain': { schema: { type: 'string', example: '1158201444' } } },
  })
  @ApiResponse({ status: 403, description: 'Wrong mode or verify token.' })
  @ApiResponse({ status: 404, description: 'Unknown channel slug.' })
  verify(
    @Param('provider') slug: string,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ): void {
    const provider = this.resolveProvider(slug, response);
    if (!provider) return;

    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const answer =
      provider.verifySubscription?.(
        typeof mode === 'string' ? mode : undefined,
        typeof token === 'string' ? token : undefined,
        typeof challenge === 'string' ? challenge : undefined,
      ) ?? null;

    if (answer === null) {
      this.logger.warn(
        { mode, channel: provider.channel },
        'Rejected a webhook verification attempt',
      );
      response.status(403).send('Forbidden');
      return;
    }

    response.status(200).type('text/plain').send(answer);
  }

  /**
   * Inbound provider events.
   *
   * The order is deliberate: verify the signature over the raw bytes, acknowledge
   * immediately, then process. Meta retries anything it does not see acknowledged
   * within seconds, so doing the database work first turns one slow query into a
   * redelivery storm. The work still runs — it is just not on the response path.
   */
  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Inbound provider delivery',
    description:
      'Authenticated by an HMAC over the raw request body, not by a bearer ' +
      'token. Acknowledged immediately and processed afterwards, because a ' +
      'provider retries anything it does not see acknowledged within seconds.',
  })
  @ApiParam({
    name: 'provider',
    description: 'Channel slug.',
    schema: { type: 'string', enum: ['facebook', 'instagram'] },
  })
  @ApiResponse({
    status: 200,
    description: 'Delivery accepted. Processing happens after the response.',
    content: { 'text/plain': { schema: { type: 'string', example: 'EVENT_RECEIVED' } } },
  })
  @ApiResponse({ status: 400, description: 'The raw body was not captured.' })
  @ApiResponse({ status: 401, description: 'Signature verification failed.' })
  @ApiResponse({ status: 404, description: 'Unknown channel slug.' })
  receive(
    @Param('provider') slug: string,
    @Req() request: RawBodyRequest<Request>,
    @Res() response: Response,
  ): void {
    const provider = this.resolveProvider(slug, response);
    if (!provider) return;

    const channelSlug = provider.channel.toLowerCase();
    const rawBody = request.rawBody;

    if (!rawBody) {
      // The application is created with `rawBody: true`; reaching here means
      // that was turned off and signatures can no longer be verified.
      this.logger.error(
        { slug: channelSlug },
        'Webhook received without a raw body; signature cannot be verified',
      );
      response.status(400).send('Bad Request');
      return;
    }

    const verified = provider.verifyWebhookSignature({ rawBody, headers: request.headers });

    if (!verified) {
      this.logger.warn(
        { ip: request.ip, slug: channelSlug },
        'Rejected a webhook with an invalid signature',
      );
      response.status(401).send('Unauthorized');
      return;
    }

    const payload: unknown = request.body;
    const object = (payload as { object?: unknown })?.object;

    // Acknowledge first. Everything below happens after the response.
    response.status(200).send('EVENT_RECEIVED');

    void (async () => {
      const webhookEventId = await this.webhooks.recordDelivery({
        provider: channelSlug,
        eventType: typeof object === 'string' ? object : 'unknown',
        payload,
      });

      const result = await this.webhooks.handleDelivery(provider, payload, webhookEventId);

      if (result.received > 0 || result.failed > 0) {
        this.logger.log({ ...result, provider: channelSlug }, 'Processed a webhook delivery');
      }
    })();
  }
}
