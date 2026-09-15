import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../utils/validation';
import * as controller from './notification.controller';
import { listNotificationsQuerySchema } from './notification.schema';

/**
 * No permission checks here: every route is implicitly scoped to the caller's
 * own notifications, so there is nothing an authenticated user should not see.
 */
export const notificationRouter = Router();

notificationRouter.use(authenticate);

notificationRouter.get(
  '/',
  validate({ query: listNotificationsQuerySchema }),
  asyncHandler(controller.listNotificationsHandler),
);

notificationRouter.get('/unread-count', asyncHandler(controller.unreadCountHandler));

notificationRouter.post('/read-all', asyncHandler(controller.markAllReadHandler));

notificationRouter.patch(
  '/:id/read',
  validate({ params: idParamSchema }),
  asyncHandler(controller.markReadHandler),
);
