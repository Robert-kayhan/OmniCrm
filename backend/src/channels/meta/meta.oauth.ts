import { env, metaOAuthRedirectUri } from '../../config/env';
import { logger } from '../../config/logger';
import { IntegrationConfigurationError, ProviderError } from '../../utils/errors';
import type { MetaGraphError } from './meta.types';

/**
 * Facebook Login, the Graph half.
 *
 * This module is the only place that speaks OAuth to Meta. It performs no
 * database work and knows nothing about organizations — like the provider, it
 * translates between Meta's wire format and plain structs, and the integration
 * service decides what to persist.
 *
 * The flow, in the order the functions appear below:
 *
 *   1. buildAuthorizeUrl        send the operator to Meta
 *   2. exchangeCodeForUserToken code -> short-lived user token
 *   3. extendUserToken          short-lived -> ~60 day user token
 *   4. listManagedPages         user token -> the Pages they admin, each with
 *                               its own non-expiring Page token
 *   5. subscribePageToApp       tell Meta to deliver this Page's messages to
 *                               our webhook
 *   6. fetchRecentConversations read the threads that already exist
 */

const REQUEST_TIMEOUT_MS = 15_000;

/** Meta's OAuth dialog lives on www.facebook.com, not graph.facebook.com. */
const OAUTH_DIALOG_BASE = 'https://www.facebook.com';

/** Which of a Page's two inboxes an operation addresses. */
export type MetaPlatform = 'messenger' | 'instagram';

/**
 * The Instagram Professional account attached to a Page.
 *
 * Instagram Direct has no credential of its own: the Page token is what
 * authorises reading and sending, and the Page is what carries the webhook
 * subscription. An Instagram account is therefore always reached *through*
 * the Page it is linked to, which is why this hangs off MetaManagedPage rather
 * than standing alone.
 */
export interface MetaInstagramAccount {
  /** The IG Professional account id. This is the inbox id webhooks arrive for. */
  id: string;
  username: string | null;
  name: string | null;
  pictureUrl: string | null;
}

export interface MetaManagedPage {
  id: string;
  name: string;
  /** Page-scoped token. Does not expire while the user token that minted it lives. */
  accessToken: string;
  category: string | null;
  pictureUrl: string | null;
  /** True once this Page is delivering messages to this app's webhook. */
  alreadySubscribed: boolean;
  /** Present only when a Professional Instagram account is linked to the Page. */
  instagram: MetaInstagramAccount | null;
}

export interface MetaThreadMessage {
  id: string;
  message: string | null;
  createdTime: string;
  fromId: string | null;
  fromName: string | null;
  attachmentUrls: Array<{ type: string | null; url: string; name: string | null }>;
}

export interface MetaThread {
  id: string;
  /** The customer's Page-scoped id, resolved from the participant list. */
  participantId: string | null;
  participantName: string | null;
  updatedTime: string | null;
  messages: MetaThreadMessage[];
}

function graphBase(): string {
  return `${env.META_GRAPH_API_BASE_URL}/${env.META_GRAPH_API_VERSION}`;
}

/**
 * Guards every entry point below.
 *
 * OAuth needs the app id and secret specifically; the verify token is checked
 * separately by the provider because it matters only to the webhook handshake.
 */
function assertOAuthConfigured(): { appId: string; appSecret: string } {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw new IntegrationConfigurationError(
      'Facebook Login is not configured on this server. Set META_APP_ID and META_APP_SECRET, then restart the API.',
      'FACEBOOK_OAUTH_NOT_CONFIGURED',
    );
  }
  return { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET };
}

/**
 * One Graph call.
 *
 * Mirrors the error handling in the provider: Meta returns 200 with an `error`
 * body often enough that the status alone is not a success signal. Tokens are
 * passed as form bodies or query params here but never logged — the thrown
 * message carries Meta's text only.
 */
async function graphFetch<T>(url: string, init: RequestInit, context: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'network error';
    throw new ProviderError(`Facebook ${context} failed: ${reason}`, 'FACEBOOK_UNREACHABLE');
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  const payload = (parsed ?? {}) as MetaGraphError;
  if (!response.ok || payload.error) {
    const detail = payload.error?.message ?? `HTTP ${response.status}`;
    throw new ProviderError(`Facebook ${context} failed: ${detail}`, 'FACEBOOK_API_ERROR', {
      status: response.status,
      code: payload.error?.code,
      subcode: payload.error?.error_subcode,
    });
  }

  return parsed as T;
}

/**
 * Step 1. The URL the operator's browser is sent to.
 *
 * `state` is the caller's signed CSRF value and is returned untouched by Meta;
 * the service verifies it before acting on the code.
 */
export function buildAuthorizeUrl(state: string): string {
  const { appId } = assertOAuthConfigured();

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: metaOAuthRedirectUri,
    state,
    scope: env.META_OAUTH_SCOPES,
    response_type: 'code',
  });

  return `${OAUTH_DIALOG_BASE}/${env.META_GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
}

/** Step 2. The one-time code from the redirect becomes a short-lived user token. */
export async function exchangeCodeForUserToken(code: string): Promise<string> {
  const { appId, appSecret } = assertOAuthConfigured();

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: metaOAuthRedirectUri,
    code,
  });

  const result = await graphFetch<{ access_token?: string }>(
    `${graphBase()}/oauth/access_token?${params.toString()}`,
    { method: 'GET' },
    'code exchange',
  );

  if (!result.access_token) {
    throw new ProviderError(
      'Facebook returned no access token for this login',
      'FACEBOOK_TOKEN_EXCHANGE_EMPTY',
    );
  }
  return result.access_token;
}

/**
 * Step 3. Short-lived (~1 hour) becomes long-lived (~60 days).
 *
 * This matters even though Page tokens are what get stored: a Page token
 * inherits the lifetime of the user token that minted it, so skipping this
 * would silently break every connected Page an hour later.
 */
export async function extendUserToken(shortLivedToken: string): Promise<string> {
  const { appId, appSecret } = assertOAuthConfigured();

  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const result = await graphFetch<{ access_token?: string }>(
    `${graphBase()}/oauth/access_token?${params.toString()}`,
    { method: 'GET' },
    'token extension',
  );

  // A failure to extend is recoverable — the short-lived token still works for
  // the next few Graph calls, which is all this flow needs.
  return result.access_token ?? shortLivedToken;
}

/**
 * Step 4. The Pages this person administers, each with its own Page token.
 *
 * `is_webhooks_subscribed` tells the UI which Pages are already wired up, so
 * reconnecting an existing Page reads as "already connected" rather than
 * silently doing nothing.
 */
export async function listManagedPages(userAccessToken: string): Promise<MetaManagedPage[]> {
  assertOAuthConfigured();

  const params = new URLSearchParams({
    // `instagram_business_account` is null for a Page with no linked
    // Professional account, which is how the picker knows whether to offer
    // Instagram for that Page at all.
    fields:
      'id,name,access_token,category,picture{url},is_webhooks_subscribed,' +
      'instagram_business_account{id,username,name,profile_picture_url}',
    limit: '100',
    access_token: userAccessToken,
  });

  const result = await graphFetch<{
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      category?: string;
      picture?: { data?: { url?: string } };
      is_webhooks_subscribed?: boolean;
      instagram_business_account?: {
        id?: string;
        username?: string;
        name?: string;
        profile_picture_url?: string;
      };
    }>;
  }>(`${graphBase()}/me/accounts?${params.toString()}`, { method: 'GET' }, 'page list');

  const pages: MetaManagedPage[] = [];
  for (const row of result.data ?? []) {
    // A Page without a token cannot be connected; showing it would produce a
    // picker entry that fails on click.
    if (!row?.id || !row.access_token) continue;
    const ig = row.instagram_business_account;

    pages.push({
      id: row.id,
      name: row.name ?? `Page ${row.id}`,
      accessToken: row.access_token,
      category: row.category ?? null,
      pictureUrl: row.picture?.data?.url ?? null,
      alreadySubscribed: Boolean(row.is_webhooks_subscribed),
      instagram: ig?.id
        ? {
            id: ig.id,
            username: ig.username ?? null,
            name: ig.name ?? null,
            pictureUrl: ig.profile_picture_url ?? null,
          }
        : null,
    });
  }
  return pages;
}

/**
 * Step 5. Subscribe the Page to this app's webhook.
 *
 * This is the step that makes new messages actually arrive. Without it the
 * connect appears to succeed and the inbox stays silent forever, which is the
 * single most common way this integration is misconfigured.
 */
export async function subscribePageToApp(pageId: string, pageAccessToken: string): Promise<void> {
  assertOAuthConfigured();

  const body = new URLSearchParams({
    subscribed_fields: 'messages,messaging_postbacks,message_deliveries,message_reads,messaging_optins',
    access_token: pageAccessToken,
  });

  const result = await graphFetch<{ success?: boolean }>(
    `${graphBase()}/${pageId}/subscribed_apps`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    'page webhook subscription',
  );

  if (result.success === false) {
    throw new ProviderError(
      'Facebook refused the webhook subscription for this Page',
      'FACEBOOK_SUBSCRIBE_REFUSED',
      { pageId },
    );
  }
}

/** Reverses step 5, so a disconnect stops delivery instead of orphaning it. */
export async function unsubscribePageFromApp(
  pageId: string,
  pageAccessToken: string,
): Promise<void> {
  assertOAuthConfigured();

  const params = new URLSearchParams({ access_token: pageAccessToken });
  await graphFetch<{ success?: boolean }>(
    `${graphBase()}/${pageId}/subscribed_apps?${params.toString()}`,
    { method: 'DELETE' },
    'page webhook unsubscribe',
  );
}

/**
 * Step 6. The threads that already exist on the Page.
 *
 * Webhooks only deliver what arrives after subscribing, so without this the
 * inbox is empty until a customer happens to write in. Meta caps `limit` at 100
 * per edge; the caller picks smaller numbers than that.
 *
 * The nested `messages{...}` expansion returns each thread's most recent
 * messages newest-first, which is why the caller reverses before ingesting.
 */
export interface FetchConversationsInput {
  /**
   * Always a Facebook Page id, even for Instagram: the conversations edge
   * hangs off the Page, and `platform` selects which inbox it reports.
   */
  pageId: string;
  accessToken: string;
  platform: MetaPlatform;
  /**
   * The ids that identify the business side of a thread — the Page id, and the
   * linked Instagram account id when there is one. Whichever participant is not
   * in this set is the customer.
   */
  selfIds: string[];
  threadLimit: number;
  messageLimit: number;
}

export async function fetchRecentConversations(
  options: FetchConversationsInput,
): Promise<MetaThread[]> {
  assertOAuthConfigured();

  const { pageId, accessToken, platform, selfIds } = options;

  const params = new URLSearchParams({
    fields: `participants{id,name,username},updated_time,messages.limit(${options.messageLimit}){id,message,created_time,from,attachments{mime_type,name,image_data,file_url}}`,
    limit: String(options.threadLimit),
    access_token: accessToken,
    // Omitted for Messenger, where it is the default; required for Instagram,
    // which otherwise returns the Page's Facebook threads instead.
    ...(platform === 'instagram' ? { platform: 'instagram' } : {}),
  });

  const result = await graphFetch<{
    data?: Array<{
      id?: string;
      updated_time?: string;
      participants?: { data?: Array<{ id?: string; name?: string; username?: string; email?: string }> };
      messages?: {
        data?: Array<{
          id?: string;
          message?: string;
          created_time?: string;
          from?: { id?: string; name?: string };
          attachments?: {
            data?: Array<{
              mime_type?: string;
              name?: string;
              image_data?: { url?: string; preview_url?: string };
              file_url?: string;
            }>;
          };
        }>;
      };
    }>;
  }>(`${graphBase()}/${pageId}/conversations?${params.toString()}`, { method: 'GET' }, 'conversation history');

  const threads: MetaThread[] = [];

  for (const row of result.data ?? []) {
    if (!row?.id) continue;

    // The participant list holds both sides. Whichever participant is not the
    // business is the customer; a thread with no such participant is the
    // business talking to itself and has no one to attribute messages to.
    const participants = row.participants?.data ?? [];
    const customer = participants.find(
      (participant) => participant?.id && !selfIds.includes(participant.id),
    );

    const messages: MetaThreadMessage[] = [];
    for (const message of row.messages?.data ?? []) {
      if (!message?.id || !message.created_time) continue;

      const attachmentUrls: MetaThreadMessage['attachmentUrls'] = [];
      for (const attachment of message.attachments?.data ?? []) {
        const url = attachment?.image_data?.url ?? attachment?.file_url ?? null;
        if (!url) continue;
        attachmentUrls.push({
          type: attachment.mime_type ?? null,
          url,
          name: attachment.name ?? null,
        });
      }

      messages.push({
        id: message.id,
        message: typeof message.message === 'string' && message.message.length > 0 ? message.message : null,
        createdTime: message.created_time,
        fromId: message.from?.id ?? null,
        fromName: message.from?.name ?? null,
        attachmentUrls,
      });
    }

    threads.push({
      id: row.id,
      participantId: customer?.id ?? null,
      // Instagram reports `username`; Messenger reports `name`.
      participantName: customer?.name ?? customer?.username ?? null,
      updatedTime: row.updated_time ?? null,
      messages,
    });
  }

  logger.debug({ pageId, platform, threads: threads.length }, 'Fetched Meta conversation history');
  return threads;
}
