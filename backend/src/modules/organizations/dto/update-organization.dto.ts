import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AtLeastOneField } from '../../../common/validators/at-least-one-field.validator';
import { CleanText, Lowercase } from '../../../common/transforms';

export class UpdateOrganizationDto {
  @AtLeastOneField(['name', 'slug'])
  @IsOptional()
  @CleanText()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Lowercase()
  @IsString()
  @MinLength(2)
  @MaxLength(48)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug may contain lowercase letters, numbers and hyphens only',
  })
  slug?: string;
}
