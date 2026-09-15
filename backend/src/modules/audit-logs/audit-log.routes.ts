import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { asyncHandler } from '../../utils/async-handler';
import { listAuditLogsHandler } from './audit-log.controller';
import { listAuditLogsQuerySchema } from './audit-log.schema';

export const auditLogRouter = Router();

auditLogRouter.use(authenticate);

auditLogRouter.get(
  '/',
  requirePermission(PERMISSIONS.AUDIT_LOG_READ),
  validate({ query: listAuditLogsQuerySchema }),
  asyncHandler(listAuditLogsHandler),
);
