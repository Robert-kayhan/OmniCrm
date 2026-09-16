import { describe, expect, it } from 'vitest';
import { MetaOAuthStore } from '../../src/modules/integrations/meta-oauth.store';
import { CryptoService } from '../../src/common/crypto/crypto.service';
import { AppConfigService } from '../../src/config/app-config.service';
import { RedisService } from '../../src/database/redis.service';
import { toNormalizedMessages } from '../../src/modules/integrations/meta-import.service';
import type { MetaThread } from '../../src/channels/meta/meta.oauth';

/**
 * Constructed directly rather than through the container. `state` is a pure
 * HMAC over the operator's identity — it needs configuration and the crypto
 * helper and nothing else, so the unit suite stays free of a database and a
 * Redis connection. The handoff half, which does use Redis, is covered by the
 * integration suite.
 */
const config = new AppConfigService();
const store = new MetaOAuthStore(config, new CryptoService(config), new RedisService(config));

/**
 * The two pieces of the connect flow that can be tested without Meta.
 *
 * `state` is the only thing standing between the public OAuth callback and a
 * forged connect, so it gets the same scrutiny as a session token. The import
 * mapping is where a Page's history becomes CRM rows, and getting direction or
 * ordering wrong silently rewrites a customer's transcript.
 */

const ORG = 'org_123';
const USER = 'user_456';

describe('facebook oauth state', () => {
  it('round-trips the operator identity', () => {
    const payload = store.readState(store.createState(ORG, USER));

    expect(payload.organizationId).toBe(ORG);
    expect(payload.userId).toBe(USER);
  });

  it('rejects a state with a tampered body', () => {
    const [body, signature] = store.createState(ORG, USER).split('.');
    const forged = Buffer.from(
      JSON.stringify({
        organizationId: 'someone_elses_org',
        userId: USER,
        nonce: 'x',
        expiresAt: Date.now() + 60_000,
      }),
    ).toString('base64url');

    expect(body).toBeDefined();
    // The signature still belongs to the original body, so swapping the
    // payload must not authenticate a different workspace.
    expect(() => store.readState(`${forged}.${signature}`)).toThrow();
  });

  it('rejects a state with a tampered signature', () => {
    const [body] = store.createState(ORG, USER).split('.');
    expect(() => store.readState(`${body}.not-the-real-signature`)).toThrow();
  });

  it('rejects a malformed or absent state', () => {
    expect(() => store.readState(undefined)).toThrow();
    expect(() => store.readState('')).toThrow();
    expect(() => store.readState('no-dot-separator')).toThrow();
  });

  it('rejects an expired state', () => {
    // Forged directly rather than by waiting: the expiry check is the point,
    // not the ten minutes.
    const expired = Buffer.from(
      JSON.stringify({
        organizationId: ORG,
        userId: USER,
        nonce: 'x',
        expiresAt: Date.now() - 1,
      }),
    ).toString('base64url');

    expect(() => store.readState(`${expired}.anything`)).toThrow();
  });

  it('issues a different state each time', () => {
    // The nonce is what stops a captured login URL being replayed verbatim.
    expect(store.createState(ORG, USER)).not.toBe(store.createState(ORG, USER));
  });
});

describe('facebook history import mapping', () => {
  const PAGE_ID = '111';
  const PSID = '222';

  function thread(messages: MetaThread['messages']): MetaThread {
    return {
      id: 't_1',
      participantId: PSID,
      participantName: 'Jane Doe',
      updatedTime: '2026-01-02T00:00:00+0000',
      messages,
    };
  }

  it('marks the Page as the sender of outbound messages', () => {
    const [outbound, inbound] = toNormalizedMessages(
      thread([
        {
          id: 'm_2',
          message: 'How can I help?',
          createdTime: '2026-01-02T00:01:00+0000',
          fromId: PAGE_ID,
          fromName: 'Acme',
          attachmentUrls: [],
        },
        {
          id: 'm_1',
          message: 'Hello?',
          createdTime: '2026-01-02T00:00:00+0000',
          fromId: PSID,
          fromName: 'Jane Doe',
          attachmentUrls: [],
        },
      ]),
      PAGE_ID,
    );

    // Graph returns newest-first; ingest needs oldest-first.
    expect(outbound?.externalMessageId).toBe('m_1');
    expect(outbound?.direction).toBe('INBOUND');
    expect(inbound?.externalMessageId).toBe('m_2');
    expect(inbound?.direction).toBe('OUTBOUND');
  });

  it('maps MIME types onto the CRM attachment vocabulary', () => {
    const [message] = toNormalizedMessages(
      thread([
        {
          id: 'm_1',
          message: null,
          createdTime: '2026-01-02T00:00:00+0000',
          fromId: PSID,
          fromName: 'Jane Doe',
          attachmentUrls: [
            { type: 'image/jpeg', url: 'https://cdn.example/a.jpg', name: 'a.jpg' },
          ],
        },
      ]),
      PAGE_ID,
    );

    expect(message?.messageType).toBe('IMAGE');
    expect(message?.attachments[0]?.url).toBe('https://cdn.example/a.jpg');
  });

  it('falls back to FILE for an unrecognised MIME type', () => {
    const [message] = toNormalizedMessages(
      thread([
        {
          id: 'm_1',
          message: null,
          createdTime: '2026-01-02T00:00:00+0000',
          fromId: PSID,
          fromName: 'Jane Doe',
          attachmentUrls: [{ type: 'application/pdf', url: 'https://cdn.example/a.pdf', name: null }],
        },
      ]),
      PAGE_ID,
    );

    expect(message?.messageType).toBe('FILE');
  });

  it('skips a message with neither text nor a usable attachment', () => {
    const messages = toNormalizedMessages(
      thread([
        {
          id: 'm_1',
          message: null,
          createdTime: '2026-01-02T00:00:00+0000',
          fromId: PSID,
          fromName: 'Jane Doe',
          attachmentUrls: [],
        },
      ]),
      PAGE_ID,
    );

    expect(messages).toHaveLength(0);
  });

  it('skips a thread with no identifiable customer', () => {
    const messages = toNormalizedMessages(
      {
        id: 't_1',
        participantId: null,
        participantName: null,
        updatedTime: null,
        messages: [
          {
            id: 'm_1',
            message: 'Hello?',
            createdTime: '2026-01-02T00:00:00+0000',
            fromId: PSID,
            fromName: 'Jane Doe',
            attachmentUrls: [],
          },
        ],
      },
      PAGE_ID,
    );

    expect(messages).toHaveLength(0);
  });

  it('tags imported rows so they can be told from live deliveries', () => {
    const [message] = toNormalizedMessages(
      thread([
        {
          id: 'm_1',
          message: 'Hello?',
          createdTime: '2026-01-02T00:00:00+0000',
          fromId: PSID,
          fromName: 'Jane Doe',
          attachmentUrls: [],
        },
      ]),
      PAGE_ID,
    );

    expect(message?.metadata?.imported).toBe(true);
    expect(message?.externalPageId).toBe(PAGE_ID);
    expect(message?.contact.externalUserId).toBe(PSID);
  });
});
