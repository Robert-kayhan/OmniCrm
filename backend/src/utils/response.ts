import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface CursorMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: PaginationMeta | CursorMeta | Record<string, unknown>;
}

export interface ErrorBody {
  success: false;
  message: string;
  code: string;
  details?: unknown;
  requestId?: string;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: SuccessBody<T>['meta'],
): Response {
  const body: SuccessBody<T> = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

export function sendCreated<T>(res: Response, data: T): Response {
  return sendSuccess(res, data, 201);
}

export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}
