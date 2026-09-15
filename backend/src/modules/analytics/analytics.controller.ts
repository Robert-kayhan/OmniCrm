import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { query } from '../../middleware/validate';
import { sendSuccess } from '../../utils/response';
import * as analyticsService from './analytics.service';
import type { AnalyticsQuery } from './analytics.schema';

export async function overviewHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const overview = await analyticsService.getAnalyticsOverview(auth, query<AnalyticsQuery>(req));
  return sendSuccess(res, overview);
}
