import http from 'node:http';
import { createApp } from './app';
import { env, isMetaConfigured } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './database/prisma';
import { connectRedis, disconnectRedis } from './database/redis';
import { logRateLimitMode } from './middleware/rate-limit';
import { closeRealtime, initRealtime } from './realtime';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  await connectRedis();
  logRateLimitMode();

  // Providers are registered by createApp itself, so the registry is populated
  // for every consumer rather than only for this entry point.
  const app = createApp();
  const server = http.createServer(app);

  initRealtime(server);

  server.listen(env.PORT, env.HOST, () => {
    logger.info(
      {
        port: env.PORT,
        host: env.HOST,
        environment: env.NODE_ENV,
        frontend: env.FRONTEND_URL,
        facebook: isMetaConfigured ? 'configured' : 'not configured',
      },
      `API listening on http://localhost:${env.PORT}`,
    );
  });

  /**
   * Graceful shutdown: stop accepting connections, drain in-flight requests,
   * then close the pools. Without this, a rolling deploy drops live requests.
   */
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    const forceExit = setTimeout(() => {
      logger.error('Forced shutdown after 15s timeout');
      process.exit(1);
    }, 15_000);
    forceExit.unref();

    // Sockets are drained before `server.close()`, not inside its callback:
    // open sockets are exactly what keeps the server from closing, so the
    // callback would never fire and shutdown would wait for the timer above.
    await closeRealtime();

    server.close(async () => {
      try {
        await disconnectRedis();
        await disconnectDatabase();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ err: error }, 'Error during shutdown');
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception, exiting');
    process.exit(1);
  });
}

bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
