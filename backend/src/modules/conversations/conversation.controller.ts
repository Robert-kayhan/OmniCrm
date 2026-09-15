import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { body, params, query } from '../../middleware/validate';
import { sendCreated, sendSuccess } from '../../utils/response';
import type { IdParam } from '../../utils/validation';
import { auditContextFromRequest } from '../audit-logs/audit-log.service';
import * as conversationService from './conversation.service';
import type {
  ConversationTagParam,
  ConversationTagsInput,
  CreateConversationInput,
  ListConversationsQuery,
  UpdatePriorityInput,
  UpdateStatusInput,
} from './conversation.schema';

export async function listConversationsHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const result = await conversationService.listConversations(
    auth,
    query<ListConversationsQuery>(req),
  );
  return sendSuccess(res, result.items, 200, result.meta);
}

export async function conversationStatsHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  return sendSuccess(res, await conversationService.getConversationStats(auth));
}

export async function getConversationHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  return sendSuccess(res, await conversationService.getConversationById(auth, id));
}

export async function createConversationHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const conversation = await conversationService.createConversation(
    auth,
    body<CreateConversationInput>(req),
    auditContextFromRequest(req),
  );
  return sendCreated(res, conversation);
}

export async function updateStatusHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const conversation = await conversationService.updateStatus(
    auth,
    id,
    body<UpdateStatusInput>(req),
    auditContextFromRequest(req),
  );
  return sendSuccess(res, conversation);
}

export async function updatePriorityHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const conversation = await conversationService.updatePriority(
    auth,
    id,
    body<UpdatePriorityInput>(req),
    auditContextFromRequest(req),
  );
  return sendSuccess(res, conversation);
}

export async function markReadHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  return sendSuccess(res, await conversationService.markConversationRead(auth, id));
}

export async function addTagsHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const conversation = await conversationService.addConversationTags(
    auth,
    id,
    body<ConversationTagsInput>(req),
  );
  return sendSuccess(res, conversation);
}

export async function removeTagHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id, tagId } = params<ConversationTagParam>(req);
  return sendSuccess(res, await conversationService.removeConversationTag(auth, id, tagId));
}
