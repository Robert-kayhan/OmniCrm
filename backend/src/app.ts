import express, { type Express } from 'express';
import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { allowedOrigins, env, isProduction } from './config/env';
import { logger } from './config/logger';
import { httpLogger, requestContext } from './middleware/request-context';
import { globalRateLimiter } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { apiRouter } from './routes';
import { webhookRouter } from './modules/webhooks/webhook.routes';

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Same-origin, curl and server-to-server calls send no Origin header.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    logger.warn({ origin }, 'Blocked CORS origin');
    return callback(null, false);
  },
  // Required for the httpOnly refresh cookie to travel with /api/auth calls.
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
  maxAge: 86_400,
};

export function createApp(): Express {
  const app = express();

  // Rate limiting and audit logs need the real client IP, which only arrives
  // through X-Forwarded-For. Trust exactly as many hops as are deployed —
  // trusting blindly would let a client spoof its own address.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; a restrictive CSP here has no effect on the
      // Next.js frontend, which sets its own.
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use(cors(corsOptions));
  app.use(compression());
  app.use(requestContext);
  app.use(httpLogger);

  app.use(
    express.json({
      limit: '1mb',
      // Meta signs the exact bytes it sent, so the webhook verifier needs the
      // raw buffer rather than a re-serialised object.
      verify: (req, _res, buf) => {
        if (req.url?.startsWith('/api/webhooks/')) {
          (req as express.Request).rawBody = Buffer.from(buf);
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Mounted ahead of the global limiter and carrying its own. Provider traffic
  // is bursty and is already authenticated per-delivery by an HMAC, so sharing
  // an agent-sized budget with it would drop real customer messages.
  app.use('/api/webhooks', webhookRouter);

  app.use('/api', globalRateLimiter());
  app.use('/api', apiRouter);

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      data: { service: 'omni-crm-api', version: '0.1.0', docs: '/api/health' },
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
