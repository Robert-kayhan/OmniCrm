import crypto from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, createWorkspace, db } from '../helpers/factories';
import { Channel, IntegrationStatus, IntegrationType } from '../../src/generated/prisma/enums';

/**
 * Instagram Direct, end to end: HTTP in, rows out.
 *
 * What these prove beyond the Messenger suite is the part that is genuinely
 * new — that `/api/webhooks/:provider` resolves a channel through the registry
 * rather than being hardwired to Facebook, and that a delivery is attributed
 * by the *Instagram account* id, so the same workspace can run both inboxes
 * without either one's traffic leaking into the other.
 */

const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

beforeAll(() => {
  process.env.META_APP_ID = '1234567890';
  process.env.META_APP_SECRET = APP_SECRET;
  process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
});

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex')}`;
}

async function connectInstagram(organizationId: string, accountId: string) {
  return db().integration.create({
    data: {
      organizationId,
      type: IntegrationType.INSTAGRAM,
      name: 'Test Instagram',
      status: IntegrationStatus.CONNECTED,
      externalPageId: accountId,
    },
    select: { id: true },
  });
}

function instagramPayload(input: {
  accountId: string;
  igsid: string;
  mid: string;
  text: string;
}) {
  return {
    object: 'instagram',
    entry: [
      {
        id: input.accountId,
        time: Date.now(),
        messaging: [
          {
            sender: { id: input.igsid },
            recipient: { id: input.accountId },
            timestamp: Date.now(),
            message: { mid: input.mid, text: input.text },
          },
        ],
      },
    ],
  };
}

async function waitForMessage(externalMessageId: string, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const message = await db().message.findUnique({ where: { externalMessageId } });
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

describe('GET /api/webhooks/instagram (subscription handshake)', () => {
  it('echoes the challenge when the verify token matches', async () => {
    const response = await api()
      .get('/api/webhooks/instagram')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '7788' });

    expect(response.status).toBe(200);
    expect(response.text).toBe('7788');
  });

  it('refuses a wrong verify token', async () => {
    const response = await api()
      .get('/api/webhooks/instagram')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '7788' });

    expect(response.status).toBe(403);
  });

  it('404s an unknown channel slug without confirming what is built', async () => {
    const response = await api()
      .get('/api/webhooks/tiktok')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1' });

    expect(response.status).toBe(404);
  });
});

describe('POST /api/webhooks/instagram', () => {
  it('rejects a delivery with no signature', async () => {
    const response = await api()
      .post('/api/webhooks/instagram')
      .send(instagramPayload({ accountId: 'ig-x', igsid: 'igsid-x', mid: 'ig-mid-x', text: 'hi' }));

    expect(response.status).toBe(401);
  });

  it('ingests a signed message into the tenant that owns the account', async () => {
    const { organization } = await createWorkspace();
    const accountId = `ig-${Date.now()}`;
    const mid = `ig-mid-${Date.now()}`;
    await connectInstagram(organization.id, accountId);

    const body = JSON.stringify(
      instagramPayload({ accountId, igsid: 'igsid-1', mid, text: 'Is this still available?' }),
    );

    const response = await api()
      .post('/api/webhooks/instagram')
      .set('X-Hub-Signature-256', sign(body))
      .set('Content-Type', 'application/json')
      .send(body);

    // Acknowledged immediately; Meta retries anything it does not see.
    expect(response.status).toBe(200);

    const message = await waitForMessage(mid);
    expect(message).not.toBeNull();
    expect(message?.content).toBe('Is this still available?');
    expect(message?.organizationId).toBe(organization.id);

    const conversation = await db().conversation.findUnique({
      where: { id: message?.conversationId ?? '' },
      select: { channel: true },
    });
    expect(conversation?.channel).toBe(Channel.INSTAGRAM);
  });

  it('keeps Messenger and Instagram traffic on separate integrations', async () => {
    const { organization } = await createWorkspace();
    const sharedId = `shared-${Date.now()}`;

    // The same external id under both types. The unique index is on
    // (type, externalPageId), so these are two distinct inboxes — this is what
    // stops an Instagram delivery landing on a Facebook conversation.
    await db().integration.create({
      data: {
        organizationId: organization.id,
        type: IntegrationType.FACEBOOK,
        name: 'Shared id Page',
        status: IntegrationStatus.CONNECTED,
        externalPageId: sharedId,
      },
    });
    await connectInstagram(organization.id, sharedId);

    const mid = `ig-split-${Date.now()}`;
    const body = JSON.stringify(
      instagramPayload({ accountId: sharedId, igsid: 'igsid-2', mid, text: 'From Instagram' }),
    );

    await api()
      .post('/api/webhooks/instagram')
      .set('X-Hub-Signature-256', sign(body))
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    const message = await waitForMessage(mid);
    expect(message).not.toBeNull();

    const conversation = await db().conversation.findUnique({
      where: { id: message?.conversationId ?? '' },
      select: { channel: true, integration: { select: { type: true } } },
    });
    expect(conversation?.channel).toBe(Channel.INSTAGRAM);
    expect(conversation?.integration?.type).toBe(IntegrationType.INSTAGRAM);
  });

  it('drops traffic for an account no workspace has connected', async () => {
    const mid = `ig-orphan-${Date.now()}`;
    const body = JSON.stringify(
      instagramPayload({ accountId: `ig-unknown-${Date.now()}`, igsid: 'igsid-3', mid, text: 'hi' }),
    );

    // Still acknowledged: refusing would make Meta retry a delivery that can
    // never succeed.
    await api()
      .post('/api/webhooks/instagram')
      .set('X-Hub-Signature-256', sign(body))
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await db().message.findUnique({ where: { externalMessageId: mid } })).toBeNull();
  });
});
