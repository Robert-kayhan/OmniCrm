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

export type ResponseMeta = PaginationMeta | CursorMeta | Record<string, unknown>;

export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

export interface ErrorBody {
  success: false;
  message: string;
  code: string;
  details?: unknown;
  requestId?: string;
}

/**
 * Controllers return plain data and the ResponseInterceptor wraps it into
 * `{ success: true, data }`. When a list also needs pagination metadata, the
 * controller returns `withMeta(items, meta)` instead — the interceptor unpacks
 * it into the `meta` key rather than nesting it inside `data`.
 */
export class MetaEnvelope<T> {
  constructor(
    public readonly data: T,
    public readonly meta: ResponseMeta,
  ) {}
}

export function withMeta<T>(data: T, meta: ResponseMeta): MetaEnvelope<T> {
  return new MetaEnvelope(data, meta);
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
