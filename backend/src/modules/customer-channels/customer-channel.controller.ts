import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeCreatedResponse,
  ApiEnvelopeResponse,
  ApiStandardErrors,
} from '../../common/decorators/api-docs.decorators';
import { PERMISSIONS } from '../../config/permissions';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { IdParamDto } from '../../common/dto/id-param.dto';
import type { AuthContext } from '../../types/auth';
import { CustomerChannelService } from './customer-channel.service';
import {
  CreateCustomerChannelDto,
  CustomerChannelParamDto,
} from './dto/customer-channel.dto';

/**
 * A customer's provider identities, mounted under the customer that owns them —
 * a channel row is meaningless without one.
 */
@ApiTags('Customers')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('customers/:id/channels')
export class CustomerChannelController {
  constructor(private readonly channels: CustomerChannelService) {}

  @Get()
  @ApiOperation({ summary: 'List a customer’s channel identities' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  list(@CurrentUser() auth: AuthContext, @Param() { id }: IdParamDto) {
    return this.channels.list(auth.organizationId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Link a provider identity to a customer' })
  @ApiEnvelopeCreatedResponse()
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPDATE)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: CreateCustomerChannelDto,
  ) {
    return this.channels.create(auth, id, dto);
  }

  @Delete(':channelId')
  @ApiOperation({ summary: 'Unlink a provider identity' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() auth: AuthContext,
    @Param() { id, channelId }: CustomerChannelParamDto,
  ): Promise<void> {
    await this.channels.remove(auth, id, channelId);
  }
}
