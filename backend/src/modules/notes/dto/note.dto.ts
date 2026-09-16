import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_PAGE_SIZE, PageQueryDto } from '../../../common/dto/pagination.dto';
import { ToInt, Trim } from '../../../common/transforms';

export class ListNotesQueryDto extends PageQueryDto {
  /** Notes are short and a thread rarely has many, so the page is larger. */
  @ApiPropertyOptional()
  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  override limit: number = 50;
}

export class CreateNoteDto {
  /**
   * Stored and returned as raw text — the client never renders it as HTML, so
   * there is no markup to escape and none is interpreted.
   */
  @Trim()
  @IsString()
  @MinLength(1, { message: 'Note cannot be empty' })
  @MaxLength(5000)
  content!: string;
}
