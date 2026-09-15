import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { body, params, query } from '../../middleware/validate';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/response';
import type { IdParam } from '../../utils/validation';
import * as tagService from './tag.service';
import type { CreateTagInput, ListTagsQuery, UpdateTagInput } from './tag.schema';

export async function listTagsHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const result = await tagService.listTags(auth.organizationId, query<ListTagsQuery>(req));
  return sendSuccess(res, result.items, 200, result.meta);
}

export async function getTagHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  return sendSuccess(res, await tagService.getTagById(auth.organizationId, id));
}

export async function createTagHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  return sendCreated(res, await tagService.createTag(auth, body<CreateTagInput>(req)));
}

export async function updateTagHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  return sendSuccess(res, await tagService.updateTag(auth, id, body<UpdateTagInput>(req)));
}

export async function deleteTagHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  await tagService.deleteTag(auth, id);
  return sendNoContent(res);
}
