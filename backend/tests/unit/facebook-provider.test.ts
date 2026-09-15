import crypto from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The provider reads Meta credentials from `env` at call time, so they are set
 * before the module graph is imported. `.env.test` deliberately leaves them
 * empty — an unconfigured provider is its own test case below.
 */
process.env.META_APP_ID = '1234567890';
process.env.META_APP_SECRET = 'test-app-secret';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'test-verify-token';

type Provider = typeof import('../../src/channels/facebook/facebook.provider');
let facebookProvider: Provider['facebookProvider'];

beforeAll(async () => {
  ({ facebookProvider } = await import('../../src/channels/facebook/facebook.provider'));
});

function sign(body: string, secret = 'test-app-secret'): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex')}`;
}

function messagingBody(event: Record<string, unknown>, pageId = 'PAGE_1') {
  return {
    object: 'page',
    entry: [{ id: pageId, time: 1_700_000_000_000, messaging: [event] }],
  };
}

describe('facebook webhook signature', () => {
  it('accepts a body signed with the app secret', () => {
    const body = JSON.stringify({ object: 'page', entry: [] });
    const rawBody = Buffer.from(body);

    expect(
      facebookProvider.verifyWebhookSignature({
        rawBody,
        headers: { 'x-hub-signature-256': sign(body) },
      }),
    ).toBe(true);
  });

  it('rejects a body signed with the wrong secret', () => {
    const body = JSON.stringify({ object: 'page', entry: [] });

    expect(
      facebookProvider.verifyWebhookSignature({
        rawBody: Buffer.from(body),
        headers: { 'x-hub-signature-256': sign(body, 'not-the-secret') },
      }),
    ).toBe(false);
  });

  it('rejects a body that was altered after signing', () => {
    const signed = JSON.stringify({ object: 'page', entry: [] });
    const tampered = JSON.stringify({ object: 'page', entry: [{ id: 'PAGE_1' }] });

    expect(
      facebookProvider.verifyWebhookSignature({
        rawBody: Buffer.from(tampered),
        headers: { 'x-hub-signature-256': sign(signed) },
      }),
    ).toBe(false);
  });

  it('rejects a delivery with no signature at all', () => {
    expect(
      facebookProvider.verifyWebhookSignature({
        rawBody: Buffer.from('{}'),
        headers: {},
      }),
    ).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on mismatched lengths; the guard must catch it
    // before that happens, or a malformed header becomes a 500.
    expect(() =>
      facebookProvider.verifyWebhookSignature({
        rawBody: Buffer.from('{}'),
        headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
      }),
    ).not.toThrow();
  });
});

describe('facebook subscription handshake', () => {
  it('echoes the challenge when the verify token matches', () => {
    expect(facebookProvider.verifySubscription('subscribe', 'test-verify-token', '99')).toBe('99');
  });

  it('refuses a wrong verify token', () => {
    expect(facebookProvider.verifySubscription('subscribe', 'wrong', '99')).toBeNull();
  });

  it('refuses a mode other than subscribe', () => {
    expect(facebookProvider.verifySubscription('unsubscribe', 'test-verify-token', '99')).toBeNull();
  });
});

describe('facebook webhook parsing', () => {
  it('normalizes an inbound text message', async () => {
    const { messages } = await facebookProvider.handleWebhook(
      messagingBody({
        sender: { id: 'PSID_1' },
        recipient: { id: 'PAGE_1' },
        timestamp: 1_700_000_000_000,
        message: { mid: 'mid.1', text: 'Hello there' },
      }),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      channel: 'FACEBOOK',
      externalPageId: 'PAGE_1',
      externalMessageId: 'mid.1',
      direction: 'INBOUND',
      messageType: 'TEXT',
      content: 'Hello there',
    });
    expect(messages[0]?.contact.externalUserId).toBe('PSID_1');
  });

  it('maps an image attachment to the IMAGE type', async () => {
    const { messages } = await facebookProvider.handleWebhook(
      messagingBody({
        sender: { id: 'PSID_1' },
        recipient: { id: 'PAGE_1' },
        message: {
          mid: 'mid.2',
          attachments: [{ type: 'image', payload: { url: 'https://cdn.example/p.jpg' } }],
        },
      }),
    );

    expect(messages[0]?.messageType).toBe('IMAGE');
    expect(messages[0]?.attachments).toEqual([
      expect.objectContaining({ type: 'IMAGE', url: 'https://cdn.example/p.jpg' }),
    ]);
  });

  it('drops an attachment that carries no URL', async () => {
    const { messages } = await facebookProvider.handleWebhook(
      messagingBody({
        sender: { id: 'PSID_1' },
        recipient: { id: 'PAGE_1' },
        message: { mid: 'mid.3', attachments: [{ type: 'location', payload: {} }] },
      }),
    );

    // Nothing renderable was sent, so nothing is stored.
    expect(messages).toHaveLength(0);
  });

  it('suppresses the echo of a message this app sent', async () => {
    const { messages, events } = await facebookProvider.handleWebhook(
      messagingBody({
        sender: { id: 'PAGE_1' },
        recipient: { id: 'PSID_1' },
        message: { mid: 'mid.4', text: 'Our reply', is_echo: true, app_id: 1234567890 },
      }),
    );

    // Already a row in the database — re-ingesting it would duplicate the reply.
    expect(messages).toHaveLength(0);
    expect(events[0]).toMatchObject({ type: 'ECHO' });
  });

  it('keeps an echo of a human replying from the Page inbox', async () => {
    const { messages } = await facebookProvider.handleWebhook(
      messagingBody({
        sender: { id: 'PAGE_1' },
        recipient: { id: 'PSID_1' },
        message: { mid: 'mid.5', text: 'Typed in Meta Business Suite', is_echo: true },
      }),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ direction: 'OUTBOUND', content: 'Typed in Meta Business Suite' });
    // The customer is the recipient on an echo, not the sender.
    expect(messages[0]?.contact.externalUserId).toBe('PSID_1');
  });

  it('reads delivery receipts as events rather than messages', async () => {
    const { messages, events } = await facebookProvider.handleWebhook(
      messagingBody({
        sender: { id: 'PSID_1' },
        recipient: { id: 'PAGE_1' },
        delivery: { mids: ['mid.1', 'mid.2'], watermark: 1_700_000_000_000 },
      }),
    );

    expect(messages).toHaveLength(0);
    expect(events[0]).toMatchObject({ type: 'DELIVERY', externalMessageIds: ['mid.1', 'mid.2'] });
  });

  it('survives a payload with nothing it recognises', async () => {
    for (const payload of [null, undefined, {}, { entry: null }, { entry: [{}] }]) {
      await expect(facebookProvider.handleWebhook(payload)).resolves.toEqual({
        messages: [],
        events: [],
      });
    }
  });
});

describe('facebook readiness', () => {
  it('reports configured when the process credentials are present', () => {
    expect(facebookProvider.isConfigured()).toBe(true);
  });

  it('names the missing credential rather than letting the send fail later', () => {
    expect(() =>
      facebookProvider.assertReady({
        integrationId: 'int_1',
        type: 'FACEBOOK',
        externalPageId: 'PAGE_1',
        externalAccountId: null,
        accessToken: null,
        metadata: null,
      }),
    ).toThrow(/access token/i);

    expect(() =>
      facebookProvider.assertReady({
        integrationId: 'int_1',
        type: 'FACEBOOK',
        externalPageId: null,
        externalAccountId: null,
        accessToken: 'token',
        metadata: null,
      }),
    ).toThrow(/Page id/i);
  });
});
