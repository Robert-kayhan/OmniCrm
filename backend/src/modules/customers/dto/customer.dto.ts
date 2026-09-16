import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
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
import { CleanText, CsvArray, OptionalCleanText, Trim } from '../../../common/transforms';
import { AtLeastOneField } from '../../../common/validators/at-least-one-field.validator';
import { Channel, CustomerSource, CustomerStatus } from '../../../generated/prisma/enums';

/**
 * These three columns are nullable and the UI clears them by submitting an
 * empty string, so `""` has to land in the database as NULL rather than as a
 * zero-length value that sorts and matches differently. Each is one @Transform
 * rather than a stack of them, because class-transformer's ordering across
 * several decorators on one property is not worth relying on.
 */
function NullableEmail(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed.toLowerCase();
  });
}

/**
 * Phone numbers arrive in many shapes and this CRM is not the system of record
 * for dialling them, so validation is deliberately permissive: digits and the
 * usual separators, normalised to a single spacing.
 */
function NullablePhone(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    return trimmed === '' ? null : trimmed;
  });
}

function NullableUrl(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });
}

const PHONE_PATTERN = /^[+()\d\s.-]*$/;

export class ListCustomersQueryDto extends PageQueryDto {
  /** Matches name, email, phone and company. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @CsvArray()
  @IsArray()
  @IsEnum(CustomerStatus, { each: true })
  status?: CustomerStatus[];

  @IsOptional()
  @CsvArray()
  @IsArray()
  @IsEnum(CustomerSource, { each: true })
  source?: CustomerSource[];

  @IsOptional()
  @CsvArray()
  @IsArray()
  @IsEnum(Channel, { each: true })
  channel?: Channel[];

  @IsOptional()
  @CsvArray()
  @IsArray()
  @Matches(ID_PATTERN, { each: true, message: 'Identifier contains invalid characters' })
  tagIds?: string[];

  @IsOptional()
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  assignedUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['recent', 'created', 'name'])
  sort: 'recent' | 'created' | 'name' = 'recent';
}

export class CreateCustomerDto {
  @CleanText()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsOptional()
  @OptionalCleanText()
  @IsString()
  @MaxLength(80)
  lastName?: string | null;

  @IsOptional()
  @NullableEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @NullablePhone()
  @IsString()
  @MaxLength(32)
  @Matches(PHONE_PATTERN, { message: 'Enter a valid phone number' })
  phone?: string | null;

  @IsOptional()
  @OptionalCleanText()
  @IsString()
  @MaxLength(120)
  company?: string | null;

  @IsOptional()
  @NullableUrl()
  @IsUrl({}, { message: 'avatar must be a valid URL' })
  @MaxLength(2048)
  avatar?: string | null;

  @IsOptional()
  @OptionalCleanText()
  @IsString()
  @MaxLength(120)
  location?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(CustomerStatus)
  status: CustomerStatus = CustomerStatus.LEAD;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(CustomerSource)
  source: CustomerSource = CustomerSource.MANUAL;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(ID_PATTERN, { each: true, message: 'Identifier contains invalid characters' })
  tagIds?: string[];
}

export class UpdateCustomerDto {
  @AtLeastOneField([
    'firstName',
    'lastName',
    'email',
    'phone',
    'company',
    'avatar',
    'location',
    'status',
    'source',
  ])
  @IsOptional()
  @CleanText()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @OptionalCleanText()
  @IsString()
  @MaxLength(80)
  lastName?: string | null;

  @IsOptional()
  @NullableEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @NullablePhone()
  @IsString()
  @MaxLength(32)
  @Matches(PHONE_PATTERN, { message: 'Enter a valid phone number' })
  phone?: string | null;

  @IsOptional()
  @OptionalCleanText()
  @IsString()
  @MaxLength(120)
  company?: string | null;

  @IsOptional()
  @NullableUrl()
  @IsUrl({}, { message: 'avatar must be a valid URL' })
  @MaxLength(2048)
  avatar?: string | null;

  @IsOptional()
  @OptionalCleanText()
  @IsString()
  @MaxLength(120)
  location?: string | null;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsEnum(CustomerSource)
  source?: CustomerSource;
}

export class CustomerTagsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Matches(ID_PATTERN, { each: true, message: 'Identifier contains invalid characters' })
  tagIds!: string[];
}

export class CustomerTagParamDto {
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  id!: string;

  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  tagId!: string;
}
