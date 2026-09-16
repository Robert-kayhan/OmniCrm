import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiStandardErrors,
} from '../../common/decorators/api-docs.decorators';
import { PERMISSIONS } from '../../config/permissions';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import {
  Client,
  type ClientContext,
} from '../../common/decorators/client-context.decorator';
import { IdParamDto } from '../../common/dto/id-param.dto';
import type { AuthContext } from '../../types/auth';
import { AssignmentService } from './assignment.service';
import { AssignConversationDto } from './dto/assign-conversation.dto';

/** Ownership of a conversation, mounted under the thread it applies to. */
@ApiTags('Conversations')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('conversations/:id')
export class AssignmentController {
  constructor(private readonly assignments: AssignmentService) {}

  @Post('assign')
  @ApiOperation({ summary: 'Assign or unassign a conversation' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CONVERSATION_ASSIGN)
  @HttpCode(HttpStatus.OK)
  assign(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: AssignConversationDto,
    @Client() client: ClientContext,
  ) {
    return this.assignments.assign(auth, id, dto, client);
  }

  @Get('assignments')
  @ApiOperation({ summary: 'List a conversation’s assignment history' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CONVERSATION_READ)
  history(@CurrentUser() auth: AuthContext, @Param() { id }: IdParamDto) {
    return this.assignments.listHistory(auth, id);
  }
}
