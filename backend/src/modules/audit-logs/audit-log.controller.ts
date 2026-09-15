import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { query } from '../../middleware/validate';
import { sendSuccess } from '../../utils/response';
import { listAuditLogs } from './audit-log.service';
import type { ListAuditLogsQuery } from './audit-log.schema';

export async function listAuditLogsHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const result = await listAuditLogs(auth.organizationId, query<ListAuditLogsQuery>(req));
  return sendSuccess(res, result.items, 200, result.meta);
}
