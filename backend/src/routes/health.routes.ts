import { Router } from 'express';
import { checkDatabaseHealth } from '../database/prisma';
import { checkRedisHealth } from '../database/redis';
import { env, isMetaConfigured } from '../config/env';
import { asyncHandler } from '../utils/async-handler';

export const healthRouter = Router();

/** Liveness: answers as long as the process is up. Used by container probes. */
healthRouter.get('/live', (_req, res) => {
  res.json({ success: true, data: { status: 'alive', uptime: process.uptime() } });
});

/** Readiness: reports dependency state and fails the request when the DB is down. */
healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [database, redis] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);
    const healthy = database;

    res.status(healthy ? 200 : 503).json({
      success: healthy,
      data: {
        status: healthy ? 'ok' : 'degraded',
        environment: env.NODE_ENV,
        uptime: Math.round(process.uptime()),
        dependencies: {
          database: database ? 'ok' : 'error',
          redis,
        },
        integrations: {
          facebook: isMetaConfigured ? 'configured' : 'not_configured',
        },
      },
    });
  }),
);
