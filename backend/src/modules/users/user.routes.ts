import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../utils/validation';
import * as controller from './user.controller';
import {
  createUserSchema,
  listUsersQuerySchema,
  resetUserPasswordSchema,
  updateProfileSchema,
  updateUserSchema,
} from './user.schema';

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get(
  '/',
  requirePermission(PERMISSIONS.USER_READ),
  validate({ query: listUsersQuerySchema }),
  asyncHandler(controller.listUsersHandler),
);

// Registered before `/:id` so the literal path is not swallowed by the param route.
userRouter.get(
  '/assignable',
  requirePermission(PERMISSIONS.USER_READ),
  asyncHandler(controller.listAssignableUsersHandler),
);

userRouter.patch(
  '/me',
  validate({ body: updateProfileSchema }),
  asyncHandler(controller.updateOwnProfileHandler),
);

userRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.USER_READ),
  validate({ params: idParamSchema }),
  asyncHandler(controller.getUserHandler),
);

userRouter.post(
  '/',
  requirePermission(PERMISSIONS.USER_CREATE),
  validate({ body: createUserSchema }),
  asyncHandler(controller.createUserHandler),
);

userRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validate({ params: idParamSchema, body: updateUserSchema }),
  asyncHandler(controller.updateUserHandler),
);

userRouter.post(
  '/:id/reset-password',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validate({ params: idParamSchema, body: resetUserPasswordSchema }),
  asyncHandler(controller.resetUserPasswordHandler),
);

userRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.USER_DELETE),
  validate({ params: idParamSchema }),
  asyncHandler(controller.deleteUserHandler),
);
