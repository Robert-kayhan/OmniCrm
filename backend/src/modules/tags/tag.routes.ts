import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../utils/validation';
import * as controller from './tag.controller';
import { createTagSchema, listTagsQuerySchema, updateTagSchema } from './tag.schema';

export const tagRouter = Router();

tagRouter.use(authenticate);

tagRouter.get(
  '/',
  requirePermission(PERMISSIONS.TAG_READ),
  validate({ query: listTagsQuerySchema }),
  asyncHandler(controller.listTagsHandler),
);

tagRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.TAG_READ),
  validate({ params: idParamSchema }),
  asyncHandler(controller.getTagHandler),
);

tagRouter.post(
  '/',
  requirePermission(PERMISSIONS.TAG_MANAGE),
  validate({ body: createTagSchema }),
  asyncHandler(controller.createTagHandler),
);

tagRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.TAG_MANAGE),
  validate({ params: idParamSchema, body: updateTagSchema }),
  asyncHandler(controller.updateTagHandler),
);

tagRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.TAG_MANAGE),
  validate({ params: idParamSchema }),
  asyncHandler(controller.deleteTagHandler),
);
