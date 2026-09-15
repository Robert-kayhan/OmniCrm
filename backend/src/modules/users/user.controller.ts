import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { body, params, query } from '../../middleware/validate';
import { sendCreated, sendNoContent, sendSuccess } from '../../utils/response';
import type { IdParam } from '../../utils/validation';
import { auditContextFromRequest } from '../audit-logs/audit-log.service';
import * as userService from './user.service';
import type {
  CreateUserInput,
  ListUsersQuery,
  ResetUserPasswordInput,
  UpdateProfileInput,
  UpdateUserInput,
} from './user.schema';

export async function listUsersHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const result = await userService.listUsers(auth.organizationId, query<ListUsersQuery>(req));
  return sendSuccess(res, result.items, 200, result.meta);
}

export async function listAssignableUsersHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  return sendSuccess(res, await userService.listAssignableUsers(auth.organizationId));
}

export async function getUserHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  return sendSuccess(res, await userService.getUserById(auth.organizationId, id));
}

export async function createUserHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const result = await userService.createUser(
    auth,
    body<CreateUserInput>(req),
    auditContextFromRequest(req),
  );
  return sendCreated(res, result);
}

export async function updateUserHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const updated = await userService.updateUser(
    auth,
    id,
    body<UpdateUserInput>(req),
    auditContextFromRequest(req),
  );
  return sendSuccess(res, updated);
}

export async function updateOwnProfileHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  return sendSuccess(res, await userService.updateOwnProfile(auth, body<UpdateProfileInput>(req)));
}

export async function deleteUserHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  await userService.deleteUser(auth, id, auditContextFromRequest(req));
  return sendNoContent(res);
}

export async function resetUserPasswordHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  const result = await userService.resetUserPassword(
    auth,
    id,
    body<ResetUserPasswordInput>(req),
    auditContextFromRequest(req),
  );
  return sendSuccess(res, result);
}
