import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/pagination.dto';
import { OptionalCleanText, Trim } from '../../../common/transforms';
import { AtLeastOneField } from '../../../common/validators/at-least-one-field.validator';

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Tag names are normalised to upper snake case so `hot lead`, `Hot Lead` and
 * `HOT_LEAD` collapse to one tag rather than three near-duplicates. The
 * (organizationId, name) unique index then does the rest.
 */
function TagName(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => {
    if (typeof value !== 'string') return value;
    return value
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[\s-]+/g, '_')
      .replace(/[^A-Za-z0-9_]/g, '')
      .toUpperCase();
  });
}

export class ListTagsQueryDto extends PageQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  search?: string;
}

export class CreateTagDto {
  @TagName()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(HEX_COLOR, {
    message: 'Colour must be a 6-digit hex value such as #2563eb',
  })
  color: string = '#64748b';

  @IsOptional()
  @OptionalCleanText()
  @IsString()
  @MaxLength(200)
  description?: string | null;
}

export class UpdateTagDto {
  @AtLeastOneField(['name', 'color', 'description'])
  @IsOptional()
  @TagName()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @Matches(HEX_COLOR, {
    message: 'Colour must be a 6-digit hex value such as #2563eb',
  })
  color?: string;

  @IsOptional()
  @OptionalCleanText()
  @IsString()
  @MaxLength(200)
  description?: string | null;
}
