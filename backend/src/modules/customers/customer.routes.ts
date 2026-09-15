import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../utils/validation';
import * as controller from './customer.controller';
import * as channelController from '../customer-channels/customer-channel.controller';
import {
  createCustomerChannelSchema,
  customerChannelParamSchema,
} from '../customer-channels/customer-channel.schema';
import * as noteController from '../notes/note.controller';
import { createNoteSchema, listNotesQuerySchema } from '../notes/note.schema';
import {
  createCustomerSchema,
  customerTagParamSchema,
  customerTagsSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from './customer.schema';

export const customerRouter = Router();

customerRouter.use(authenticate);

customerRouter.get(
  '/',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validate({ query: listCustomersQuerySchema }),
  asyncHandler(controller.listCustomersHandler),
);

customerRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validate({ params: idParamSchema }),
  asyncHandler(controller.getCustomerHandler),
);

customerRouter.post(
  '/',
  requirePermission(PERMISSIONS.CUSTOMER_CREATE),
  validate({ body: createCustomerSchema }),
  asyncHandler(controller.createCustomerHandler),
);

customerRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMER_UPDATE),
  validate({ params: idParamSchema, body: updateCustomerSchema }),
  asyncHandler(controller.updateCustomerHandler),
);

customerRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMER_DELETE),
  validate({ params: idParamSchema }),
  asyncHandler(controller.deleteCustomerHandler),
);

// --- Tags -----------------------------------------------------------------

customerRouter.post(
  '/:id/tags',
  requirePermission(PERMISSIONS.CUSTOMER_UPDATE),
  validate({ params: idParamSchema, body: customerTagsSchema }),
  asyncHandler(controller.addCustomerTagsHandler),
);

customerRouter.delete(
  '/:id/tags/:tagId',
  requirePermission(PERMISSIONS.CUSTOMER_UPDATE),
  validate({ params: customerTagParamSchema }),
  asyncHandler(controller.removeCustomerTagHandler),
);

// --- Channel identities ---------------------------------------------------

customerRouter.get(
  '/:id/channels',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validate({ params: idParamSchema }),
  asyncHandler(channelController.listCustomerChannelsHandler),
);

customerRouter.post(
  '/:id/channels',
  requirePermission(PERMISSIONS.CUSTOMER_UPDATE),
  validate({ params: idParamSchema, body: createCustomerChannelSchema }),
  asyncHandler(channelController.createCustomerChannelHandler),
);

customerRouter.delete(
  '/:id/channels/:channelId',
  requirePermission(PERMISSIONS.CUSTOMER_UPDATE),
  validate({ params: customerChannelParamSchema }),
  asyncHandler(channelController.deleteCustomerChannelHandler),
);

// --- Notes ----------------------------------------------------------------

customerRouter.get(
  '/:id/notes',
  requirePermission(PERMISSIONS.NOTE_READ),
  validate({ params: idParamSchema, query: listNotesQuerySchema }),
  asyncHandler(noteController.listCustomerNotesHandler),
);

customerRouter.post(
  '/:id/notes',
  requirePermission(PERMISSIONS.NOTE_CREATE),
  validate({ params: idParamSchema, body: createNoteSchema }),
  asyncHandler(noteController.createCustomerNoteHandler),
);
