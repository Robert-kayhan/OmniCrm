import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { body } from '../../middleware/validate';
import { sendSuccess } from '../../utils/response';
import { auditContextFromRequest } from '../audit-logs/audit-log.service';
import * as organizationService from './organization.service';
import type { UpdateOrganizationInput } from './organization.schema';

export async function getCurrentOrganizationHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  return sendSuccess(res, await organizationService.getOrganization(auth.organizationId));
}

export async function updateCurrentOrganizationHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const updated = await organizationService.updateOrganization(
    auth,
    body<UpdateOrganizationInput>(req),
    auditContextFromRequest(req),
  );
  return sendSuccess(res, updated);
}

export async function getStatsHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  return sendSuccess(res, await organizationService.getOrganizationStats(auth.organizationId));
}
