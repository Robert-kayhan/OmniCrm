import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((value) => /[a-z]/.test(value), 'Password must contain a lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Password must contain an uppercase letter')
  .refine((value) => /[0-9]/.test(value), 'Password must contain a number');

const emailSchema = z
  .email('A valid email address is required')
  .max(254)
  .transform((value) => value.trim().toLowerCase());

export const registerSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});

/**
 * The refresh token normally arrives in an httpOnly cookie. The body field is a
 * fallback for clients that cannot hold cookies (native apps, integration tests).
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
  /** Revoke every session for this user, not just the presented one. */
  allDevices: z.boolean().optional().default(false),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export { passwordSchema, emailSchema };
