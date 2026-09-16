import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ID_PATTERN } from '../../../common/dto/id-param.dto';
import { OptionalCleanText, Trim } from '../../../common/transforms';
import { Channel } from '../../../generated/prisma/enums';

/** Nullable URL column: the UI clears it by sending an empty string. */
function NullableUrl(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });
}

export class CreateCustomerChannelDto {
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  integrationId!: string;

  @IsEnum(Channel)
  channel!: Channel;

  /** Provider-scoped identity. Opaque to the CRM, so only length is checked. */
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  externalUserId!: string;

  @IsOptional()
  @OptionalCleanText()
  @IsString()
  @MaxLength(120)
  username?: string | null;

  @IsOptional()
  @NullableUrl()
  @IsUrl({}, { message: 'profileUrl must be a valid URL' })
  @MaxLength(2048)
  profileUrl?: string | null;

  @IsOptional()
  @NullableUrl()
  @IsUrl({}, { message: 'avatar must be a valid URL' })
  @MaxLength(2048)
  avatar?: string | null;
}

export class CustomerChannelParamDto {
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  id!: string;

  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  channelId!: string;
}
