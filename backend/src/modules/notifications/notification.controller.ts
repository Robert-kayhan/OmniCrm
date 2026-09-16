import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
  ApiStandardErrors,
} from '../../common/decorators/api-docs.decorators';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { withMeta } from '../../common/http/api-response';
import type { AuthContext } from '../../types/auth';
import { ListNotificationsQueryDto } from './dto/list-notifications.dto';
import { NotificationService } from './notification.service';

/**
 * No permission checks here: every route is implicitly scoped to the caller's
 * own notifications, so there is nothing an authenticated user should not see.
 */
@ApiTags('Notifications')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List the caller’s notifications' })
  @ApiPaginatedResponse()
  async list(@CurrentUser() auth: AuthContext, @Query() query: ListNotificationsQueryDto) {
    const result = await this.notifications.list(auth, query);
    return withMeta({ items: result.items, unread: result.unread }, result.meta);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count the caller’s unread notifications' })
  @ApiEnvelopeResponse()
  async unreadCount(@CurrentUser() auth: AuthContext) {
    return { unread: await this.notifications.getUnreadCount(auth) };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark every notification read' })
  @ApiEnvelopeResponse()
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() auth: AuthContext) {
    return this.notifications.markAllRead(auth);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  @ApiEnvelopeResponse()
  markRead(@CurrentUser() auth: AuthContext, @Param() { id }: IdParamDto) {
    return this.notifications.markRead(auth, id);
  }
}
