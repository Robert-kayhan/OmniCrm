import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { body, params } from '../../middleware/validate';
import { sendSuccess } from '../../utils/response';
import type { IdParam } from '../../utils/validation';
import { auditContextFromRequest } from '../audit-logs/audit-log.service';
import * as assignmentService from './assignment.service';
import type { AssignConversationInput } from './assignment.schema';

export async function assignConversationHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const conversation = await assignmentService.assignConversation(
    auth,
    id,
    body<AssignConversationInput>(req),
    auditContextFromRequest(req),
  );
  return sendSuccess(res, conversation);
}

export async function assignmentHistoryHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  return sendSuccess(res, await assignmentService.listAssignmentHistory(auth, id));
}
