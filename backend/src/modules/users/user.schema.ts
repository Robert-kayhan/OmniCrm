import { z } from 'zod';
import { UserRole, UserStatus } from '../../generated/prisma/enums';
import { pageQuerySchema } from '../../utils/pagination';
import { cleanText, csvOf, idSchema } from '../../utils/validation';
import { emailSchema, passwordSchema } from '../auth/auth.schema';

const roleEnum = z.enum([
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.AGENT,
]);

const statusEnum = z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE, UserStatus.INVITED]);

export const listUsersQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  role: roleEnum.optional(),
  status: statusEnum.optional(),
  teamId: idSchema.optional(),
  sort: z.enum(['name', 'createdAt', 'lastSeenAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const createUserSchema = z.object({
  name: cleanText(120, 2),
  email: emailSchema,
  role: roleEnum.default(UserRole.AGENT),
  /**
   * Omit to have the server generate a one-time password, returned exactly once
   * in the creation response for the administrator to pass on out of band.
   */
  password: passwordSchema.optional(),
  status: z.enum([UserStatus.ACTIVE, UserStatus.INVITED]).default(UserStatus.ACTIVE),
  avatar: z.url().max(2048).nullable().optional(),
  teamIds: z.array(idSchema).max(50).optional(),
});

export const updateUserSchema = z
  .object({
    name: cleanText(120, 2).optional(),
    role: roleEnum.optional(),
    status: statusEnum.optional(),
    avatar: z.url().max(2048).nullable().optional(),
    teamIds: z.array(idSchema).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const updateProfileSchema = z
  .object({
    name: cleanText(120, 2).optional(),
    avatar: z.url().max(2048).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const resetUserPasswordSchema = z.object({
  password: passwordSchema.optional(),
});

export const userIdsSchema = z.object({
  userIds: csvOf(idSchema).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;
