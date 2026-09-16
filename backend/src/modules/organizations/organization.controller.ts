import { Body, Controller, Get, Patch } from '@nestjs/common';
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
import type { AuthContext } from '../../types/auth';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationService } from './organization.service';

/**
 * Always "current": the organization comes from the token, never from the path,
 * so there is no id for a caller to tamper with.
 */
@ApiTags('Organizations')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('organizations/current')
export class OrganizationController {
  constructor(private readonly organizations: OrganizationService) {}

  @Get()
  @ApiOperation({ summary: 'Get the caller’s organization' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.ORG_READ)
  get(@CurrentUser() auth: AuthContext) {
    return this.organizations.get(auth.organizationId);
  }

  @Patch()
  @ApiOperation({ summary: 'Rename the organization or change its slug' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.ORG_UPDATE)
  update(
    @CurrentUser() auth: AuthContext,
    @Body() dto: UpdateOrganizationDto,
    @Client() client: ClientContext,
  ) {
    return this.organizations.update(auth, dto, client);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard counters for the organization' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.ORG_READ)
  stats(@CurrentUser() auth: AuthContext) {
    return this.organizations.getStats(auth.organizationId);
  }
}
