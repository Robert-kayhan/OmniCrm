import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { ConversationStatus, SenderType } from '../../generated/prisma/enums';
import type { AuthContext } from '../../types/auth';
import type { AnalyticsQueryDto } from './dto/analytics-query.dto';

/**
 * Reporting for the analytics screen.
 *
 * Two rules hold throughout. Every query is scoped by `organizationId` taken
 * from the verified token, and every raw fragment interpolates its values
 * through Prisma's tagged template so they are bound parameters rather than
 * string concatenation.
 *
 * The route requires `conversation:read:all`, so this is deliberately a
 * workspace-wide view: aggregates over a subset an agent happens to be assigned
 * are not a meaningful statistic, and mixing scoped and unscoped numbers on one
 * screen invites the wrong conclusion.
 */

export interface VolumePoint {
  date: string;
  inbound: number;
  outbound: number;
}

export interface AgentPerformance {
  userId: string;
  name: string;
  avatar: string | null;
  messagesSent: number;
  conversationsClosed: number;
  conversationsAssigned: number;
}

export interface TagUsage {
  id: string;
  name: string;
  color: string;
  count: number;
}

export interface AnalyticsOverview {
  range: { days: number; from: string; to: string };
  totals: {
    conversationsOpened: number;
    conversationsClosed: number;
    messagesInbound: number;
    messagesOutbound: number;
    newCustomers: number;
    openNow: number;
    unassignedNow: number;
    unreadNow: number;
  };
  responseTime: {
    /** Seconds from the customer's first message to the first agent reply. */
    averageFirstResponseSeconds: number | null;
    medianFirstResponseSeconds: number | null;
    /** Seconds from conversation creation to closure. */
    averageResolutionSeconds: number | null;
    answeredConversations: number;
  };
  byChannel: Array<{ channel: string; conversations: number; messages: number }>;
  byStatus: Array<{ status: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  volume: VolumePoint[];
  agents: AgentPerformance[];
  tags: TagUsage[];
}

function windowStart(days: number): Date {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return from;
}

/** Optional channel filter as a reusable SQL fragment. */
function channelFilter(channels: string[] | undefined, column: Prisma.Sql): Prisma.Sql {
  if (!channels || channels.length === 0) return Prisma.empty;
  return Prisma.sql` AND ${column} IN (${Prisma.join(
    channels.map((channel) => Prisma.sql`${channel}::"Channel"`),
  )})`;
}

/**
 * Daily inbound and outbound counts, zero-filled.
 *
 * `generate_series` supplies the calendar so a quiet day is a zero rather than
 * a missing point — a line chart that silently closes gaps misrepresents an
 * outage as normal traffic.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async messageVolume(
    organizationId: string,
    from: Date,
    channels: string[] | undefined,
  ): Promise<VolumePoint[]> {
    const rows = await this.prisma.$queryRaw<Array<{ date: Date; inbound: bigint; outbound: bigint }>>`
      SELECT
        d.day::date AS date,
        COALESCE(SUM(CASE WHEN m."senderType" = 'CUSTOMER' THEN 1 ELSE 0 END), 0)::bigint AS inbound,
        COALESCE(SUM(CASE WHEN m."senderType" <> 'CUSTOMER' THEN 1 ELSE 0 END), 0)::bigint AS outbound
      FROM generate_series(${from}::date, CURRENT_DATE, '1 day') AS d(day)
      LEFT JOIN (
        SELECT m."createdAt", m."senderType"
        FROM messages m
        JOIN conversations c ON c.id = m."conversationId"
        WHERE m."organizationId" = ${organizationId}
          AND m."isInternal" = false
          AND m."createdAt" >= ${from}
          ${channelFilter(channels, Prisma.sql`c."channel"`)}
      ) m
        ON m."createdAt" >= d.day
       AND m."createdAt" < d.day + INTERVAL '1 day'
      GROUP BY d.day
      ORDER BY d.day ASC
    `;

    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      inbound: Number(row.inbound),
      outbound: Number(row.outbound),
    }));
  }

  /**
   * First response time per conversation.
   *
   * Measured from the customer's first message to the first non-internal agent
   * message after it. Conversations with no agent reply are excluded rather than
   * counted as zero, and reported separately as `answeredConversations` so the
   * average cannot be read as covering everything.
   */
  private async responseTimes(
    organizationId: string,
    from: Date,
    channels: string[] | undefined,
  ): Promise<AnalyticsOverview['responseTime']> {
    const [row] = await this.prisma.$queryRaw<
      Array<{ avg_first: number | null; median_first: number | null; answered: bigint }>
    >`
      WITH first_customer AS (
        SELECT m."conversationId", MIN(m."createdAt") AS at
        FROM messages m
        JOIN conversations c ON c.id = m."conversationId"
        WHERE m."organizationId" = ${organizationId}
          AND m."senderType" = 'CUSTOMER'
          AND m."createdAt" >= ${from}
          ${channelFilter(channels, Prisma.sql`c."channel"`)}
        GROUP BY m."conversationId"
      ),
      first_agent AS (
        SELECT fc."conversationId", MIN(m."createdAt") AS at
        FROM first_customer fc
        JOIN messages m
          ON m."conversationId" = fc."conversationId"
         AND m."createdAt" >= fc.at
        WHERE m."senderType" = 'AGENT'
          AND m."isInternal" = false
        GROUP BY fc."conversationId"
      )
      SELECT
        AVG(EXTRACT(EPOCH FROM (fa.at - fc.at))) AS avg_first,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (fa.at - fc.at))
        ) AS median_first,
        COUNT(*)::bigint AS answered
      FROM first_customer fc
      JOIN first_agent fa ON fa."conversationId" = fc."conversationId"
    `;

    const [resolution] = await this.prisma.$queryRaw<Array<{ avg_resolution: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM (c."closedAt" - c."createdAt"))) AS avg_resolution
      FROM conversations c
      WHERE c."organizationId" = ${organizationId}
        AND c."closedAt" IS NOT NULL
        AND c."closedAt" >= ${from}
        ${channelFilter(channels, Prisma.sql`c."channel"`)}
    `;

    const toSeconds = (value: number | null | undefined): number | null =>
      value === null || value === undefined ? null : Math.round(Number(value));

    return {
      averageFirstResponseSeconds: toSeconds(row?.avg_first),
      medianFirstResponseSeconds: toSeconds(row?.median_first),
      averageResolutionSeconds: toSeconds(resolution?.avg_resolution),
      answeredConversations: Number(row?.answered ?? 0),
    };
  }

  /** Exact message counts per channel for the window. */
  private async messagesPerChannel(
    organizationId: string,
    from: Date,
    channels: string[] | undefined,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<Array<{ channel: string; count: bigint }>>`
      SELECT c."channel"::text AS channel, COUNT(*)::bigint AS count
      FROM messages m
      JOIN conversations c ON c.id = m."conversationId"
      WHERE m."organizationId" = ${organizationId}
        AND m."isInternal" = false
        AND m."createdAt" >= ${from}
        ${channelFilter(channels, Prisma.sql`c."channel"`)}
      GROUP BY c."channel"
    `;
    return new Map(rows.map((row) => [row.channel, Number(row.count)]));
  }

  private async agentPerformance(
    organizationId: string,
    from: Date,
  ): Promise<AgentPerformance[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        avatar: string | null;
        messages_sent: bigint;
        conversations_closed: bigint;
        conversations_assigned: bigint;
      }>
    >`
      SELECT
        u.id,
        u.name,
        u.avatar,
        COALESCE(msg.count, 0)::bigint AS messages_sent,
        COALESCE(closed.count, 0)::bigint AS conversations_closed,
        COALESCE(assigned.count, 0)::bigint AS conversations_assigned
      FROM users u
      LEFT JOIN (
        SELECT m."senderUserId" AS user_id, COUNT(*) AS count
        FROM messages m
        WHERE m."organizationId" = ${organizationId}
          AND m."senderUserId" IS NOT NULL
          AND m."isInternal" = false
          AND m."createdAt" >= ${from}
        GROUP BY m."senderUserId"
      ) msg ON msg.user_id = u.id
      LEFT JOIN (
        SELECT c."assignedUserId" AS user_id, COUNT(*) AS count
        FROM conversations c
        WHERE c."organizationId" = ${organizationId}
          AND c."assignedUserId" IS NOT NULL
          AND c."closedAt" IS NOT NULL
          AND c."closedAt" >= ${from}
        GROUP BY c."assignedUserId"
      ) closed ON closed.user_id = u.id
      LEFT JOIN (
        SELECT a."assignedUserId" AS user_id, COUNT(*) AS count
        FROM conversation_assignments a
        JOIN conversations c ON c.id = a."conversationId"
        WHERE c."organizationId" = ${organizationId}
          AND a."assignedUserId" IS NOT NULL
          AND a."assignedAt" >= ${from}
        GROUP BY a."assignedUserId"
      ) assigned ON assigned.user_id = u.id
      WHERE u."organizationId" = ${organizationId}
        AND u.status = 'ACTIVE'
      ORDER BY messages_sent DESC, u.name ASC
      LIMIT 25
    `;

    return rows.map((row) => ({
      userId: row.id,
      name: row.name,
      avatar: row.avatar,
      messagesSent: Number(row.messages_sent),
      conversationsClosed: Number(row.conversations_closed),
      conversationsAssigned: Number(row.conversations_assigned),
    }));
  }

  async getOverview(
    actor: AuthContext,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsOverview> {
    const organizationId = actor.organizationId;
    const from = windowStart(query.days);
    const channels = query.channel;

    const conversationWindow: Prisma.ConversationWhereInput = {
      organizationId,
      createdAt: { gte: from },
      ...(channels?.length ? { channel: { in: channels } } : {}),
    };
    const liveScope: Prisma.ConversationWhereInput = {
      organizationId,
      ...(channels?.length ? { channel: { in: channels } } : {}),
    };
    const messageWindow: Prisma.MessageWhereInput = {
      organizationId,
      createdAt: { gte: from },
      isInternal: false,
      ...(channels?.length ? { conversation: { channel: { in: channels } } } : {}),
    };

    const [
      conversationsOpened,
      conversationsClosed,
      messagesInbound,
      messagesOutbound,
      newCustomers,
      openNow,
      unassignedNow,
      unreadAggregate,
      byStatusRows,
      byPriorityRows,
      conversationsByChannel,
      messageCountsByChannel,
      tagRows,
      volume,
      responseTime,
      agents,
    ] = await Promise.all([
      this.prisma.conversation.count({ where: conversationWindow }),
      this.prisma.conversation.count({
        where: { ...liveScope, closedAt: { gte: from } },
      }),
      this.prisma.message.count({ where: { ...messageWindow, senderType: SenderType.CUSTOMER } }),
      this.prisma.message.count({
        where: { ...messageWindow, senderType: { not: SenderType.CUSTOMER } },
      }),
      this.prisma.customer.count({ where: { organizationId, createdAt: { gte: from } } }),
      this.prisma.conversation.count({
        where: { ...liveScope, status: { not: ConversationStatus.CLOSED } },
      }),
      this.prisma.conversation.count({
        where: {
          ...liveScope,
          status: { not: ConversationStatus.CLOSED },
          assignedUserId: null,
          assignedTeamId: null,
        },
      }),
      this.prisma.conversation.aggregate({ where: liveScope, _sum: { unreadCount: true } }),
      this.prisma.conversation.groupBy({
        by: ['status'],
        where: liveScope,
        _count: { _all: true },
      }),
      this.prisma.conversation.groupBy({
        by: ['priority'],
        where: liveScope,
        _count: { _all: true },
      }),
      this.prisma.conversation.groupBy({
        by: ['channel'],
        where: conversationWindow,
        _count: { _all: true },
      }),
      this.messagesPerChannel(organizationId, from, channels),
      this.prisma.conversationTag.groupBy({
        by: ['tagId'],
        where: { conversation: conversationWindow },
        _count: { _all: true },
        orderBy: { _count: { tagId: 'desc' } },
        take: 10,
      }),
      this.messageVolume(organizationId, from, channels),
      this.responseTimes(organizationId, from, channels),
      this.agentPerformance(organizationId, from),
    ]);

    const tags = tagRows.length
      ? await this.prisma.tag.findMany({
          where: { id: { in: tagRows.map((row) => row.tagId) }, organizationId },
          select: { id: true, name: true, color: true },
        })
      : [];
    const tagCountById = new Map(tagRows.map((row) => [row.tagId, row._count._all]));

    return {
      range: {
        days: query.days,
        from: from.toISOString(),
        to: new Date().toISOString(),
      },
      totals: {
        conversationsOpened,
        conversationsClosed,
        messagesInbound,
        messagesOutbound,
        newCustomers,
        openNow,
        unassignedNow,
        unreadNow: unreadAggregate._sum.unreadCount ?? 0,
      },
      responseTime,
      byChannel: conversationsByChannel.map((row) => ({
        channel: row.channel as string,
        conversations: row._count._all,
        messages: messageCountsByChannel.get(row.channel as string) ?? 0,
      })),
      byStatus: byStatusRows.map((row) => ({
        status: row.status as string,
        count: row._count._all,
      })),
      byPriority: byPriorityRows.map((row) => ({
        priority: row.priority as string,
        count: row._count._all,
      })),
      volume,
      agents,
      tags: tags
        .map((tag) => ({ ...tag, count: tagCountById.get(tag.id) ?? 0 }))
        .sort((a, b) => b.count - a.count),
    };
  }
}
