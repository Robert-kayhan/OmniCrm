import 'reflect-metadata';
import { Logger as NestLogger } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { DOCS_PATH, setupSwagger } from './config/swagger';
import { bodyParserErrors } from './common/middleware/body-parser-errors.middleware';
import { assignRequestId } from './common/middleware/request-id.middleware';

const BODY_LIMIT = '1mb';

function corsOptions(config: AppConfigService): CorsOptions {
  const allowed = config.allowedOrigins;

  return {
    origin(origin, callback) {
      // Same-origin, curl and server-to-server calls send no Origin header.
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    // Required for the httpOnly refresh cookie to travel with /api/auth calls.
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: [
      'X-Request-Id',
      'RateLimit',
      'RateLimit-Policy',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    maxAge: 86_400,
  };
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Meta signs the exact bytes it sent, so the webhook verifier needs the raw
    // buffer rather than a re-serialised object. Nest captures it on
    // `req.rawBody` for every request; the body limit below bounds the cost.
    rawBody: true,
    // The parsers are registered by hand below so that the correlation id is
    // assigned before them — a request with a malformed body still has to come
    // back with an id — and so their errors reach the exception filter with the
    // reason intact.
    bodyParser: false,
    // Nest's own start-up logs go through pino like everything else.
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const config = app.get(AppConfigService);

  // Rate limiting and audit logs need the real client IP, which only arrives
  // through X-Forwarded-For. Trust exactly as many hops as are deployed —
  // trusting blindly would let a client spoof its own address.
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS'));
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; a restrictive CSP here has no effect on the
      // Next.js frontend, which sets its own.
      contentSecurityPolicy: config.isProduction ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use(compression());
  app.use(assignRequestId);
  app.use(cookieParser());

  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: true });
  app.use(bodyParserErrors);

  app.enableCors(corsOptions(config));
  // Deliberately without an `exclude`: excluding a path also collapses the
  // paths Nest registers module middleware against, which stops the request
  // logger — and the correlation id it assigns — from reaching /api at all.
  app.setGlobalPrefix('api');

  // After the global prefix and the parsers, so the document reflects the real
  // paths and the "Try it out" button posts bodies the API will accept.
  setupSwagger(app, config);

  /**
   * Graceful shutdown: Nest runs every module's onApplicationShutdown hook, so
   * the Prisma pool and the Redis connections drain on SIGTERM. Without this a
   * rolling deploy drops live requests.
   */
  app.enableShutdownHooks();

  await app.listen(config.port, config.host);

  new NestLogger('Bootstrap').log(
    `API listening on http://localhost:${config.port} ` +
      `(${config.nodeEnv}, facebook: ${config.isMetaConfigured ? 'configured' : 'not configured'}` +
      `${config.apiDocsEnabled ? `, docs: /${DOCS_PATH}` : ''})`,
  );
}

bootstrap().catch((error: unknown) => {
  // The container may not exist yet, so this cannot go through the app logger.
  process.stderr.write(`Failed to start server: ${String(error)}\n`);
  process.exit(1);
});
