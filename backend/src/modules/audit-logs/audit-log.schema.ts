import { z } from 'zod';
import { pageQuerySchema } from '../../utils/pagination';
import { idSchema } from '../../utils/validation';

export const listAuditLogsQuerySchema = pageQuerySchema.extend({
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: idSchema.optional(),
  userId: idSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
