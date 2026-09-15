import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../utils/validation';
import * as controller from './integration.controller';
import {
  connectFacebookPageSchema,
  connectFacebookSchema,
  facebookOAuthCallbackSchema,
  facebookOAuthPagesQuerySchema,
  listIntegrationsQuerySchema,
  updateIntegrationSchema,
} from './integration.schema';

export const integrationRouter = Router();

/**
 * Meta's OAuth redirect. Deliberately mounted above `authenticate`: the
 * operator's browser arrives here straight from facebook.com with no bearer
 * token. The signed `state` carries the identity instead, and the handler
 * always redirects back into the app rather than returning JSON.
 */
integrationRouter.get(
  '/facebook/oauth/callback',
  validate({ query: facebookOAuthCallbackSchema }),
  asyncHandler(controller.facebookOAuthCallbackHandler),
);

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

/**
 * The OAuth entry point and the Page picker behind it.
 *
 * Both sit above `/:id` so "facebook" is never parsed as an integration id.
 */
integrationRouter.get(
  '/facebook/oauth/start',
  requirePermission(PERMISSIONS.INTEGRATION_MANAGE),
  asyncHandler(controller.startFacebookOAuthHandler),
);

integrationRouter.get(
  '/facebook/oauth/pages',
  requirePermission(PERMISSIONS.INTEGRATION_MANAGE),
  validate({ query: facebookOAuthPagesQuerySchema }),
  asyncHandler(controller.facebookOAuthPagesHandler),
);

integrationRouter.post(
  '/facebook/pages',
  requirePermission(PERMISSIONS.INTEGRATION_MANAGE),
  validate({ body: connectFacebookPageSchema }),
  asyncHandler(controller.connectFacebookPageHandler),
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
