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
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import {
  CreateTeamDto,
  ListTeamsQueryDto,
  TeamMemberParamDto,
  TeamMembersDto,
  UpdateTeamDto,
} from './dto/team.dto';
import { TeamService } from './team.service';

@ApiTags('Teams')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('teams')
export class TeamController {
  constructor(private readonly teams: TeamService) {}

  @Get()
  @ApiOperation({ summary: 'List teams' })
  @ApiPaginatedResponse()
  @RequirePermissions(PERMISSIONS.TEAM_READ)
  async list(@CurrentUser() auth: AuthContext, @Query() query: ListTeamsQueryDto) {
    const result = await this.teams.list(auth.organizationId, query);
    return withMeta(result.items, result.meta);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a team' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.TEAM_READ)
  get(@CurrentUser() auth: AuthContext, @Param() { id }: IdParamDto) {
    return this.teams.getById(auth.organizationId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a team' })
  @ApiEnvelopeCreatedResponse()
  @RequirePermissions(PERMISSIONS.TEAM_CREATE)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateTeamDto,
    @Client() client: ClientContext,
  ) {
    return this.teams.create(auth, dto, client);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a team' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.TEAM_UPDATE)
  update(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateTeamDto,
    @Client() client: ClientContext,
  ) {
    return this.teams.update(auth, id, dto, client);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a team' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @RequirePermissions(PERMISSIONS.TEAM_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Client() client: ClientContext,
  ): Promise<void> {
    await this.teams.remove(auth, id, client);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add members to a team' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.TEAM_UPDATE)
  @HttpCode(HttpStatus.OK)
  addMembers(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: TeamMembersDto,
    @Client() client: ClientContext,
  ) {
    return this.teams.addMembers(auth, id, dto, client);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove a member from a team' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.TEAM_UPDATE)
  removeMember(
    @CurrentUser() auth: AuthContext,
    @Param() { id, userId }: TeamMemberParamDto,
    @Client() client: ClientContext,
  ) {
    return this.teams.removeMember(auth, id, userId, client);
  }
}
