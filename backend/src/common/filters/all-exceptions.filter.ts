import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../errors/app.error';
import type { ErrorBody } from '../http/api-response';

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

/**
 * Maps the HttpExceptions Nest itself throws — a missing route, a body the
 * parser rejected, a payload over the limit — onto the same stable `code`
 * vocabulary the application errors use, so a client never has to tell the
 * difference between a framework refusal and an application one.
 */
function codeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'PAYLOAD_TOO_LARGE';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'VALIDATION_ERROR';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
  }
}

/**
 * Single exit point for every failure. Guarantees the shape
 * `{ success: false, message, code }` for all non-2xx responses.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly isProduction: boolean) {}

  private normalize(error: unknown): NormalizedError {
    if (error instanceof AppError) {
      return {
        statusCode: error.getStatus(),
        code: error.code,
        message: error.message,
        details: error.details,
        isOperational: error.isOperational,
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

    // Anything Nest raised itself: guards, pipes, the router, the body parser.
    if (error instanceof HttpException) {
      const status = error.getStatus();
      // The router's own 404 keeps the code clients already branch on, which is
      // narrower than a missing record's NOT_FOUND.
      const isUnroutable = error instanceof NotFoundException && !(error instanceof AppError);
      const payload = error.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: unknown })?.message ?? error.message);

      return {
        statusCode: status,
        code: isUnroutable ? 'ROUTE_NOT_FOUND' : codeForStatus(status),
        message: Array.isArray(message) ? message.join(', ') : String(message),
        isOperational: status < 500,
      };
    }

    // Body parser failures arrive as plain errors carrying a `type`.
    const candidate = error as { status?: number; type?: string };
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

  catch(exception: unknown, host: ArgumentsHost): void {
    // Websocket and RPC contexts have no HTTP response to write to.
    if (host.getType() !== 'http') throw exception;

    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    if (response.headersSent) return;

    const normalized = this.normalize(exception);
    const requestId = String(request.id ?? '');

    const logContext = {
      err: exception,
      requestId,
      method: request.method,
      path: request.originalUrl,
      statusCode: normalized.statusCode,
      code: normalized.code,
      userId: request.auth?.userId,
      organizationId: request.auth?.organizationId,
    };

    if (normalized.isOperational && normalized.statusCode < 500) {
      this.logger.warn({ ...logContext }, normalized.message);
    } else {
      this.logger.error({ ...logContext }, normalized.message);
    }

    const body: ErrorBody = {
      success: false,
      message: normalized.message,
      code: normalized.code,
      requestId,
    };

    if (normalized.details !== undefined) {
      body.details = normalized.details;
    }
    if (!this.isProduction && !normalized.isOperational && exception instanceof Error) {
      body.details = {
        ...(typeof body.details === 'object' ? body.details : {}),
        stack: exception.stack,
      };
    }

    response.status(normalized.statusCode).json(body);
  }
}
