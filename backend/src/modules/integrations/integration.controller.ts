import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getAuth } from '../../middleware/authenticate';
import { body, params, query } from '../../middleware/validate';
import { sendCreated, sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/errors';
import type { IdParam } from '../../utils/validation';
import { auditContextFromRequest } from '../audit-logs/audit-log.service';
import * as service from './integration.service';
import * as oauth from './meta-oauth.service';
import { channelForIntegrationType } from '../../channels';
import type {
  ConnectFacebookInput,
  ConnectFacebookPageInput,
  FacebookOAuthCallbackQuery,
  ListIntegrationsQuery,
  UpdateIntegrationInput,
} from './integration.schema';

export async function listIntegrationsHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const items = await service.listIntegrations(
    auth.organizationId,
    query<ListIntegrationsQuery>(req),
  );
  return sendSuccess(res, items);
}

/** Powers the integrations settings screen, including not-yet-built channels. */
export async function channelCatalogueHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  return sendSuccess(res, await service.getChannelCatalogue(auth.organizationId));
}

export async function getIntegrationHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  return sendSuccess(res, await service.getIntegrationById(auth.organizationId, id));
}

export async function connectFacebookHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const integration = await service.connectFacebook(
    auth,
    body<ConnectFacebookInput>(req),
    auditContextFromRequest(req),
  );
  return sendCreated(res, integration);
}

export async function updateIntegrationHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const integration = await service.updateIntegration(
    auth,
    id,
    body<UpdateIntegrationInput>(req),
    auditContextFromRequest(req),
  );
  return sendSuccess(res, integration);
}

export async function disconnectIntegrationHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const integration = await service.disconnectIntegration(
    auth,
    id,
    auditContextFromRequest(req),
  );
  return sendSuccess(res, integration);
}


/**
 * Hands the browser the Meta login URL.
 *
 * Returns the URL rather than issuing a 302 so the frontend can open it in a
 * popup and keep the settings page mounted behind it.
 */
export async function startFacebookOAuthHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  return sendSuccess(res, oauth.startFacebookLogin(auth));
}

/** The Pages behind a completed login, re-read after the redirect. */
export async function facebookOAuthPagesHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { handoffId } = query<{ handoffId: string }>(req);
  return sendSuccess(res, await oauth.listHandoffPages(auth, handoffId));
}

/** Where the settings page lives, for every redirect out of the callback. */
function settingsUrl(params: Record<string, string>): string {
  const url = new URL('/settings/integrations', env.FRONTEND_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Meta's redirect target.
 *
 * Unauthenticated by necessity: the browser arrives from facebook.com with no
 * bearer token, and the signed `state` is what establishes the operator. It
 * always answers with a redirect back into the app — never JSON — because a
 * person is looking at this response, and it never puts a token in the URL.
 */
export async function facebookOAuthCallbackHandler(req: Request, res: Response) {
  const callback = query<FacebookOAuthCallbackQuery>(req);

  // The operator pressed Cancel in Meta's dialog.
  if (callback.error || !callback.code) {
    const reason =
      callback.error_description ?? callback.error ?? 'The Facebook login was cancelled.';
    return res.redirect(settingsUrl({ fb_error: reason }));
  }

  try {
    const result = await oauth.completeFacebookLogin(callback.code, callback.state);
    return res.redirect(settingsUrl({ fb_handoff: result.handoffId }));
  } catch (error) {
    // A thrown error here would render the API's JSON error page in the
    // operator's browser, stranding them outside the app.
    const message =
      error instanceof AppError
        ? error.message
        : 'Could not complete the Facebook login. Please try again.';
    logger.warn({ err: error }, 'Facebook OAuth callback failed');
    return res.redirect(settingsUrl({ fb_error: message }));
  }
}

/** Connects the inbox the operator picked and reports what the import found. */
export async function connectFacebookPageHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const input = body<ConnectFacebookPageInput>(req);
  const result = await oauth.connectPageFromHandoff(
    auth,
    input.handoffId,
    input.pageId,
    input.name,
    auditContextFromRequest(req),
    channelForIntegrationType(input.channel),
  );
  return sendCreated(res, result);
}
