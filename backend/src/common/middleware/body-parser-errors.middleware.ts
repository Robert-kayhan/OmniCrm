import type { NextFunction, Request, Response } from 'express';
import { AppError, BadRequestError } from '../errors/app.error';

/**
 * Translates body-parser failures into the API's own errors.
 *
 * Registered immediately after the parsers and before the router, because Nest
 * turns any `SyntaxError` that reaches it into a bare `BadRequestException` —
 * discarding the `type` that says *why* the body was rejected. Catching it here
 * keeps the stable codes clients already branch on (`INVALID_JSON`,
 * `PAYLOAD_TOO_LARGE`) instead of collapsing both into `BAD_REQUEST`.
 */
export function bodyParserErrors(
  error: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const candidate = error as { type?: string } | null;

  if (candidate?.type === 'entity.parse.failed') {
    next(new BadRequestError('Request body is not valid JSON', 'INVALID_JSON'));
    return;
  }
  if (candidate?.type === 'entity.too.large') {
    next(new AppError('Request body is too large', 413, 'PAYLOAD_TOO_LARGE'));
    return;
  }

  next(error);
}
