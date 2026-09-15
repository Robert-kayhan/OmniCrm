import { z } from 'zod';
import { idSchema } from '../../utils/validation';

/**
 * Either target may be null, which unassigns that dimension. Sending both null
 * returns the conversation to the unassigned queue.
 */
export const assignConversationSchema = z
  .object({
    assignedUserId: idSchema.nullable().optional(),
    assignedTeamId: idSchema.nullable().optional(),
  })
  .refine(
    (value) => value.assignedUserId !== undefined || value.assignedTeamId !== undefined,
    { message: 'Provide assignedUserId, assignedTeamId, or both' },
  );

export type AssignConversationInput = z.infer<typeof assignConversationSchema>;
