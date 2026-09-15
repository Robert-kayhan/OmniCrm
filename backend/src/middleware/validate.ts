import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../utils/errors';

export interface RequestSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

function toIssues(source: 'body' | 'query' | 'params', error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: [source, ...issue.path.map(String)].join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Validates and coerces the request, writing results to `req.validated`.
 *
 * Express 5 exposes `req.query` through a getter, so parsed values cannot be
 * assigned back onto the request. Controllers read `req.validated.query` and
 * therefore always see the coerced, whitelisted object rather than raw strings.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const issues: ValidationIssue[] = [];

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) req.validated.params = result.data;
      else issues.push(...toIssues('params', result.error));
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) req.validated.query = result.data;
      else issues.push(...toIssues('query', result.error));
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) req.validated.body = result.data;
      else issues.push(...toIssues('body', result.error));
    }

    if (issues.length > 0) {
      next(new ValidationError(issues));
      return;
    }

    next();
  };
}

/** Typed accessors. The `validate` middleware guarantees these are populated. */
export function body<T>(req: Request): T {
  return req.validated.body as T;
}

export function query<T>(req: Request): T {
  return req.validated.query as T;
}

export function params<T>(req: Request): T {
  return req.validated.params as T;
}
