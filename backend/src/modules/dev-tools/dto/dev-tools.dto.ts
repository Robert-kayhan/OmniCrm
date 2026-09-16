import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ID_PATTERN } from '../../../common/dto/id-param.dto';
import { CleanText, OptionalCleanText, ToInt, Trim } from '../../../common/transforms';
import { Channel, MessageType } from '../../../generated/prisma/enums';

/**
 * Development-mode simulation.
 *
 * These endpoints drive the same intake path a real webhook uses, so the inbox
 * can be built and demoed before Meta App Review without a second, divergent
 * code path to maintain.
 */
export class SimulateInboundDto {
  /** Defaults to a sandbox integration created on demand. */
  @IsOptional()
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  integrationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(Channel)
  channel: Channel = Channel.FACEBOOK;

  /** Reuse an id to continue an existing simulated thread. */
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  externalUserId?: string;

  @IsOptional()
  @OptionalCleanText()
  @IsString()
  @MaxLength(120)
  name?: string | null;

  @CleanText()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(MessageType)
  messageType: MessageType = MessageType.TEXT;
}

export class SeedSampleDataDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(25)
  conversations: number = 5;

  @ApiPropertyOptional()
  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(30)
  messagesPerConversation: number = 6;
}
