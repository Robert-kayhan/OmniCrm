import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Offset pagination — lists where a total count is meaningful. */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

export function toSkipTake(query: PageQuery): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}

/**
 * Cursor pagination — chat history, where rows are inserted at the head and
 * offsets drift between requests.
 */
export const cursorQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
});

export type CursorQuery = z.infer<typeof cursorQuerySchema>;

/**
 * Takes `limit + 1` rows to detect a further page without a second query, then
 * trims the probe row off the result.
 */
export function buildCursorPage<T extends { id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? last.id : null,
    hasMore,
  };
}
