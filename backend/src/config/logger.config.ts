import crypto from 'node:crypto';
import { RequestMethod } from '@nestjs/common';
import type { Params } from 'nestjs-pino';
import type { IncomingMessage } from 'node:http';
import { env, isDevelopment, isTest } from './env';

/**
 * Values that must never reach the log stream. Pino's redaction runs on the
 * serialised object, so nesting variants are listed explicitly.
 */
const REDACTED_PATHS = [
  'password',
  '*.password',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'access_token',
  '*.access_token',
  'pageAccessToken',
  '*.pageAccessToken',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'META_APP_SECRET',
  'META_PAGE_ACCESS_TOKEN',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ENCRYPTION_KEY',
];

/**
 * Correlation id for the request.
 *
 * `assignRequestId` runs ahead of the parsers and has normally already set one;
 * this only covers the case where something reaches the logger without passing
 * through that middleware, so the two can never disagree.
 */
function genReqId(req: IncomingMessage): string {
  const assigned = (req as IncomingMessage & { id?: unknown }).id;
  if (typeof assigned === 'string' && assigned) return assigned;
  return crypto.randomUUID();
}

export const loggerConfig: Params = {
  /**
   * Spelled out rather than left to nestjs-pino's default of `'*'`.
   *
   * Express 5 routes through path-to-regexp v8, where a bare `*` matches only
   * the root path — so the default silently applied the logger to `/` alone and
   * nothing under `/api`, taking the correlation id with it.  `/{*splat}` is the
   * v8 spelling of "everything".
   */
  forRoutes: [{ path: '/{*splat}', method: RequestMethod.ALL }],
  pinoHttp: {
    level: isTest ? 'silent' : env.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    base: { service: 'omni-crm-api' },
    formatters: {
      level: (label) => ({ level: label }),
    },
    genReqId,
    autoLogging: {
      // Health checks would otherwise dominate the log volume.
      ignore: (req) =>
        isTest || req.url === '/api/health' || req.url === '/api/health/live',
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    ...(isDevelopment
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname,service',
            },
          },
        }
      : {}),
  },
};
