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
  CreateUserDto,
  ListUsersQueryDto,
  ResetUserPasswordDto,
  UpdateProfileDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UserService } from './user.service';

@ApiTags('Users')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiPaginatedResponse()
  @RequirePermissions(PERMISSIONS.USER_READ)
  async list(@CurrentUser() auth: AuthContext, @Query() query: ListUsersQueryDto) {
    const result = await this.users.list(auth.organizationId, query);
    return withMeta(result.items, result.meta);
  }

  /**
   * Declared before `:id` so the literal paths are matched first — Nest routes
   * in declaration order, exactly as the Express router did.
   */
  @Get('assignable')
  @ApiOperation({ summary: 'List active users for assignment pickers' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.USER_READ)
  listAssignable(@CurrentUser() auth: AuthContext) {
    return this.users.listAssignable(auth.organizationId);
  }

  /** Self-service: no permission gate, because the target is always the caller. */
  @Patch('me')
  @ApiOperation({ summary: 'Update the caller’s own profile' })
  @ApiEnvelopeResponse()
  updateOwnProfile(@CurrentUser() auth: AuthContext, @Body() dto: UpdateProfileDto) {
    return this.users.updateOwnProfile(auth, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.USER_READ)
  get(@CurrentUser() auth: AuthContext, @Param() { id }: IdParamDto) {
    return this.users.getById(auth.organizationId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  @ApiEnvelopeCreatedResponse()
  @RequirePermissions(PERMISSIONS.USER_CREATE)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateUserDto,
    @Client() client: ClientContext,
  ) {
    return this.users.create(auth, dto, client);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  update(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateUserDto,
    @Client() client: ClientContext,
  ) {
    return this.users.update(auth, id, dto, client);
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: 'Reset a user’s password' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: ResetUserPasswordDto,
    @Client() client: ClientContext,
  ) {
    return this.users.resetPassword(auth, id, dto, client);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @RequirePermissions(PERMISSIONS.USER_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Client() client: ClientContext,
  ): Promise<void> {
    await this.users.remove(auth, id, client);
  }
}
