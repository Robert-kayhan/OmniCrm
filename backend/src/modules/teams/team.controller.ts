import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { body, params, query } from '../../middleware/validate';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/response';
import type { IdParam } from '../../utils/validation';
import { auditContextFromRequest } from '../audit-logs/audit-log.service';
import * as teamService from './team.service';
import type {
  CreateTeamInput,
  ListTeamsQuery,
  TeamMemberParam,
  TeamMembersInput,
  UpdateTeamInput,
} from './team.schema';

export async function listTeamsHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const result = await teamService.listTeams(auth.organizationId, query<ListTeamsQuery>(req));
  return sendSuccess(res, result.items, 200, result.meta);
}

export async function getTeamHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  return sendSuccess(res, await teamService.getTeamById(auth.organizationId, id));
}

export async function createTeamHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const team = await teamService.createTeam(
    auth,
    body<CreateTeamInput>(req),
    auditContextFromRequest(req),
  );
  return sendCreated(res, team);
}

export async function updateTeamHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const team = await teamService.updateTeam(
    auth,
    id,
    body<UpdateTeamInput>(req),
    auditContextFromRequest(req),
  );
  return sendSuccess(res, team);
}

export async function deleteTeamHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  await teamService.deleteTeam(auth, id, auditContextFromRequest(req));
  return sendNoContent(res);
}

export async function addTeamMembersHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const team = await teamService.addTeamMembers(
    auth,
    id,
    body<TeamMembersInput>(req),
    auditContextFromRequest(req),
  );
  return sendSuccess(res, team);
}

export async function removeTeamMemberHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id, userId } = params<TeamMemberParam>(req);
  const team = await teamService.removeTeamMember(
    auth,
    id,
    userId,
    auditContextFromRequest(req),
  );
  return sendSuccess(res, team);
}
