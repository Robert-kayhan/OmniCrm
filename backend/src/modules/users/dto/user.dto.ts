import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ID_PATTERN } from '../../../common/dto/id-param.dto';
import { PageQueryDto } from '../../../common/dto/pagination.dto';
import { CleanText, CsvArray, Lowercase, Trim } from '../../../common/transforms';
import { AtLeastOneField } from '../../../common/validators/at-least-one-field.validator';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';
import { IsStrongPassword } from '../../auth/dto/password';

const ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.AGENT,
] as const;

const STATUSES = [UserStatus.ACTIVE, UserStatus.INACTIVE, UserStatus.INVITED] as const;

export class ListUsersQueryDto extends PageQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: UserRole;

  @IsOptional()
  @IsIn(STATUSES)
  status?: UserStatus;

  @IsOptional()
  @Trim()
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  @MaxLength(64)
  teamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['name', 'createdAt', 'lastSeenAt'])
  sort: 'name' | 'createdAt' | 'lastSeenAt' = 'name';

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';
}

export class CreateUserDto {
  @CleanText()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @Lowercase()
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(ROLES)
  role: UserRole = UserRole.AGENT;

  /**
   * Omit to have the server generate a one-time password, returned exactly once
   * in the creation response for the administrator to pass on out of band.
   */
  @IsOptional()
  @IsStrongPassword()
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([UserStatus.ACTIVE, UserStatus.INVITED])
  status: UserStatus = UserStatus.ACTIVE;

  /**
   * Send `null` to clear the avatar; omit the key to leave it unchanged.
   */
  // @IsOptional skips validation for both `null` and an absent key but keeps
  // the property either way, so the service can still tell the two apart.
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({}, { message: 'avatar must be a valid URL' })
  @MaxLength(2048)
  avatar?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(ID_PATTERN, { each: true, message: 'Identifier contains invalid characters' })
  teamIds?: string[];
}

export class UpdateUserDto {
  @AtLeastOneField(['name', 'role', 'status', 'avatar', 'teamIds'])
  @IsOptional()
  @CleanText()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: UserRole;

  @IsOptional()
  @IsIn(STATUSES)
  status?: UserStatus;

  @IsOptional()
  @IsUrl({}, { message: 'avatar must be a valid URL' })
  @MaxLength(2048)
  avatar?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(ID_PATTERN, { each: true, message: 'Identifier contains invalid characters' })
  teamIds?: string[];
}

export class UpdateProfileDto {
  @AtLeastOneField(['name', 'avatar'])
  @IsOptional()
  @CleanText()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUrl({}, { message: 'avatar must be a valid URL' })
  @MaxLength(2048)
  avatar?: string | null;
}

export class ResetUserPasswordDto {
  @IsOptional()
  @IsStrongPassword()
  password?: string;
}

export class UserIdsQueryDto {
  @IsOptional()
  @CsvArray()
  @IsArray()
  @Matches(ID_PATTERN, { each: true, message: 'Identifier contains invalid characters' })
  userIds?: string[];
}
