import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ID_PATTERN } from '../../../common/dto/id-param.dto';
import { PageQueryDto } from '../../../common/dto/pagination.dto';
import { CleanText, OptionalCleanText, Trim } from '../../../common/transforms';
import { AtLeastOneField } from '../../../common/validators/at-least-one-field.validator';

export class ListTeamsQueryDto extends PageQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class CreateTeamDto {
  @CleanText()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @OptionalCleanText()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @Matches(ID_PATTERN, { each: true, message: 'Identifier contains invalid characters' })
  memberIds?: string[];
}

export class UpdateTeamDto {
  @AtLeastOneField(['name', 'description', 'memberIds'])
  @IsOptional()
  @CleanText()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @OptionalCleanText()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @Matches(ID_PATTERN, { each: true, message: 'Identifier contains invalid characters' })
  memberIds?: string[];
}

export class TeamMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @Matches(ID_PATTERN, { each: true, message: 'Identifier contains invalid characters' })
  userIds!: string[];
}

export class TeamMemberParamDto {
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  id!: string;

  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  userId!: string;
}
