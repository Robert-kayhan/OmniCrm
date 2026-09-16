import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { registerDecorator, ValidateIf, type ValidationArguments } from 'class-validator';
import { CursorQueryDto } from '../../../common/dto/pagination.dto';
import { ToBoolean, Trim } from '../../../common/transforms';
import { MessageType } from '../../../generated/prisma/enums';

/**
 * A message must carry text, attachments, or both.
 *
 * Its own validator rather than a generic "at least one field": an empty
 * `attachments: []` is present but says nothing, and a message with neither is
 * a blank row in the thread.
 */
function HasContentOrAttachments(): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'hasContentOrAttachments',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: 'A message must have content or at least one attachment' },
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const dto = args.object as { content?: string; attachments?: unknown[] };
          return Boolean(dto.content) || (dto.attachments?.length ?? 0) > 0;
        },
      },
    });
  };
}

export class ListMessagesQueryDto extends CursorQueryDto {
  /** Agents can hide their own internal notes to preview the customer's view. */
  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  includeInternal: boolean = true;
}

export class AttachmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(MessageType)
  type: MessageType = MessageType.FILE;

  @Trim()
  @IsUrl({}, { message: 'Attachment url must be a valid URL' })
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255)
  name?: string;
}

export class SendMessageDto {
  /**
   * The message text. Optional only when `attachments` carries the message
   * instead — a message must have one or the other.
   */
  // Line comments, not JSDoc: the Swagger plugin publishes the doc comment
  // above a property verbatim, and the reasoning below is for maintainers.
  //
  // The body-level rule hangs off `content` so the failure is reported against
  // the field the caller most likely meant to fill. @ValidateIf rather than
  // @IsOptional, because @IsOptional suppresses *every* validator on a property
  // when the value is absent — including the cross-field rule, which is
  // precisely the case it exists to catch. The condition below keeps the length
  // bound enforced whenever content is sent, skips it when attachments carry
  // the message instead, and lets the rule fire when neither is present.
  @ApiPropertyOptional({ maxLength: 5000 })
  @ValidateIf((dto: SendMessageDto) => dto.content !== undefined || !dto.attachments?.length)
  @HasContentOrAttachments()
  @Trim()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  /**
   * Internal messages are stored in the thread for context but never handed
   * to a provider. The send path branches on this flag before it resolves an
   * integration, so there is no route by which one reaches a customer.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isInternal: boolean = false;
}
