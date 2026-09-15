import { Router, type NextFunction, type Request, type Response } from 'express';
import { authenticate, getAuth } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { body, validate } from '../../middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { env } from '../../config/env';
import { asyncHandler } from '../../utils/async-handler';
import { NotFoundError } from '../../utils/errors';
import { sendSuccess } from '../../utils/response';
import * as service from './dev-tools.service';
import {
  seedSampleDataSchema,
  simulateInboundSchema,
  type SeedSampleDataInput,
  type SimulateInboundInput,
} from './dev-tools.schema';

/**
 * Simulation endpoints, isolated from production code.
 *
 * Two independent gates: `ENABLE_DEV_TOOLS` (which env validation forces to
 * false when NODE_ENV=production) and the DEV_TOOLS permission. The router
 * answers 404 rather than 403 when disabled, so a production deployment does
 * not advertise that these routes exist.
 */
export const devToolsRouter = Router();

function requireDevTools(_req: Request, _res: Response, next: NextFunction) {
  if (!env.ENABLE_DEV_TOOLS) {
    next(new NotFoundError('Route', 'NOT_FOUND'));
    return;
  }
  next();
}

devToolsRouter.use(requireDevTools, authenticate, requirePermission(PERMISSIONS.DEV_TOOLS));

devToolsRouter.post(
  '/simulate/inbound-message',
  validate({ body: simulateInboundSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.simulateInboundMessage(
      getAuth(req),
      body<SimulateInboundInput>(req),
    );
    return sendSuccess(res, result, 201);
  }),
);

devToolsRouter.post(
  '/simulate/seed',
  validate({ body: seedSampleDataSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.seedSampleConversations(
      getAuth(req),
      body<SeedSampleDataInput>(req),
    );
    return sendSuccess(res, result, 201);
  }),
);

devToolsRouter.post(
  '/simulate/reset',
  asyncHandler(async (req, res) => {
    return sendSuccess(res, await service.resetSimulatedData(getAuth(req)));
  }),
);
