import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CsvArray, ToInt } from '../../../common/transforms';
import { Channel } from '../../../generated/prisma/enums';

/**
 * Analytics is always bounded by a window. An unbounded query over a busy
 * workspace is a table scan, and "all time" is never the question anyone
 * actually asks of a support inbox.
 */
export class AnalyticsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(365)
  days: number = 30;

  @IsOptional()
  @CsvArray()
  @IsArray()
  @IsEnum(Channel, { each: true })
  channel?: Channel[];
}
