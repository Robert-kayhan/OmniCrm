import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiEnvelopeCreatedResponse,
  ApiPaginatedResponse,
  ApiStandardErrors,
} from '../../common/decorators/api-docs.decorators';
import { PERMISSIONS } from '../../config/permissions';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { withMeta } from '../../common/http/api-response';
import type { AuthContext } from '../../types/auth';
import { ConversationAccessService } from '../conversations/conversation.access';
import { CreateNoteDto, ListNotesQueryDto } from './dto/note.dto';
import { NoteService } from './note.service';

/**
 * Notes are created and listed through their parent. Only deletion needs a
 * top-level route, because a note id is enough to identify it.
 *
 * NOTE_READ rather than NOTE_DELETE on the route: the ownership rule lives in
 * the service, which lets an author delete their own note while requiring the
 * stronger permission to delete somebody else's.
 */
@ApiTags('Notes')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('notes')
export class NoteController {
  constructor(private readonly notes: NoteService) {}

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a note' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @RequirePermissions(PERMISSIONS.NOTE_READ)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() auth: AuthContext, @Param() { id }: IdParamDto): Promise<void> {
    await this.notes.remove(auth, id);
  }
}

@ApiTags('Notes')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('customers/:id/notes')
export class CustomerNoteController {
  constructor(private readonly notes: NoteService) {}

  @Get()
  @ApiOperation({ summary: "List a customer's notes" })
  @ApiPaginatedResponse()
  @RequirePermissions(PERMISSIONS.NOTE_READ)
  async list(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Query() query: ListNotesQueryDto,
  ) {
    const result = await this.notes.listForCustomer(auth.organizationId, id, query);
    return withMeta(result.items, result.meta);
  }

  @Post()
  @ApiOperation({ summary: 'Add a note to a customer' })
  @ApiEnvelopeCreatedResponse()
  @RequirePermissions(PERMISSIONS.NOTE_CREATE)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: CreateNoteDto,
  ) {
    return this.notes.createForCustomer(auth, id, dto);
  }
}

@ApiTags('Notes')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('conversations/:id/notes')
export class ConversationNoteController {
  constructor(
    private readonly notes: NoteService,
    private readonly access: ConversationAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List a conversation's internal notes" })
  @ApiPaginatedResponse()
  @RequirePermissions(PERMISSIONS.NOTE_READ)
  async list(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Query() query: ListNotesQueryDto,
  ) {
    // The thread's own visibility rule gates its notes: a conversation an agent
    // cannot see must not leak through its note list.
    await this.access.assertAccess(auth, id);
    const result = await this.notes.listForConversation(auth.organizationId, id, query);
    return withMeta(result.items, result.meta);
  }

  @Post()
  @ApiOperation({ summary: 'Add an internal note to a conversation' })
  @ApiEnvelopeCreatedResponse()
  @RequirePermissions(PERMISSIONS.NOTE_CREATE)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: CreateNoteDto,
  ) {
    const conversation = await this.access.assertAccess(auth, id);
    return this.notes.createForConversation(auth, id, conversation.customerId, dto);
  }
}
