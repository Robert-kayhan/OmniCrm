import { z } from 'zod';
import { pageQuerySchema } from '../../utils/pagination';

export const listNotificationsQuerySchema = pageQuerySchema.extend({
  unreadOnly: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'))
    .optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
