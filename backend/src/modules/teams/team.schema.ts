import { z } from 'zod';
import { pageQuerySchema } from '../../utils/pagination';
import { cleanText, idSchema, optionalCleanText } from '../../utils/validation';

export const listTeamsQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
});

export const createTeamSchema = z.object({
  name: cleanText(80, 2),
  description: optionalCleanText(500),
  memberIds: z.array(idSchema).max(200).optional(),
});

export const updateTeamSchema = z
  .object({
    name: cleanText(80, 2).optional(),
    description: optionalCleanText(500),
    memberIds: z.array(idSchema).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const teamMembersSchema = z.object({
  userIds: z.array(idSchema).min(1).max(200),
});

export const teamMemberParamSchema = z.object({
  id: idSchema,
  userId: idSchema,
});

export type ListTeamsQuery = z.infer<typeof listTeamsQuerySchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type TeamMembersInput = z.infer<typeof teamMembersSchema>;
export type TeamMemberParam = z.infer<typeof teamMemberParamSchema>;
