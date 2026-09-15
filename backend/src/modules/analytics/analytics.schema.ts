import { z } from 'zod';
import { Channel } from '../../generated/prisma/enums';
import { csvOf } from '../../utils/validation';

/**
 * Analytics is always bounded by a window. An unbounded query over a busy
 * workspace is a table scan, and "all time" is never the question anyone
 * actually asks of a support inbox.
 */
export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  channel: csvOf(z.enum(Channel)).optional(),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
