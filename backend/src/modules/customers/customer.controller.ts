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
import { CustomerService } from './customer.service';
import {
  CreateCustomerDto,
  CustomerTagParamDto,
  CustomerTagsDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

@ApiTags('Customers')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('customers')
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  @Get()
  @ApiOperation({ summary: 'List customers' })
  @ApiPaginatedResponse()
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  async list(@CurrentUser() auth: AuthContext, @Query() query: ListCustomersQueryDto) {
    const result = await this.customers.list(auth.organizationId, query);
    return withMeta(result.items, result.meta);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a customer' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  get(@CurrentUser() auth: AuthContext, @Param() { id }: IdParamDto) {
    return this.customers.getById(auth.organizationId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a customer' })
  @ApiEnvelopeCreatedResponse()
  @RequirePermissions(PERMISSIONS.CUSTOMER_CREATE)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateCustomerDto,
    @Client() client: ClientContext,
  ) {
    return this.customers.create(auth, dto, client);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a customer' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPDATE)
  update(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateCustomerDto,
    @Client() client: ClientContext,
  ) {
    return this.customers.update(auth, id, dto, client);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a customer and everything attached to them' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @RequirePermissions(PERMISSIONS.CUSTOMER_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Client() client: ClientContext,
  ): Promise<void> {
    await this.customers.remove(auth, id, client);
  }

  @Post(':id/tags')
  @ApiOperation({ summary: 'Attach tags to a customer' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPDATE)
  @HttpCode(HttpStatus.OK)
  addTags(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: CustomerTagsDto,
  ) {
    return this.customers.addTags(auth, id, dto);
  }

  @Delete(':id/tags/:tagId')
  @ApiOperation({ summary: 'Detach a tag from a customer' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPDATE)
  removeTag(@CurrentUser() auth: AuthContext, @Param() { id, tagId }: CustomerTagParamDto) {
    return this.customers.removeTag(auth, id, tagId);
  }
}
