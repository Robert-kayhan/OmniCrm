import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../utils/validation';
import * as controller from './conversation.controller';
import * as messageController from '../messages/message.controller';
import { listMessagesQuerySchema, sendMessageSchema } from '../messages/message.schema';
import * as assignmentController from '../assignments/assignment.controller';
import { assignConversationSchema } from '../assignments/assignment.schema';
import * as noteController from '../notes/note.controller';
import { createNoteSchema, listNotesQuerySchema } from '../notes/note.schema';
import {
  conversationTagParamSchema,
  conversationTagsSchema,
  createConversationSchema,
  listConversationsQuerySchema,
  updatePrioritySchema,
  updateStatusSchema,
} from './conversation.schema';

export const conversationRouter = Router();

conversationRouter.use(authenticate);

conversationRouter.get(
  '/',
  requirePermission(PERMISSIONS.CONVERSATION_READ),
  validate({ query: listConversationsQuerySchema }),
  asyncHandler(controller.listConversationsHandler),
);

// Declared before `/:id` so "stats" is not parsed as a conversation id.
conversationRouter.get(
  '/stats',
  requirePermission(PERMISSIONS.CONVERSATION_READ),
  asyncHandler(controller.conversationStatsHandler),
);

conversationRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.CONVERSATION_READ),
  validate({ params: idParamSchema }),
  asyncHandler(controller.getConversationHandler),
);

conversationRouter.post(
  '/',
  requirePermission(PERMISSIONS.CONVERSATION_CREATE),
  validate({ body: createConversationSchema }),
  asyncHandler(controller.createConversationHandler),
);

conversationRouter.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.CONVERSATION_UPDATE),
  validate({ params: idParamSchema, body: updateStatusSchema }),
  asyncHandler(controller.updateStatusHandler),
);

conversationRouter.patch(
  '/:id/priority',
  requirePermission(PERMISSIONS.CONVERSATION_UPDATE),
  validate({ params: idParamSchema, body: updatePrioritySchema }),
  asyncHandler(controller.updatePriorityHandler),
);

conversationRouter.post(
  '/:id/read',
  requirePermission(PERMISSIONS.CONVERSATION_READ),
  validate({ params: idParamSchema }),
  asyncHandler(controller.markReadHandler),
);

// --- Messages -------------------------------------------------------------

conversationRouter.get(
  '/:id/messages',
  requirePermission(PERMISSIONS.MESSAGE_READ),
  validate({ params: idParamSchema, query: listMessagesQuerySchema }),
  asyncHandler(messageController.listMessagesHandler),
);

conversationRouter.post(
  '/:id/messages',
  requirePermission(PERMISSIONS.MESSAGE_SEND),
  validate({ params: idParamSchema, body: sendMessageSchema }),
  asyncHandler(messageController.sendMessageHandler),
);

// --- Assignment -----------------------------------------------------------

conversationRouter.post(
  '/:id/assign',
  requirePermission(PERMISSIONS.CONVERSATION_ASSIGN),
  validate({ params: idParamSchema, body: assignConversationSchema }),
  asyncHandler(assignmentController.assignConversationHandler),
);

conversationRouter.get(
  '/:id/assignments',
  requirePermission(PERMISSIONS.CONVERSATION_READ),
  validate({ params: idParamSchema }),
  asyncHandler(assignmentController.assignmentHistoryHandler),
);

// --- Tags -----------------------------------------------------------------

conversationRouter.post(
  '/:id/tags',
  requirePermission(PERMISSIONS.CONVERSATION_UPDATE),
  validate({ params: idParamSchema, body: conversationTagsSchema }),
  asyncHandler(controller.addTagsHandler),
);

conversationRouter.delete(
  '/:id/tags/:tagId',
  requirePermission(PERMISSIONS.CONVERSATION_UPDATE),
  validate({ params: conversationTagParamSchema }),
  asyncHandler(controller.removeTagHandler),
);

// --- Internal notes -------------------------------------------------------

conversationRouter.get(
  '/:id/notes',
  requirePermission(PERMISSIONS.NOTE_READ),
  validate({ params: idParamSchema, query: listNotesQuerySchema }),
  asyncHandler(noteController.listConversationNotesHandler),
);

conversationRouter.post(
  '/:id/notes',
  requirePermission(PERMISSIONS.NOTE_CREATE),
  validate({ params: idParamSchema, body: createNoteSchema }),
  asyncHandler(noteController.createConversationNoteHandler),
);
