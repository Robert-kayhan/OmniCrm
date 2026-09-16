import crypto from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, createWorkspace, db } from '../helpers/factories';
import { IntegrationStatus, IntegrationType } from '../../src/generated/prisma/enums';

/**
 * The public webhook surface, end to end: HTTP in, rows out.
 *
 * `ingest.test.ts` proves the intake path is correct once a message has been
 * normalized. These prove the layer above it — that a forged delivery is
 * rejected, that a real one reaches the database, and that the tenant a message
 * lands in is decided by the Page id rather than by anything the caller sends.
 */

const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

beforeAll(() => {
  // The provider reads these at call time, and `.env.test` deliberately leaves
  // them empty so that the "not configured" path is the default elsewhere.
  process.env.META_APP_ID = '1234567890';
  process.env.META_APP_SECRET = APP_SECRET;
  process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
});

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex')}`;
}

async function connectPage(organizationId: string, externalPageId: string) {
  return db().integration.create({
    data: {
      organizationId,
      type: IntegrationType.FACEBOOK,
      name: 'Test Page',
      status: IntegrationStatus.CONNECTED,
      externalPageId,
    },
    select: { id: true },
  });
}

function messengerPayload(input: {
  pageId: string;
  psid: string;
  mid: string;
  text: string;
}) {
  return {
    object: 'page',
    entry: [
      {
        id: input.pageId,
        time: Date.now(),
        messaging: [
          {
            sender: { id: input.psid },
            recipient: { id: input.pageId },
            timestamp: Date.now(),
            message: { mid: input.mid, text: input.text },
          },
        ],
      },
    ],
  };
}

/**
 * The route answers before it processes, so the rows appear shortly after the
 * response. Polling beats a fixed sleep: it is both faster in the common case
 * and less flaky on a loaded machine.
 */
async function waitForMessage(externalMessageId: string, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const message = await db().message.findUnique({ where: { externalMessageId } });
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

describe('GET /api/webhooks/facebook (subscription handshake)', () => {
  it('echoes the challenge when the verify token matches', async () => {
    const response = await api()
      .get('/api/webhooks/facebook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '4242' });

    expect(response.status).toBe(200);
    expect(response.text).toBe('4242');
  });

  it('refuses a wrong verify token without revealing anything', async () => {
    const response = await api()
      .get('/api/webhooks/facebook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '4242' });

    expect(response.status).toBe(403);
    expect(response.text).not.toContain('4242');
  });
});

describe('POST /api/webhooks/facebook', () => {
  it('rejects a delivery with no signature', async () => {
    const response = await api()
      .post('/api/webhooks/facebook')
      .send(messengerPayload({ pageId: 'page-x', psid: 'psid-x', mid: 'mid-x', text: 'hi' }));

    expect(response.status).toBe(401);
  });

  it('rejects a delivery signed with the wrong secret', async () => {
    const body = JSON.stringify(
      messengerPayload({ pageId: 'page-y', psid: 'psid-y', mid: 'mid-y', text: 'hi' }),
    );

    const response = await api()
      .post('/api/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(body, 'not-the-secret'))
      .send(body);

    expect(response.status).toBe(401);
  });

  it('rejects a body altered after it was signed', async () => {
    const signed = JSON.stringify(
      messengerPayload({ pageId: 'page-z', psid: 'psid-z', mid: 'mid-z', text: 'original' }),
    );
    const tampered = JSON.stringify(
      messengerPayload({ pageId: 'page-z', psid: 'psid-z', mid: 'mid-z', text: 'tampered' }),
    );

    const response = await api()
      .post('/api/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(signed))
      .send(tampered);

    expect(response.status).toBe(401);
  });

  it('ingests a signed message into the tenant that owns the Page', async () => {
    const { organization } = await createWorkspace();
    const pageId = `page-${Math.random().toString(36).slice(2)}`;
    const integration = await connectPage(organization.id, pageId);

    const mid = `mid-${Math.random().toString(36).slice(2)}`;
    const body = JSON.stringify(
      messengerPayload({ pageId, psid: 'psid-100', mid, text: 'Is my order shipped?' }),
    );

    const response = await api()
      .post('/api/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(body))
      .send(body);

    // Acknowledged immediately; Meta retries anything it does not see accepted.
    expect(response.status).toBe(200);

    const message = await waitForMessage(mid);
    expect(message).not.toBeNull();
    expect(message?.content).toBe('Is my order shipped?');
    expect(message?.organizationId).toBe(organization.id);
    expect(message?.senderType).toBe('CUSTOMER');

    const conversation = await db().conversation.findUniqueOrThrow({
      where: { id: message?.conversationId as string },
      select: { organizationId: true, integrationId: true, channel: true, unreadCount: true },
    });
    expect(conversation.organizationId).toBe(organization.id);
    expect(conversation.integrationId).toBe(integration.id);
    expect(conversation.channel).toBe('FACEBOOK');
    expect(conversation.unreadCount).toBe(1);
  });

  it('records the delivery for later inspection', async () => {
    const { organization } = await createWorkspace();
    const pageId = `page-${Math.random().toString(36).slice(2)}`;
    await connectPage(organization.id, pageId);

    const mid = `mid-${Math.random().toString(36).slice(2)}`;
    const body = JSON.stringify(
      messengerPayload({ pageId, psid: 'psid-200', mid, text: 'Recorded please' }),
    );

    await api()
      .post('/api/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(body))
      .send(body);

    await waitForMessage(mid);

    const events = await db().webhookEvent.findMany({
      where: { provider: 'facebook' },
      orderBy: { receivedAt: 'desc' },
      take: 5,
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.eventType).toBe('page');
  });

  it('does not store a second copy when Meta redelivers the same message', async () => {
    const { organization } = await createWorkspace();
    const pageId = `page-${Math.random().toString(36).slice(2)}`;
    await connectPage(organization.id, pageId);

    const mid = `mid-${Math.random().toString(36).slice(2)}`;
    const body = JSON.stringify(
      messengerPayload({ pageId, psid: 'psid-300', mid, text: 'Only once' }),
    );
    const signature = sign(body);

    await api()
      .post('/api/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signature)
      .send(body);

    await waitForMessage(mid);

    await api()
      .post('/api/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signature)
      .send(body);

    // Give the second delivery time to be processed and discarded.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const messages = await db().message.findMany({
      where: { organizationId: organization.id, content: 'Only once' },
    });
    expect(messages).toHaveLength(1);
  });

  it('drops traffic for a Page that no workspace has connected', async () => {
    const mid = `mid-${Math.random().toString(36).slice(2)}`;
    const body = JSON.stringify(
      messengerPayload({
        pageId: `unclaimed-${Math.random().toString(36).slice(2)}`,
        psid: 'psid-400',
        mid,
        text: 'Nobody owns this page',
      }),
    );

    const response = await api()
      .post('/api/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(body))
      .send(body);

    // Still acknowledged: refusing would make Meta retry a delivery that can
    // never succeed.
    expect(response.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 500));
    const message = await db().message.findUnique({ where: { externalMessageId: mid } });
    expect(message).toBeNull();
  });

  it('ignores the echo of a message this app sent', async () => {
    const { organization } = await createWorkspace();
    const pageId = `page-${Math.random().toString(36).slice(2)}`;
    await connectPage(organization.id, pageId);

    const mid = `mid-echo-${Math.random().toString(36).slice(2)}`;
    const body = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: pageId,
          time: Date.now(),
          messaging: [
            {
              sender: { id: pageId },
              recipient: { id: 'psid-500' },
              timestamp: Date.now(),
              message: {
                mid,
                text: 'Our own reply coming back',
                is_echo: true,
                app_id: Number(process.env.META_APP_ID),
              },
            },
          ],
        },
      ],
    });

    await api()
      .post('/api/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(body))
      .send(body);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Already a row from the send path; ingesting the echo would duplicate it.
    const message = await db().message.findUnique({ where: { externalMessageId: mid } });
    expect(message).toBeNull();
  });

  it('keeps an echo of a human replying from the Page inbox', async () => {
    const { organization } = await createWorkspace();
    const pageId = `page-${Math.random().toString(36).slice(2)}`;
    await connectPage(organization.id, pageId);

    const mid = `mid-human-${Math.random().toString(36).slice(2)}`;
    const body = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: pageId,
          time: Date.now(),
          messaging: [
            {
              sender: { id: pageId },
              recipient: { id: 'psid-600' },
              timestamp: Date.now(),
              // No app_id: typed by a person in Meta Business Suite.
              message: { mid, text: 'Replied from Business Suite', is_echo: true },
            },
          ],
        },
      ],
    });

    await api()
      .post('/api/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(body))
      .send(body);

    const message = await waitForMessage(mid);
    expect(message).not.toBeNull();
    expect(message?.senderType).toBe('AGENT');
    expect(message?.content).toBe('Replied from Business Suite');

    // The customer is the recipient on an echo, so the identity must be theirs.
    const channel = await db().customerChannel.findFirst({
      where: { externalUserId: 'psid-600' },
    });
    expect(channel).not.toBeNull();
  });
});
