import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiCursorPaginatedResponse,
  ApiEnvelopeCreatedResponse,
  ApiStandardErrors,
} from '../../common/decorators/api-docs.decorators';
import { Throttle } from '@nestjs/throttler';
import { PERMISSIONS } from '../../config/permissions';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { withMeta } from '../../common/http/api-response';
import { THROTTLERS } from '../../common/throttler/throttler.constants';
import type { AuthContext } from '../../types/auth';
import { ListMessagesQueryDto, SendMessageDto } from './dto/message.dto';
import { MessageService } from './message.service';

/**
 * A conversation's messages, mounted under the thread they belong to.
 *
 * `:id` is the conversation id, matching the path the Express router served,
 * so no client has to change.
 */
@ApiTags('Messages')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('conversations/:id/messages')
export class MessageController {
  constructor(private readonly messages: MessageService) {}

  @Get()
  @ApiOperation({ summary: 'List a conversation’s messages' })
  @ApiCursorPaginatedResponse()
  @RequirePermissions(PERMISSIONS.MESSAGE_READ)
  async list(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Query() query: ListMessagesQueryDto,
  ) {
    const result = await this.messages.list(auth, id, query);
    return withMeta(result.items, result.meta);
  }

  /**
   * Carries the per-user message budget on top of the global one: an outbound
   * message costs money at the provider, so it is metered separately from
   * ordinary API traffic.
   */
  @Post()
  @ApiOperation({ summary: 'Send a reply, or post an internal note' })
  @ApiEnvelopeCreatedResponse()
  @RequirePermissions(PERMISSIONS.MESSAGE_SEND)
  @Throttle({ [THROTTLERS.MESSAGE]: {} })
  @HttpCode(HttpStatus.CREATED)
  send(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.send(auth, id, dto);
  }
}
