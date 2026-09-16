import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CleanText, CsvArray, Trim } from '../../../common/transforms';
import { AtLeastOneField } from '../../../common/validators/at-least-one-field.validator';
import { IntegrationStatus, IntegrationType } from '../../../generated/prisma/enums';

export class ListIntegrationsQueryDto {
  @IsOptional()
  @CsvArray()
  @IsArray()
  @IsEnum(IntegrationType, { each: true })
  type?: IntegrationType[];

  @IsOptional()
  @CsvArray()
  @IsArray()
  @IsEnum(IntegrationStatus, { each: true })
  status?: IntegrationStatus[];
}

/**
 * Connecting a Facebook Page by hand.
 *
 * The Page access token is supplied by the operator (from the Meta app
 * dashboard or an OAuth exchange) and is encrypted before it is stored. It is
 * write-only: no endpoint ever returns it.
 */
export class ConnectFacebookDto {
  @CleanText()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^\d+$/, { message: 'Facebook Page id must be numeric' })
  pageId!: string;

  @Trim()
  @IsString()
  @MinLength(20, { message: 'Page access token looks too short' })
  @MaxLength(1024)
  pageAccessToken!: string;

  /** Optional: the Meta business/app-scoped account the Page belongs to. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(64)
  externalAccountId?: string;
}

export class UpdateIntegrationDto {
  @AtLeastOneField(['name', 'status'])
  @IsOptional()
  @CleanText()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn([IntegrationStatus.CONNECTED, IntegrationStatus.DISCONNECTED])
  status?: IntegrationStatus;
}

/**
 * Meta's redirect back from the login dialog.
 *
 * Everything is optional because the operator may have cancelled, in which
 * case Meta returns `error`/`error_description` and no code. The handler turns
 * that into a friendly redirect rather than a validation failure.
 */
export class FacebookOAuthCallbackQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  code?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  state?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(256)
  error?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(256)
  error_reason?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(512)
  error_description?: string;
}

/**
 * Picking one inbox out of the ones the login returned.
 *
 * `pageId` always identifies the Facebook Page, for both channels: Instagram
 * Direct is reached through the Page it is linked to, and `channel` selects
 * which of the Page's two inboxes is connected.
 */
export class ConnectFacebookPageDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  handoffId!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^\d+$/, { message: 'Facebook Page id must be numeric' })
  pageId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([IntegrationType.FACEBOOK, IntegrationType.INSTAGRAM])
  channel: IntegrationType = IntegrationType.FACEBOOK;

  /** Defaults to the Page or Instagram handle when omitted. */
  @IsOptional()
  @CleanText()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}

/** Reading back the Pages from a completed login. */
export class FacebookOAuthPagesQueryDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  handoffId!: string;
}
