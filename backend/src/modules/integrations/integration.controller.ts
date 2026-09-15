import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { body, params, query } from '../../middleware/validate';
import { sendCreated, sendSuccess } from '../../utils/response';
import type { IdParam } from '../../utils/validation';
import { auditContextFromRequest } from '../audit-logs/audit-log.service';
import * as service from './integration.service';
import type {
  ConnectFacebookInput,
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
