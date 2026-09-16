import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The documented shapes of the wrappers every response carries.
 *
 * These exist only for the OpenAPI document — the runtime shapes live in
 * `api-response.ts` and are produced by the ResponseInterceptor and the
 * exception filter. They are classes rather than interfaces because the
 * generator can only read decorator metadata off a class.
 */

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 137, description: 'Total rows matching the filter.' })
  total!: number;

  @ApiProperty({ example: 7 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;
}

export class CursorMetaDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Pass as `cursor` to fetch the next page. Null on the last page.',
  })
  nextCursor!: string | null;

  @ApiProperty({ example: true })
  hasMore!: boolean;

  @ApiProperty({ example: 50 })
  limit!: number;
}

/**
 * The body of every non-2xx response.
 *
 * Clients branch on `code`, never on `message`: the code is a stable part of
 * the contract, the message is human-facing and may be reworded.
 */
export class ErrorBodyDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ example: 'Request validation failed' })
  message!: string;

  @ApiProperty({
    example: 'VALIDATION_ERROR',
    description: 'Stable machine-readable failure code.',
  })
  code!: string;

  @ApiPropertyOptional({
    description:
      'Present on validation failures as `[{ path, message, code }]`, and on ' +
      'some conflicts as the offending field or record.',
  })
  details?: unknown;

  @ApiPropertyOptional({
    description:
      'Correlation id, echoed from the `X-Request-Id` request header when one ' +
      'was sent. Quote it when reporting a failure.',
  })
  requestId?: string;
}
