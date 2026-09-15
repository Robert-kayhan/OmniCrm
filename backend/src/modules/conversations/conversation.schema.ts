import { z } from 'zod';
import {
  Channel,
  ConversationPriority,
  ConversationStatus,
} from '../../generated/prisma/enums';
import { pageQuerySchema } from '../../utils/pagination';
import { csvOf, idSchema, optionalCleanText } from '../../utils/validation';

export const listConversationsQuerySchema = pageQuerySchema.extend({
  /** Matches customer name/email/phone and message content. */
  search: z.string().trim().max(160).optional(),
  status: csvOf(z.enum(ConversationStatus)).optional(),
  channel: csvOf(z.enum(Channel)).optional(),
  priority: csvOf(z.enum(ConversationPriority)).optional(),
  /** `me` resolves to the caller; `unassigned` matches conversations with no owner. */
  assignedUserId: z.union([idSchema, z.literal('me'), z.literal('unassigned')]).optional(),
  assignedTeamId: z.union([idSchema, z.literal('unassigned')]).optional(),
  customerId: idSchema.optional(),
  tagIds: csvOf(idSchema).optional(),
  unreadOnly: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'))
    .optional(),
  sort: z.enum(['recent', 'oldest', 'priority']).default('recent'),
});

export const createConversationSchema = z.object({
  customerId: idSchema,
  channel: z.enum(Channel),
  /** Optional: a manual conversation need not be bound to a provider inbox. */
  integrationId: idSchema.optional(),
  customerChannelId: idSchema.optional(),
  subject: optionalCleanText(200),
  priority: z.enum(ConversationPriority).default(ConversationPriority.NORMAL),
  assignedUserId: idSchema.optional(),
  assignedTeamId: idSchema.optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(ConversationStatus),
});

export const updatePrioritySchema = z.object({
  priority: z.enum(ConversationPriority),
});

export const conversationTagsSchema = z.object({
  tagIds: z.array(idSchema).min(1).max(50),
});

export const conversationTagParamSchema = z.object({
  id: idSchema,
  tagId: idSchema,
});

export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type UpdatePriorityInput = z.infer<typeof updatePrioritySchema>;
export type ConversationTagsInput = z.infer<typeof conversationTagsSchema>;
export type ConversationTagParam = z.infer<typeof conversationTagParamSchema>;
