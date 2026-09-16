import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
  type ApiResponseOptions,
} from '@nestjs/swagger';
import {
  CursorMetaDto,
  ErrorBodyDto,
  PaginationMetaDto,
} from '../http/api-response.dto';

/**
 * Documentation helpers that mirror what the framework actually does.
 *
 * Success bodies are wrapped by the ResponseInterceptor and failures are shaped
 * by the exception filter, so neither is visible from a handler's return type.
 * Describing them here — once — keeps the published document honest instead of
 * documenting the inner value and lying about the body on the wire.
 */

/** `{ success: true, data: <model> }`. */
function envelope(model?: Type<unknown>, isArray = false, meta?: Type<unknown>) {
  const data = model
    ? isArray
      ? { type: 'array', items: { $ref: getSchemaPath(model) } }
      : { $ref: getSchemaPath(model) }
    : { type: 'object', description: 'Endpoint-specific payload.' };

  return {
    type: 'object',
    required: ['success', 'data'],
    properties: {
      success: { type: 'boolean', example: true },
      data,
      ...(meta ? { meta: { $ref: getSchemaPath(meta) } } : {}),
    },
  };
}

export interface EnvelopeOptions {
  /** The response model, when one has been declared as a class. */
  type?: Type<unknown>;
  isArray?: boolean;
  description?: string;
}

export function ApiEnvelopeResponse(options: EnvelopeOptions = {}) {
  const response: ApiResponseOptions = {
    description: options.description,
    schema: envelope(options.type, options.isArray),
  };
  return applyDecorators(
    ...(options.type ? [ApiExtraModels(options.type)] : []),
    ApiOkResponse(response),
  );
}

export function ApiEnvelopeCreatedResponse(options: EnvelopeOptions = {}) {
  const response: ApiResponseOptions = {
    description: options.description,
    schema: envelope(options.type, options.isArray),
  };
  return applyDecorators(
    ...(options.type ? [ApiExtraModels(options.type)] : []),
    ApiCreatedResponse(response),
  );
}

/** A list plus `meta` — offset pagination. */
export function ApiPaginatedResponse(options: EnvelopeOptions = {}) {
  return applyDecorators(
    ApiExtraModels(PaginationMetaDto),
    ...(options.type ? [ApiExtraModels(options.type)] : []),
    ApiOkResponse({
      description: options.description,
      schema: envelope(options.type, true, PaginationMetaDto),
    }),
  );
}

/** A list plus `meta` — cursor pagination, used where rows arrive at the head. */
export function ApiCursorPaginatedResponse(options: EnvelopeOptions = {}) {
  return applyDecorators(
    ApiExtraModels(CursorMetaDto),
    ...(options.type ? [ApiExtraModels(options.type)] : []),
    ApiOkResponse({
      description: options.description,
      schema: envelope(options.type, true, CursorMetaDto),
    }),
  );
}

/**
 * The failures any authenticated route can return.
 *
 * Applied at controller level so each operation inherits them without every
 * handler repeating four decorators.
 */
export function ApiStandardErrors() {
  return applyDecorators(
    ApiExtraModels(ErrorBodyDto),
    ApiUnauthorizedResponse({
      description: 'Missing, malformed or expired bearer token.',
      type: ErrorBodyDto,
    }),
    ApiForbiddenResponse({
      description: "The caller's role lacks the permission this route requires.",
      type: ErrorBodyDto,
    }),
    ApiUnprocessableEntityResponse({
      description: 'Validation failed. `details` lists the offending fields.',
      type: ErrorBodyDto,
    }),
    ApiTooManyRequestsResponse({
      description: 'Rate limit exceeded.',
      type: ErrorBodyDto,
    }),
  );
}
