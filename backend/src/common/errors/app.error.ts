import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Every failure the API returns is an AppError with a stable machine-readable
 * `code`. Clients branch on `code`, never on the human message.
 *
 * It extends Nest's HttpException so the framework already knows the status
 * code and so `throw new NotFoundError(...)` behaves identically whether it
 * happens in a guard, a pipe, an interceptor or deep inside a service. The
 * exception filter reads `code`, `details` and `isOperational` off the instance
 * to build the response body and to pick a log level.
 */
export class AppError extends HttpException {
  public readonly code: string;
  public readonly details?: unknown;
  /** Expected failures are logged at `warn`; unexpected ones at `error`. */
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    code = 'INTERNAL_ERROR',
    details?: unknown,
    isOperational = true,
  ) {
    super({ message, code, details }, statusCode);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'BAD_REQUEST', details?: unknown) {
    super(message, HttpStatus.BAD_REQUEST, code, details);
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = 'Request validation failed') {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(message, HttpStatus.UNAUTHORIZED, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    super(message, HttpStatus.FORBIDDEN, code);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', code = 'NOT_FOUND') {
    super(`${resource} not found`, HttpStatus.NOT_FOUND, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', code = 'CONFLICT', details?: unknown) {
    super(message, HttpStatus.CONFLICT, code, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests', code = 'RATE_LIMITED') {
    super(message, HttpStatus.TOO_MANY_REQUESTS, code);
  }
}

/**
 * A required integration credential is missing or the provider rejected it.
 * 503 rather than 500: the CRM is healthy, the downstream channel is not.
 */
export class IntegrationConfigurationError extends AppError {
  constructor(message: string, code = 'INTEGRATION_NOT_CONFIGURED', details?: unknown) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, code, details);
  }
}

export class ProviderError extends AppError {
  constructor(message: string, code = 'PROVIDER_ERROR', details?: unknown) {
    super(message, HttpStatus.BAD_GATEWAY, code, details);
  }
}
