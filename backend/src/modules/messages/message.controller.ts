import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { body, params, query } from '../../middleware/validate';
import { sendCreated, sendSuccess } from '../../utils/response';
import type { IdParam } from '../../utils/validation';
import * as messageService from './message.service';
import type { ListMessagesQuery, SendMessageInput } from './message.schema';

export async function listMessagesHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const result = await messageService.listMessages(auth, id, query<ListMessagesQuery>(req));
  return sendSuccess(res, result.items, 200, result.meta);
}

export async function sendMessageHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const message = await messageService.sendMessage(auth, id, body<SendMessageInput>(req));
  return sendCreated(res, message);
}
