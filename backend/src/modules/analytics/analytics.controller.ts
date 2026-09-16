import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiStandardErrors,
} from '../../common/decorators/api-docs.decorators';
import { PERMISSIONS } from '../../config/permissions';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import type { AuthContext } from '../../types/auth';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

/**
 * Reporting is a workspace-wide view, so it requires the permission that grants
 * workspace-wide visibility. An agent who can only see their own queue would
 * get numbers that look authoritative but describe a slice, which is worse than
 * no numbers at all.
 */
@ApiTags('Analytics')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Workspace reporting overview' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.CONVERSATION_READ_ALL)
  overview(@CurrentUser() auth: AuthContext, @Query() query: AnalyticsQueryDto) {
    return this.analytics.getOverview(auth, query);
  }
}
