import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { ToInt, Trim } from '../transforms';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Offset pagination — lists where a total count is meaningful. */
export class PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;
}

export function toSkipTake(query: { page: number; limit: number }): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}

/**
 * Cursor pagination — chat history, where rows are inserted at the head and
 * offsets drift between requests.
 */
export class CursorQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  cursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = 50;
}

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
