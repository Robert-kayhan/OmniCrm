import type { RequestHandler } from 'express';
import { NotFoundError } from '../utils/errors';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
};
