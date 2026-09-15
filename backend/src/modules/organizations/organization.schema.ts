import { z } from 'zod';
import { cleanText } from '../../utils/validation';

export const updateOrganizationSchema = z
  .object({
    name: cleanText(120, 2).optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(48)
      .regex(/^[a-z0-9-]+$/, 'Slug may contain lowercase letters, numbers and hyphens only')
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
