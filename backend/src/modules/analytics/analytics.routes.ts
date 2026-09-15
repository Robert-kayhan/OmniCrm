import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { asyncHandler } from '../../utils/async-handler';
import * as controller from './analytics.controller';
import { analyticsQuerySchema } from './analytics.schema';

/**
 * Reporting is a workspace-wide view, so it requires the permission that grants
 * workspace-wide visibility. An agent who can only see their own queue would
 * get numbers that look authoritative but describe a slice, which is worse than
 * no numbers at all.
 */
export const analyticsRouter = Router();

analyticsRouter.use(authenticate);

analyticsRouter.get(
  '/overview',
  requirePermission(PERMISSIONS.CONVERSATION_READ_ALL),
  validate({ query: analyticsQuerySchema }),
  asyncHandler(controller.overviewHandler),
);
