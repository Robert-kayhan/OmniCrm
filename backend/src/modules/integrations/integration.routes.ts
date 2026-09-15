import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../utils/validation';
import * as controller from './integration.controller';
import {
  connectFacebookSchema,
  listIntegrationsQuerySchema,
  updateIntegrationSchema,
} from './integration.schema';

export const integrationRouter = Router();

integrationRouter.use(authenticate);

integrationRouter.get(
  '/',
  requirePermission(PERMISSIONS.INTEGRATION_READ),
  validate({ query: listIntegrationsQuerySchema }),
  asyncHandler(controller.listIntegrationsHandler),
);

integrationRouter.get(
  '/catalogue',
  requirePermission(PERMISSIONS.INTEGRATION_READ),
  asyncHandler(controller.channelCatalogueHandler),
);

integrationRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.INTEGRATION_READ),
  validate({ params: idParamSchema }),
  asyncHandler(controller.getIntegrationHandler),
);

integrationRouter.post(
  '/facebook',
  requirePermission(PERMISSIONS.INTEGRATION_MANAGE),
  validate({ body: connectFacebookSchema }),
  asyncHandler(controller.connectFacebookHandler),
);

integrationRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.INTEGRATION_MANAGE),
  validate({ params: idParamSchema, body: updateIntegrationSchema }),
  asyncHandler(controller.updateIntegrationHandler),
);

integrationRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.INTEGRATION_MANAGE),
  validate({ params: idParamSchema }),
  asyncHandler(controller.disconnectIntegrationHandler),
);
