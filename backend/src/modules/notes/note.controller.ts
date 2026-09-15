import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { body, params, query } from '../../middleware/validate';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/response';
import type { IdParam } from '../../utils/validation';
import { assertConversationAccess } from '../conversations/conversation.access';
import * as noteService from './note.service';
import type { CreateNoteInput, ListNotesQuery } from './note.schema';

export async function listCustomerNotesHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const result = await noteService.listCustomerNotes(
    auth.organizationId,
    id,
    query<ListNotesQuery>(req),
  );
  return sendSuccess(res, result.items, 200, result.meta);
}

export async function createCustomerNoteHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const note = await noteService.createCustomerNote(auth, id, body<CreateNoteInput>(req));
  return sendCreated(res, note);
}

export async function listConversationNotesHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  await assertConversationAccess(auth, id);
  const result = await noteService.listConversationNotes(
    auth.organizationId,
    id,
    query<ListNotesQuery>(req),
  );
  return sendSuccess(res, result.items, 200, result.meta);
}

export async function createConversationNoteHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const conversation = await assertConversationAccess(auth, id);
  const note = await noteService.createConversationNote(
    auth,
    id,
    conversation.customerId,
    body<CreateNoteInput>(req),
  );
  return sendCreated(res, note);
}

export async function deleteNoteHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  await noteService.deleteNote(auth, id);
  return sendNoContent(res);
}
