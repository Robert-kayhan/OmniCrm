import { z } from 'zod';
import { Channel } from '../../generated/prisma/enums';
import { idSchema, optionalCleanText } from '../../utils/validation';

export const createCustomerChannelSchema = z.object({
  integrationId: idSchema,
  channel: z.enum(Channel),
  /** Provider-scoped identity. Opaque to the CRM, so only length is checked. */
  externalUserId: z.string().trim().min(1).max(191),
  username: optionalCleanText(120),
  profileUrl: z
    .union([z.url().max(2048), z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
  avatar: z
    .union([z.url().max(2048), z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
});

export const customerChannelParamSchema = z.object({
  id: idSchema,
  channelId: idSchema,
});

export type CreateCustomerChannelInput = z.infer<typeof createCustomerChannelSchema>;
export type CustomerChannelParam = z.infer<typeof customerChannelParamSchema>;
