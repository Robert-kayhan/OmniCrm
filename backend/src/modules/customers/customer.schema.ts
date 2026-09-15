import { z } from 'zod';
import { Channel, CustomerSource, CustomerStatus } from '../../generated/prisma/enums';
import { pageQuerySchema } from '../../utils/pagination';
import { cleanText, csvOf, idSchema, optionalCleanText } from '../../utils/validation';

const emailField = z
  .union([z.email('Enter a valid email address').max(254), z.literal('')])
  .transform((value) => (value === '' ? null : value.toLowerCase()))
  .nullable()
  .optional();

/**
 * Phone numbers arrive in many shapes and this CRM is not the system of record
 * for dialling them, so validation is deliberately permissive: digits and the
 * usual separators, normalised to a single spacing.
 */
const phoneField = z
  .union([
    z
      .string()
      .trim()
      .max(32)
      .regex(/^[+()\d\s.-]*$/, 'Enter a valid phone number'),
    z.literal(''),
  ])
  .transform((value) => {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    return trimmed === '' ? null : trimmed;
  })
  .nullable()
  .optional();

const avatarField = z
  .union([z.url().max(2048), z.literal('')])
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

export const listCustomersQuerySchema = pageQuerySchema.extend({
  /** Matches name, email, phone and company. */
  search: z.string().trim().max(120).optional(),
  status: csvOf(z.enum(CustomerStatus)).optional(),
  source: csvOf(z.enum(CustomerSource)).optional(),
  channel: csvOf(z.enum(Channel)).optional(),
  tagIds: csvOf(idSchema).optional(),
  assignedUserId: idSchema.optional(),
  sort: z.enum(['recent', 'created', 'name']).default('recent'),
});

export const createCustomerSchema = z.object({
  firstName: cleanText(80, 1),
  lastName: optionalCleanText(80),
  email: emailField,
  phone: phoneField,
  company: optionalCleanText(120),
  avatar: avatarField,
  location: optionalCleanText(120),
  status: z.enum(CustomerStatus).default(CustomerStatus.LEAD),
  source: z.enum(CustomerSource).default(CustomerSource.MANUAL),
  tagIds: z.array(idSchema).max(50).optional(),
});

export const updateCustomerSchema = z
  .object({
    firstName: cleanText(80, 1).optional(),
    lastName: optionalCleanText(80),
    email: emailField,
    phone: phoneField,
    company: optionalCleanText(120),
    avatar: avatarField,
    location: optionalCleanText(120),
    status: z.enum(CustomerStatus).optional(),
    source: z.enum(CustomerSource).optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'At least one field must be provided',
  });

export const customerTagsSchema = z.object({
  tagIds: z.array(idSchema).min(1).max(50),
});

export const customerTagParamSchema = z.object({
  id: idSchema,
  tagId: idSchema,
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerTagsInput = z.infer<typeof customerTagsSchema>;
export type CustomerTagParam = z.infer<typeof customerTagParamSchema>;
