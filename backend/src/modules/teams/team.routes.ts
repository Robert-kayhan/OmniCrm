import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../utils/validation';
import * as controller from './team.controller';
import {
  createTeamSchema,
  listTeamsQuerySchema,
  teamMemberParamSchema,
  teamMembersSchema,
  updateTeamSchema,
} from './team.schema';

export const teamRouter = Router();

teamRouter.use(authenticate);

teamRouter.get(
  '/',
  requirePermission(PERMISSIONS.TEAM_READ),
  validate({ query: listTeamsQuerySchema }),
  asyncHandler(controller.listTeamsHandler),
);

teamRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.TEAM_READ),
  validate({ params: idParamSchema }),
  asyncHandler(controller.getTeamHandler),
);

teamRouter.post(
  '/',
  requirePermission(PERMISSIONS.TEAM_CREATE),
  validate({ body: createTeamSchema }),
  asyncHandler(controller.createTeamHandler),
);

teamRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.TEAM_UPDATE),
  validate({ params: idParamSchema, body: updateTeamSchema }),
  asyncHandler(controller.updateTeamHandler),
);

teamRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.TEAM_DELETE),
  validate({ params: idParamSchema }),
  asyncHandler(controller.deleteTeamHandler),
);

teamRouter.post(
  '/:id/members',
  requirePermission(PERMISSIONS.TEAM_UPDATE),
  validate({ params: idParamSchema, body: teamMembersSchema }),
  asyncHandler(controller.addTeamMembersHandler),
);

teamRouter.delete(
  '/:id/members/:userId',
  requirePermission(PERMISSIONS.TEAM_UPDATE),
  validate({ params: teamMemberParamSchema }),
  asyncHandler(controller.removeTeamMemberHandler),
);
