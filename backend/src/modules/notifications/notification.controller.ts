import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { params, query } from '../../middleware/validate';
import { sendSuccess } from '../../utils/response';
import type { IdParam } from '../../utils/validation';
import * as service from './notification.service';
import type { ListNotificationsQuery } from './notification.schema';

export async function listNotificationsHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const result = await service.listNotifications(auth, query<ListNotificationsQuery>(req));
  return sendSuccess(res, { items: result.items, unread: result.unread }, 200, result.meta);
}

export async function unreadCountHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  return sendSuccess(res, { unread: await service.getUnreadCount(auth) });
}

export async function markReadHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const { id } = params<IdParam>(req);
  return sendSuccess(res, await service.markNotificationRead(auth, id));
}

export async function markAllReadHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  return sendSuccess(res, await service.markAllNotificationsRead(auth));
}
