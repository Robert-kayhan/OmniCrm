import crypto from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import pinoHttp from 'pino-http';
import { logger } from '../config/logger';
import { isTest } from '../config/env';

/**
 * Assigns a correlation id and initialises `req.validated` so downstream
 * middleware can write to it without existence checks.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get('x-request-id');
  const id = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  req.id = id;
  req.validated = {};
  res.setHeader('x-request-id', id);
  next();
}

/** Correlation id as a string, whatever pino-http's ReqId union says. */
export function requestId(req: Request): string {
  return String(req.id ?? '');
}

export const httpLogger: RequestHandler = pinoHttp({
  logger,
  genReqId: (req) => (req as Request).id,
  autoLogging: {
    // Health checks would otherwise dominate the log volume.
    ignore: (req) => isTest || req.url === '/api/health' || req.url === '/api/health/live',
  },
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
