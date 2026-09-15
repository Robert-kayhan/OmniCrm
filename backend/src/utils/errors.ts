/**
 * Every failure the API returns is an AppError with a stable machine-readable
 * `code`. Clients branch on `code`, never on the human message.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  /** Expected failures are logged at `warn`; unexpected ones at `error`. */
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'BAD_REQUEST', details?: unknown) {
    super(message, 400, code, details);
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = 'Request validation failed') {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', code = 'NOT_FOUND') {
    super(`${resource} not found`, 404, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', code = 'CONFLICT', details?: unknown) {
    super(message, 409, code, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests', code = 'RATE_LIMITED') {
    super(message, 429, code);
  }
}

/**
 * A required integration credential is missing or the provider rejected it.
 * 503 rather than 500: the CRM is healthy, the downstream channel is not.
 */
export class IntegrationConfigurationError extends AppError {
  constructor(message: string, code = 'INTEGRATION_NOT_CONFIGURED', details?: unknown) {
    super(message, 503, code, details);
  }
}

export class ProviderError extends AppError {
  constructor(message: string, code = 'PROVIDER_ERROR', details?: unknown) {
    super(message, 502, code, details);
  }
}
