import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiPaginatedResponse,
  ApiStandardErrors,
} from '../../common/decorators/api-docs.decorators';
import { PERMISSIONS } from '../../config/permissions';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { withMeta } from '../../common/http/api-response';
import type { AuthContext } from '../../types/auth';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.dto';

@ApiTags('Audit logs')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogs: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries' })
  @ApiPaginatedResponse()
  @RequirePermissions(PERMISSIONS.AUDIT_LOG_READ)
  async list(@CurrentUser() auth: AuthContext, @Query() query: ListAuditLogsQueryDto) {
    const result = await this.auditLogs.list(auth.organizationId, query);
    return withMeta(result.items, result.meta);
  }
}
