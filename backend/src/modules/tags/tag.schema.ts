import { z } from 'zod';
import { pageQuerySchema } from '../../utils/pagination';
import { cleanText, hexColor, optionalCleanText } from '../../utils/validation';

/**
 * Tag names are normalised to upper snake case so `hot lead`, `Hot Lead` and
 * `HOT_LEAD` collapse to one tag rather than three near-duplicates. The
 * (organizationId, name) unique index then does the rest.
 */
const tagName = cleanText(40, 2).transform((value) =>
  value.replace(/[\s-]+/g, '_').replace(/[^A-Za-z0-9_]/g, '').toUpperCase(),
);

export const listTagsQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().max(80).optional(),
});

export const createTagSchema = z.object({
  name: tagName,
  color: hexColor.default('#64748b'),
  description: optionalCleanText(200),
});

export const updateTagSchema = z
  .object({
    name: tagName.optional(),
    color: hexColor.optional(),
    description: optionalCleanText(200),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'At least one field must be provided',
  });

export type ListTagsQuery = z.infer<typeof listTagsQuerySchema>;
export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
