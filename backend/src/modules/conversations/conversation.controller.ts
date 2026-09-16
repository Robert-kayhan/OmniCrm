import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeCreatedResponse,
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
  ApiStandardErrors,
} from '../../common/decorators/api-docs.decorators';
import { PERMISSIONS } from '../../config/permissions';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import {
  Client,
  type ClientContext,
} from '../../common/decorators/client-context.decorator';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { withMeta } from '../../common/http/api-response';
import type { AuthContext } from '../../types/auth';
import { ConversationService } from './conversation.service';
import {
  ConversationTagParamDto,
  ConversationTagsDto,
  CreateConversationDto,
  ListConversationsQueryDto,
  UpdatePriorityDto,
  UpdateStatusDto,
} from './dto/conversation.dto';

@ApiTags('Conversations')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversations: ConversationService) {}

  @Get()
  @ApiOperation({ summary: 'List conversations in the inbox' })
  @ApiPaginatedResponse()
  @RequirePermissions(PERMISSIONS.CONVERSATION_READ)
  async list(@CurrentUser() auth: AuthContext, @Query() query: ListConversationsQueryDto) {
    const result = await this.conversations.list(auth, query);
    return withMeta(result.items, result.meta);
  }

  /** Declared before `:id` so "stats" is not parsed as a conversation id. */
  @Get('stats')
  @ApiOperation({ summary: 'Conversation counters for the inbox header' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CONVERSATION_READ)
  stats(@CurrentUser() auth: AuthContext) {
    return this.conversations.getStats(auth);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a conversation' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CONVERSATION_READ)
  get(@CurrentUser() auth: AuthContext, @Param() { id }: IdParamDto) {
    return this.conversations.getById(auth, id);
  }

  @Post()
  @ApiOperation({ summary: 'Open a conversation' })
  @ApiEnvelopeCreatedResponse()
  @RequirePermissions(PERMISSIONS.CONVERSATION_CREATE)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateConversationDto,
    @Client() client: ClientContext,
  ) {
    return this.conversations.create(auth, dto, client);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change a conversation’s status' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CONVERSATION_UPDATE)
  updateStatus(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateStatusDto,
    @Client() client: ClientContext,
  ) {
    return this.conversations.updateStatus(auth, id, dto, client);
  }

  @Patch(':id/priority')
  @ApiOperation({ summary: 'Change a conversation’s priority' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CONVERSATION_UPDATE)
  updatePriority(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: UpdatePriorityDto,
    @Client() client: ClientContext,
  ) {
    return this.conversations.updatePriority(auth, id, dto, client);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Clear the unread badge and stamp read receipts' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CONVERSATION_READ)
  @HttpCode(HttpStatus.OK)
  markRead(@CurrentUser() auth: AuthContext, @Param() { id }: IdParamDto) {
    return this.conversations.markRead(auth, id);
  }

  @Post(':id/tags')
  @ApiOperation({ summary: 'Attach tags to a conversation' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CONVERSATION_UPDATE)
  @HttpCode(HttpStatus.OK)
  addTags(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: ConversationTagsDto,
  ) {
    return this.conversations.addTags(auth, id, dto);
  }

  @Delete(':id/tags/:tagId')
  @ApiOperation({ summary: 'Detach a tag from a conversation' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CONVERSATION_UPDATE)
  removeTag(
    @CurrentUser() auth: AuthContext,
    @Param() { id, tagId }: ConversationTagParamDto,
  ) {
    return this.conversations.removeTag(auth, id, tagId);
  }
}
