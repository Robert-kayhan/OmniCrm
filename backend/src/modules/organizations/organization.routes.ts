import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { asyncHandler } from '../../utils/async-handler';
import * as controller from './organization.controller';
import { updateOrganizationSchema } from './organization.schema';

export const organizationRouter = Router();

organizationRouter.use(authenticate);

// Always "current": the organization comes from the token, never from the path,
// so there is no id for a caller to tamper with.
organizationRouter.get(
  '/current',
  requirePermission(PERMISSIONS.ORG_READ),
  asyncHandler(controller.getCurrentOrganizationHandler),
);

organizationRouter.patch(
  '/current',
  requirePermission(PERMISSIONS.ORG_UPDATE),
  validate({ body: updateOrganizationSchema }),
  asyncHandler(controller.updateCurrentOrganizationHandler),
);

organizationRouter.get(
  '/current/stats',
  requirePermission(PERMISSIONS.ORG_READ),
  asyncHandler(controller.getStatsHandler),
);
