import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../utils/validation';
import * as controller from './note.controller';

/**
 * Notes are created and listed through their parent (`/customers/:id/notes`,
 * `/conversations/:id/notes`). Only deletion needs a top-level route, because a
 * note id is enough to identify it.
 */
export const noteRouter = Router();

noteRouter.use(authenticate);

noteRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.NOTE_READ),
  validate({ params: idParamSchema }),
  asyncHandler(controller.deleteNoteHandler),
);
