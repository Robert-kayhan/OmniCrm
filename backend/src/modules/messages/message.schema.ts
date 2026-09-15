import { z } from 'zod';
import { MessageType } from '../../generated/prisma/enums';
import { cursorQuerySchema } from '../../utils/pagination';

export const listMessagesQuerySchema = cursorQuerySchema.extend({
  /** Agents can hide their own internal notes to preview the customer's view. */
  includeInternal: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'))
    .default(true),
});

const attachmentSchema = z.object({
  type: z.enum(MessageType).default(MessageType.FILE),
  url: z.url().max(2048),
  name: z.string().trim().max(255).optional(),
});

export const sendMessageSchema = z
  .object({
    content: z.string().trim().max(5000).optional(),
    attachments: z.array(attachmentSchema).max(10).optional(),
    /**
     * Internal messages are stored in the thread for context but never handed
     * to a provider. The send path branches on this flag before it resolves an
     * integration, so there is no route by which one reaches a customer.
     */
    isInternal: z.boolean().default(false),
  })
  .refine((value) => Boolean(value.content) || (value.attachments?.length ?? 0) > 0, {
    message: 'A message must have content or at least one attachment',
    path: ['content'],
  });

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
