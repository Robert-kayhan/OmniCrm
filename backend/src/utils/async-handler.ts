import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 5 forwards rejected promises to the error middleware on its own, but
 * only for handlers it recognises as returning a promise. Wrapping keeps the
 * behaviour explicit and identical across sync and async handlers.
 */
export function asyncHandler<
  Req extends Request = Request,
  Res extends Response = Response,
>(handler: (req: Req, res: Res, next: NextFunction) => Promise<unknown> | unknown): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req as Req, res as Res, next)).catch(next);
  };
}
