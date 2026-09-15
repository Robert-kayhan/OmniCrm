import type { ErrorRequestHandler, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { isProduction } from '../config/env';
import { logger } from '../config/logger';
import { AppError, ValidationError } from '../utils/errors';
import { requestId } from './request-context';
import type { ErrorBody } from '../utils/response';

interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  isOperational: boolean;
}

/** Maps the Prisma error codes that correspond to a client mistake. */
function normalizePrismaError(error: Prisma.PrismaClientKnownRequestError): NormalizedError | null {
  const target = (error.meta?.target as string[] | string | undefined) ?? undefined;
  const fields = Array.isArray(target) ? target : target ? [target] : [];

  switch (error.code) {
    case 'P2002':
      return {
        statusCode: 409,
        code: 'DUPLICATE_RESOURCE',
        message:
          fields.length > 0
            ? `A record with this ${fields.join(', ')} already exists`
            : 'A record with these values already exists',
        details: { fields },
        isOperational: true,
      };
    case 'P2003':
      return {
        statusCode: 400,
        code: 'FOREIGN_KEY_VIOLATION',
        message: 'Referenced record does not exist',
        details: { field: error.meta?.field_name },
        isOperational: true,
      };
    case 'P2025':
      return {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Record not found',
        isOperational: true,
      };
    case 'P2014':
      return {
        statusCode: 400,
        code: 'RELATION_VIOLATION',
        message: 'The change would violate a required relation',
        isOperational: true,
      };
    default:
      return null;
  }
}

function normalize(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
      isOperational: error.isOperational,
    };
  }

  // A Zod error that escaped the validate middleware (e.g. thrown inside a service).
  if (error instanceof ZodError) {
    const wrapped = new ValidationError(
      error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
        code: issue.code,
      })),
    );
    return {
      statusCode: wrapped.statusCode,
      code: wrapped.code,
      message: wrapped.message,
      details: wrapped.details,
      isOperational: true,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = normalizePrismaError(error);
    if (mapped) return mapped;
    return {
      statusCode: 500,
      code: 'DATABASE_ERROR',
      message: 'A database error occurred',
      isOperational: false,
    };
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: 400,
      code: 'DATABASE_VALIDATION_ERROR',
      message: 'Invalid database query',
      isOperational: false,
    };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database is unavailable',
      isOperational: false,
    };
  }

  // Body parser failures arrive as plain errors carrying a status.
  const candidate = error as { status?: number; statusCode?: number; type?: string; message?: string };
  if (candidate?.type === 'entity.parse.failed') {
    return {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'Request body is not valid JSON',
      isOperational: true,
    };
  }
  if (candidate?.type === 'entity.too.large') {
    return {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large',
      isOperational: true,
    };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    isOperational: false,
  };
}

/**
 * Single exit point for every failure. Guarantees the shape
 * `{ success: false, message, code }` for all non-2xx responses.
 */
export const errorHandler: ErrorRequestHandler = (error, req: Request, res: Response, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const normalized = normalize(error);

  const logContext = {
    err: error,
    requestId: requestId(req),
    method: req.method,
    path: req.originalUrl,
    statusCode: normalized.statusCode,
    code: normalized.code,
    userId: req.auth?.userId,
    organizationId: req.auth?.organizationId,
  };

  if (normalized.isOperational && normalized.statusCode < 500) {
    logger.warn(logContext, normalized.message);
  } else {
    logger.error(logContext, normalized.message);
  }

  const body: ErrorBody = {
    success: false,
    message: normalized.message,
    code: normalized.code,
    requestId: requestId(req),
  };

  if (normalized.details !== undefined) {
    body.details = normalized.details;
  }
  if (!isProduction && !normalized.isOperational && error instanceof Error) {
    body.details = { ...(typeof body.details === 'object' ? body.details : {}), stack: error.stack };
  }

  res.status(normalized.statusCode).json(body);
};
