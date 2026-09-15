import crypto from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { instagramProvider } from '../../src/channels/instagram/instagram.provider';
import { facebookProvider } from '../../src/channels/facebook/facebook.provider';

/**
 * Instagram Direct's parsing rules.
 *
 * The four things that make it a separate provider rather than a flag on the
 * Facebook one: the inbox id is the Instagram account, the attachment
 * vocabulary is wider, echoes of our own sends are dropped, and every message
 * is stamped INSTAGRAM so ingest routes it to the right integration.
 */

const APP_SECRET = 'test-app-secret';
const APP_ID = '1234567890';
const IG_ACCOUNT_ID = '17841400000000000';
const IGSID = '6000000000000000';

beforeAll(() => {
  process.env.META_APP_ID = APP_ID;
  process.env.META_APP_SECRET = APP_SECRET;
});

function directMessage(overrides: Record<string, unknown> = {}) {
  return {
    object: 'instagram',
    entry: [
      {
        id: IG_ACCOUNT_ID,
        time: 1_767_000_000_000,
        messaging: [
          {
            sender: { id: IGSID },
            recipient: { id: IG_ACCOUNT_ID },
            timestamp: 1_767_000_000_000,
            message: { mid: 'ig_mid_1', text: 'Is this still available?', ...overrides },
          },
        ],
      },
    ],
  };
}

describe('instagram provider identity', () => {
  it('declares the Instagram channel and integration type', () => {
    expect(instagramProvider.channel).toBe('INSTAGRAM');
    expect(instagramProvider.integrationType).toBe('INSTAGRAM');
    expect(instagramProvider.displayName).toBe('Instagram Direct');
  });

  it('shares Meta configuration with Messenger rather than adding its own', () => {
    // Same app, same three variables — so the two must always agree.
    expect(instagramProvider.isConfigured()).toBe(facebookProvider.isConfigured());
  });
});

describe('instagram webhook parsing', () => {
  it('attributes a message to the Instagram account, not the Page', async () => {
    const { messages } = await instagramProvider.handleWebhook(directMessage());

    expect(messages).toHaveLength(1);
    expect(messages[0]?.channel).toBe('INSTAGRAM');
    // This is what resolves the delivery to one tenant.
    expect(messages[0]?.externalPageId).toBe(IG_ACCOUNT_ID);
    expect(messages[0]?.contact.externalUserId).toBe(IGSID);
    expect(messages[0]?.direction).toBe('INBOUND');
    expect(messages[0]?.content).toBe('Is this still available?');
  });

  it('maps a story mention to an image rather than dropping it', async () => {
    const { messages } = await instagramProvider.handleWebhook(
      directMessage({
        text: undefined,
        attachments: [{ type: 'story_mention', payload: { url: 'https://cdn.example/story.jpg' } }],
      }),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageType).toBe('IMAGE');
    expect(messages[0]?.attachments[0]?.url).toBe('https://cdn.example/story.jpg');
  });

  it('maps a reel share to a video', async () => {
    const { messages } = await instagramProvider.handleWebhook(
      directMessage({
        text: undefined,
        attachments: [{ type: 'ig_reel', payload: { url: 'https://cdn.example/reel.mp4' } }],
      }),
    );

    expect(messages[0]?.messageType).toBe('VIDEO');
  });

  it('drops an echo of this app’s own send', async () => {
    const { messages, events } = await instagramProvider.handleWebhook(
      directMessage({ is_echo: true, app_id: APP_ID }),
    );

    // Re-ingesting would duplicate every agent reply.
    expect(messages).toHaveLength(0);
    expect(events[0]?.type).toBe('ECHO');
  });

  it('keeps an echo of a human replying from the Instagram app', async () => {
    const { messages } = await instagramProvider.handleWebhook(
      directMessage({ is_echo: true, app_id: '9999999999' }),
    );

    // Without this the CRM transcript diverges from what the customer saw.
    expect(messages).toHaveLength(1);
    expect(messages[0]?.direction).toBe('OUTBOUND');
    // On an echo the customer is the recipient, not the sender.
    expect(messages[0]?.contact.externalUserId).toBe(IG_ACCOUNT_ID);
  });

  it('ignores a message carrying neither text nor a usable attachment', async () => {
    const { messages } = await instagramProvider.handleWebhook(
      directMessage({ text: undefined, attachments: [{ type: 'image', payload: {} }] }),
    );

    expect(messages).toHaveLength(0);
  });

  it('records a read receipt as an event, not a message', async () => {
    const { messages, events } = await instagramProvider.handleWebhook({
      object: 'instagram',
      entry: [
        {
          id: IG_ACCOUNT_ID,
          messaging: [{ sender: { id: IGSID }, read: { watermark: 1_767_000_000_000 } }],
        },
      ],
    });

    expect(messages).toHaveLength(0);
    expect(events[0]?.type).toBe('READ');
    expect(events[0]?.channel).toBe('INSTAGRAM');
  });

  it('tolerates a malformed body without throwing', async () => {
    await expect(instagramProvider.handleWebhook(null)).resolves.toEqual({
      messages: [],
      events: [],
    });
    await expect(instagramProvider.handleWebhook({ entry: 'nonsense' })).resolves.toEqual({
      messages: [],
      events: [],
    });
  });
});

describe('instagram webhook signatures', () => {
  function sign(body: string, secret = APP_SECRET): string {
    return `sha256=${crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex')}`;
  }

  it('accepts a correctly signed body', () => {
    const body = JSON.stringify(directMessage());
    expect(
      instagramProvider.verifyWebhookSignature({
        rawBody: Buffer.from(body),
        headers: { 'x-hub-signature-256': sign(body) },
      }),
    ).toBe(true);
  });

  it('rejects a body signed with the wrong secret', () => {
    const body = JSON.stringify(directMessage());
    expect(
      instagramProvider.verifyWebhookSignature({
        rawBody: Buffer.from(body),
        headers: { 'x-hub-signature-256': sign(body, 'not-the-secret') },
      }),
    ).toBe(false);
  });

  it('rejects a delivery with no signature at all', () => {
    expect(
      instagramProvider.verifyWebhookSignature({
        rawBody: Buffer.from('{}'),
        headers: {},
      }),
    ).toBe(false);
  });
});
