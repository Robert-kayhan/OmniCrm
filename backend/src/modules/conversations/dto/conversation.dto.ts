import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ID_PATTERN } from '../../../common/dto/id-param.dto';
import { PageQueryDto } from '../../../common/dto/pagination.dto';
import { CsvArray, OptionalCleanText, ToBoolean, Trim } from '../../../common/transforms';
import {
  Channel,
  ConversationPriority,
  ConversationStatus,
} from '../../../generated/prisma/enums';

/**
 * The assignment filters accept an id or one of two keywords, so the pattern is
 * widened rather than reusing ID_PATTERN — `me` and `unassigned` happen to match
 * it anyway, and the service is what gives them their meaning.
 */
const ASSIGNMENT_FILTER = /^[A-Za-z0-9_-]+$/;

export class ListConversationsQueryDto extends PageQueryDto {
  /** Matches customer name/email/phone and message content. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @CsvArray()
  @IsArray()
  @IsEnum(ConversationStatus, { each: true })
  status?: ConversationStatus[];

  @IsOptional()
  @CsvArray()
  @IsArray()
  @IsEnum(Channel, { each: true })
  channel?: Channel[];

  @IsOptional()
  @CsvArray()
  @IsArray()
  @IsEnum(ConversationPriority, { each: true })
  priority?: ConversationPriority[];

  /** `me` resolves to the caller; `unassigned` matches conversations with no owner. */
  @IsOptional()
  @Trim()
  @MaxLength(64)
  @Matches(ASSIGNMENT_FILTER, { message: 'Identifier contains invalid characters' })
  assignedUserId?: string;

  @IsOptional()
  @Trim()
  @MaxLength(64)
  @Matches(ASSIGNMENT_FILTER, { message: 'Identifier contains invalid characters' })
  assignedTeamId?: string;

  @IsOptional()
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  customerId?: string;

  @IsOptional()
  @CsvArray()
  @IsArray()
  @Matches(ID_PATTERN, { each: true, message: 'Identifier contains invalid characters' })
  tagIds?: string[];

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['recent', 'oldest', 'priority'])
  sort: 'recent' | 'oldest' | 'priority' = 'recent';
}

export class CreateConversationDto {
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  customerId!: string;

  @IsEnum(Channel)
  channel!: Channel;

  /** Optional: a manual conversation need not be bound to a provider inbox. */
  @IsOptional()
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  integrationId?: string;

  @IsOptional()
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  customerChannelId?: string;

  @IsOptional()
  @OptionalCleanText()
  @IsString()
  @MaxLength(200)
  subject?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(ConversationPriority)
  priority: ConversationPriority = ConversationPriority.NORMAL;

  @IsOptional()
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  assignedUserId?: string;

  @IsOptional()
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  assignedTeamId?: string;
}

export class UpdateStatusDto {
  @IsEnum(ConversationStatus)
  status!: ConversationStatus;
}

export class UpdatePriorityDto {
  @IsEnum(ConversationPriority)
  priority!: ConversationPriority;
}

export class ConversationTagsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Matches(ID_PATTERN, { each: true, message: 'Identifier contains invalid characters' })
  tagIds!: string[];
}

export class ConversationTagParamDto {
  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  id!: string;

  @Trim()
  @MaxLength(64)
  @Matches(ID_PATTERN, { message: 'Identifier contains invalid characters' })
  tagId!: string;
}
