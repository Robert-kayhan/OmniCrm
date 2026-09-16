import { Injectable, Logger } from '@nestjs/common';
import { toSkipTake } from '../../common/dto/pagination.dto';
import { NotFoundError } from '../../common/errors/app.error';
import { buildPaginationMeta } from '../../common/http/api-response';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { NotificationType } from '../../generated/prisma/enums';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import type { AuthContext } from '../../types/auth';
import type { ListNotificationsQueryDto } from './dto/list-notifications.dto';

const notificationSelect = {
  id: true,
  organizationId: true,
  userId: true,
  conversationId: true,
  type: true,
  title: true,
  message: true,
  isRead: true,
  readAt: true,
  data: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export type NotificationDto = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

export interface CreateNotificationInput {
  organizationId: string;
  userId: string;
  conversationId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Notifications are a side effect of the action that caused them, never the
   * point of it. A failure here is logged and swallowed so a notification outage
   * cannot roll back an assignment or drop an inbound customer message.
   *
   * The socket push happens here rather than at each call site, so a notification
   * cannot be written without being delivered. The row is the durable record
   * either way: a disconnected agent still sees it on next load.
   */
  async create(input: CreateNotificationInput): Promise<NotificationDto | null> {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          conversationId: input.conversationId ?? null,
          type: input.type,
          title: input.title,
          message: input.message,
          ...(input.data !== undefined ? { data: input.data } : {}),
        },
        select: notificationSelect,
      });

      this.realtime.emitNotification(notification);
      return notification;
    } catch (error) {
      this.logger.error(
        { err: error, userId: input.userId, type: input.type },
        'Failed to create notification',
      );
      return null;
    }
  }

  /** Fans one notification out to several recipients, skipping duplicates of self. */
  async createForUsers(
    userIds: string[],
    input: Omit<CreateNotificationInput, 'userId'>,
  ): Promise<void> {
    const unique = Array.from(new Set(userIds));
    if (unique.length === 0) return;
    await Promise.all(unique.map((userId) => this.create({ ...input, userId })));
  }

  async list(actor: AuthContext, query: ListNotificationsQueryDto) {
    const where: Prisma.NotificationWhereInput = {
      // Notifications are strictly per-user; organizationId is a redundant guard.
      userId: actor.userId,
      organizationId: actor.organizationId,
      ...(query.unreadOnly ? { isRead: false } : {}),
    };

    const { skip, take } = toSkipTake(query);

    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: notificationSelect,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId: actor.userId, organizationId: actor.organizationId, isRead: false },
      }),
    ]);

    return { items, unread, meta: buildPaginationMeta(query.page, query.limit, total) };
  }

  async getUnreadCount(actor: AuthContext): Promise<number> {
    return this.prisma.notification.count({
      where: { userId: actor.userId, organizationId: actor.organizationId, isRead: false },
    });
  }

  async markRead(actor: AuthContext, notificationId: string): Promise<NotificationDto> {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId: actor.userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Notification', 'NOTIFICATION_NOT_FOUND');

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
      select: notificationSelect,
    });
  }

  async markAllRead(actor: AuthContext): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId: actor.userId, organizationId: actor.organizationId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }
}
