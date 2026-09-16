import { Injectable } from '@nestjs/common';
import type { ClientContext } from '../../common/decorators/client-context.decorator';
import { toSkipTake } from '../../common/dto/pagination.dto';
import { BadRequestError, NotFoundError } from '../../common/errors/app.error';
import { buildPaginationMeta } from '../../common/http/api-response';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { Channel, ConversationStatus, SenderType } from '../../generated/prisma/enums';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import type { AuthContext } from '../../types/auth';
import { AssignmentLedgerService } from '../assignments/assignment-ledger.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import { CustomerService } from '../customers/customer.service';
import { TagService } from '../tags/tag.service';
import { ConversationAccessService, visibilityFilter } from './conversation.access';
import { conversationSelect, toConversationDto, type ConversationDto } from './conversation.select';
import type {
  ConversationTagsDto,
  CreateConversationDto,
  ListConversationsQueryDto,
  UpdatePriorityDto,
  UpdateStatusDto,
} from './dto/conversation.dto';

function searchFilter(search: string): Prisma.ConversationWhereInput {
  const term = search.trim();
  return {
    OR: [
      { subject: { contains: term, mode: 'insensitive' } },
      { customer: { firstName: { contains: term, mode: 'insensitive' } } },
      { customer: { lastName: { contains: term, mode: 'insensitive' } } },
      { customer: { email: { contains: term, mode: 'insensitive' } } },
      { customer: { phone: { contains: term, mode: 'insensitive' } } },
      { customer: { company: { contains: term, mode: 'insensitive' } } },
      { messages: { some: { content: { contains: term, mode: 'insensitive' } } } },
    ],
  };
}

function assignmentFilter(
  actor: AuthContext,
  query: ListConversationsQueryDto,
): Prisma.ConversationWhereInput {
  const filters: Prisma.ConversationWhereInput[] = [];

  if (query.assignedUserId === 'me') {
    filters.push({ assignedUserId: actor.userId });
  } else if (query.assignedUserId === 'unassigned') {
    filters.push({ assignedUserId: null });
  } else if (query.assignedUserId) {
    filters.push({ assignedUserId: query.assignedUserId });
  }

  if (query.assignedTeamId === 'unassigned') {
    filters.push({ assignedTeamId: null });
  } else if (query.assignedTeamId) {
    filters.push({ assignedTeamId: query.assignedTeamId });
  }

  return filters.length > 0 ? { AND: filters } : {};
}

function buildWhere(
  actor: AuthContext,
  query: ListConversationsQueryDto,
): Prisma.ConversationWhereInput {
  return {
    // Tenancy and row-level visibility in one place.
    ...visibilityFilter(actor),
    ...(query.search ? searchFilter(query.search) : {}),
    ...(query.status?.length ? { status: { in: query.status } } : {}),
    ...(query.channel?.length ? { channel: { in: query.channel } } : {}),
    ...(query.priority?.length ? { priority: { in: query.priority } } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.tagIds?.length ? { tags: { some: { tagId: { in: query.tagIds } } } } : {}),
    ...(query.unreadOnly ? { unreadCount: { gt: 0 } } : {}),
    ...assignmentFilter(actor, query),
  };
}

function buildOrderBy(
  sort: ListConversationsQueryDto['sort'],
): Prisma.ConversationOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ lastMessageAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }];
    case 'priority':
      // Enum order in the schema is LOW < NORMAL < HIGH < URGENT, so descending
      // puts URGENT first.
      return [{ priority: 'desc' }, { lastMessageAt: { sort: 'desc', nulls: 'last' } }];
    case 'recent':
    default:
      // `nulls: 'last'` is explicit because Postgres would otherwise float a
      // conversation with no activity to the top of the inbox.
      return [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];
  }
}

/** Turns a Prisma groupBy result into a plain { key: count } map. */
function countsByField<T extends string>(
  rows: Array<Record<string, unknown> & { _count: { _all: number } }>,
  field: string,
): Record<T, number> {
  const result = {} as Record<string, number>;
  for (const row of rows) {
    result[String(row[field])] = row._count._all;
  }
  return result as Record<T, number>;
}

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConversationAccessService,
    private readonly customers: CustomerService,
    private readonly tags: TagService,
    private readonly ledger: AssignmentLedgerService,
    private readonly auditLogs: AuditLogService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(actor: AuthContext, query: ListConversationsQueryDto) {
    const where = buildWhere(actor, query);
    const { skip, take } = toSkipTake(query);

    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sort),
        select: conversationSelect,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return {
      items: rows.map(toConversationDto),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async getById(actor: AuthContext, conversationId: string): Promise<ConversationDto> {
    await this.access.assertAccess(actor, conversationId);
    const row = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: conversationSelect,
    });
    if (!row) throw new NotFoundError('Conversation', 'CONVERSATION_NOT_FOUND');
    return toConversationDto(row);
  }

  /**
   * Aggregate counters for the inbox header and dashboard, as grouped counts
   * rather than one query per bucket.
   */
  async getStats(actor: AuthContext) {
    const scope = visibilityFilter(actor);

    const [byStatus, byChannel, byPriority, unreadAggregate, assignedToMe] = await Promise.all([
      this.prisma.conversation.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
      this.prisma.conversation.groupBy({ by: ['channel'], where: scope, _count: { _all: true } }),
      this.prisma.conversation.groupBy({ by: ['priority'], where: scope, _count: { _all: true } }),
      this.prisma.conversation.aggregate({ where: scope, _sum: { unreadCount: true } }),
      this.prisma.conversation.count({
        where: {
          ...scope,
          assignedUserId: actor.userId,
          status: { not: ConversationStatus.CLOSED },
        },
      }),
    ]);

    return {
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      byStatus: countsByField(byStatus, 'status'),
      byChannel: countsByField(byChannel, 'channel'),
      byPriority: countsByField(byPriority, 'priority'),
      unread: unreadAggregate._sum.unreadCount ?? 0,
      assignedToMe,
    };
  }

  /**
   * Validates every foreign key the caller supplied against the actor's own
   * organization. Doing this up front means the create transaction cannot fail
   * halfway on a constraint, and a caller can never attach another tenant's
   * integration, team or user by guessing an id.
   */
  private async assertCreateReferences(
    actor: AuthContext,
    input: CreateConversationDto,
  ): Promise<void> {
    await this.customers.assertExists(actor.organizationId, input.customerId);

    if (input.integrationId) {
      const integration = await this.prisma.integration.findFirst({
        where: { id: input.integrationId, organizationId: actor.organizationId },
        select: { id: true, type: true },
      });
      if (!integration) throw new BadRequestError('Integration not found', 'INTEGRATION_NOT_FOUND');
      if ((integration.type as string) !== (input.channel as string)) {
        throw new BadRequestError(
          `Channel ${input.channel} does not match the ${integration.type} integration`,
          'CHANNEL_INTEGRATION_MISMATCH',
        );
      }
    }

    if (input.customerChannelId) {
      const channel = await this.prisma.customerChannel.findFirst({
        where: { id: input.customerChannelId, customerId: input.customerId },
        select: { id: true },
      });
      if (!channel) {
        throw new BadRequestError('Customer channel not found', 'CUSTOMER_CHANNEL_NOT_FOUND');
      }
    }

    if (input.assignedUserId) {
      const user = await this.prisma.user.findFirst({
        where: { id: input.assignedUserId, organizationId: actor.organizationId },
        select: { id: true },
      });
      if (!user) throw new BadRequestError('Assignee not found', 'USER_NOT_FOUND');
    }

    if (input.assignedTeamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: input.assignedTeamId, organizationId: actor.organizationId },
        select: { id: true },
      });
      if (!team) throw new BadRequestError('Team not found', 'TEAM_NOT_FOUND');
    }
  }

  async create(
    actor: AuthContext,
    input: CreateConversationDto,
    context: ClientContext,
  ): Promise<ConversationDto> {
    await this.assertCreateReferences(actor, input);

    const created = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          organizationId: actor.organizationId,
          customerId: input.customerId,
          channel: input.channel as Channel,
          integrationId: input.integrationId ?? null,
          customerChannelId: input.customerChannelId ?? null,
          subject: input.subject ?? null,
          priority: input.priority,
          assignedUserId: input.assignedUserId ?? null,
          assignedTeamId: input.assignedTeamId ?? null,
          // Stamped at creation so the inbox sort means "last activity". Left
          // null, Postgres would order this conversation above one that received
          // a message a second ago, because DESC puts nulls first.
          lastMessageAt: new Date(),
        },
        select: { id: true },
      });

      // An assignment made at creation still enters the history, so the trail
      // starts from the first owner rather than the first reassignment.
      if (input.assignedUserId || input.assignedTeamId) {
        await this.ledger.record(tx, {
          conversationId: conversation.id,
          assignedUserId: input.assignedUserId ?? null,
          assignedTeamId: input.assignedTeamId ?? null,
          assignedById: actor.userId,
        });
      }

      return conversation;
    });

    await this.auditLogs.record({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: AUDIT_ACTIONS.CONVERSATION_CREATED,
      entityType: AUDIT_ENTITIES.CONVERSATION,
      entityId: created.id,
      newData: { customerId: input.customerId, channel: input.channel },
      ...context,
    });

    const conversation = await this.getById(actor, created.id);
    this.realtime.emitConversationChanged(conversation, 'created');
    return conversation;
  }

  async updateStatus(
    actor: AuthContext,
    conversationId: string,
    input: UpdateStatusDto,
    context: ClientContext,
  ): Promise<ConversationDto> {
    const existing = await this.access.assertAccess(actor, conversationId);
    if (existing.status === input.status) {
      return this.getById(actor, conversationId);
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: input.status,
        // Reopening clears the closure stamp so time-to-close stays meaningful.
        closedAt: input.status === ConversationStatus.CLOSED ? new Date() : null,
      },
    });

    await this.auditLogs.record({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: AUDIT_ACTIONS.CONVERSATION_STATUS_CHANGED,
      entityType: AUDIT_ENTITIES.CONVERSATION,
      entityId: conversationId,
      oldData: { status: existing.status },
      newData: { status: input.status },
      ...context,
    });

    const conversation = await this.getById(actor, conversationId);
    this.realtime.emitConversationChanged(conversation, 'status');
    return conversation;
  }

  async updatePriority(
    actor: AuthContext,
    conversationId: string,
    input: UpdatePriorityDto,
    context: ClientContext,
  ): Promise<ConversationDto> {
    await this.access.assertAccess(actor, conversationId);

    const before = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { priority: true },
    });
    if (before?.priority === input.priority) {
      return this.getById(actor, conversationId);
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { priority: input.priority },
    });

    await this.auditLogs.record({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: AUDIT_ACTIONS.CONVERSATION_PRIORITY_CHANGED,
      entityType: AUDIT_ENTITIES.CONVERSATION,
      entityId: conversationId,
      oldData: { priority: before?.priority ?? null },
      newData: { priority: input.priority },
      ...context,
    });

    const conversation = await this.getById(actor, conversationId);
    this.realtime.emitConversationChanged(conversation, 'priority');
    return conversation;
  }

  /**
   * Clears the unread badge and stamps read receipts on the customer's messages.
   * Idempotent: reopening an already-read conversation writes nothing new.
   */
  async markRead(
    actor: AuthContext,
    conversationId: string,
  ): Promise<{ id: string; unreadCount: number }> {
    await this.access.assertAccess(actor, conversationId);

    const now = new Date();
    const [, updated] = await this.prisma.$transaction([
      this.prisma.message.updateMany({
        where: { conversationId, senderType: SenderType.CUSTOMER, readAt: null },
        data: { readAt: now },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { unreadCount: 0 },
        select: { id: true, unreadCount: true },
      }),
    ]);

    // The badge clearing is broadcast so the agent's other tabs — and a manager
    // watching the same queue — stop showing an unread count that is now stale.
    const refreshed = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: conversationSelect,
    });
    if (refreshed) {
      this.realtime.emitConversationChanged(toConversationDto(refreshed), 'read');
    }

    return updated;
  }

  async addTags(
    actor: AuthContext,
    conversationId: string,
    input: ConversationTagsDto,
  ): Promise<ConversationDto> {
    await this.access.assertAccess(actor, conversationId);
    await this.tags.assertTagsBelongToOrganization(actor.organizationId, input.tagIds);

    await this.prisma.conversationTag.createMany({
      data: input.tagIds.map((tagId) => ({ conversationId, tagId })),
      skipDuplicates: true,
    });

    const conversation = await this.getById(actor, conversationId);
    this.realtime.emitConversationChanged(conversation, 'tags');
    return conversation;
  }

  async removeTag(
    actor: AuthContext,
    conversationId: string,
    tagId: string,
  ): Promise<ConversationDto> {
    await this.access.assertAccess(actor, conversationId);
    await this.prisma.conversationTag.deleteMany({ where: { conversationId, tagId } });

    const conversation = await this.getById(actor, conversationId);
    this.realtime.emitConversationChanged(conversation, 'tags');
    return conversation;
  }
}
