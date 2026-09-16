import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Assigns the correlation id, before anything that can fail.
 *
 * It runs ahead of the body parsers on purpose: a request with malformed JSON
 * never reaches a controller, but its error response still has to carry an id
 * an operator can grep the logs for. pino-http reuses `req.id` when it is
 * already set, so the logger and the response agree on one value.
 *
 * An inbound `x-request-id` is honoured so a trace started at the edge survives
 * into these logs, but only within a sane length — the value is echoed back in
 * a header and into every error body, so an unbounded one is a log-injection
 * vector.
 */
export function assignRequestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const id = candidate && candidate.length <= 128 ? candidate : crypto.randomUUID();

  req.id = id;
  res.setHeader('x-request-id', id);
  next();
}
