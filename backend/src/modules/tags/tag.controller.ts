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
import { IdParamDto } from '../../common/dto/id-param.dto';
import { withMeta } from '../../common/http/api-response';
import type { AuthContext } from '../../types/auth';
import { CreateTagDto, ListTagsQueryDto, UpdateTagDto } from './dto/tag.dto';
import { TagService } from './tag.service';

@ApiTags('Tags')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('tags')
export class TagController {
  constructor(private readonly tags: TagService) {}

  @Get()
  @ApiOperation({ summary: 'List tags' })
  @ApiPaginatedResponse()
  @RequirePermissions(PERMISSIONS.TAG_READ)
  async list(@CurrentUser() auth: AuthContext, @Query() query: ListTagsQueryDto) {
    const result = await this.tags.list(auth.organizationId, query);
    return withMeta(result.items, result.meta);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tag' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.TAG_READ)
  get(@CurrentUser() auth: AuthContext, @Param() { id }: IdParamDto) {
    return this.tags.getById(auth.organizationId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a tag' })
  @ApiEnvelopeCreatedResponse()
  @RequirePermissions(PERMISSIONS.TAG_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() auth: AuthContext, @Body() dto: CreateTagDto) {
    return this.tags.create(auth, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tag' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.TAG_MANAGE)
  update(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tags.update(auth, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a tag' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @RequirePermissions(PERMISSIONS.TAG_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() auth: AuthContext, @Param() { id }: IdParamDto): Promise<void> {
    await this.tags.remove(auth, id);
  }
}
