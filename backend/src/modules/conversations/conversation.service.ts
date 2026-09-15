import { prisma } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { Channel, ConversationStatus, SenderType } from '../../generated/prisma/enums';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/response';
import { toSkipTake } from '../../utils/pagination';
import { emitConversationChanged } from '../../realtime';
import { recordAudit } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import type { AuthContext } from '../../types/auth';
import type { ClientContext } from '../auth/auth.service';
import { assertTagsBelongToOrganization } from '../tags/tag.service';
import { assertCustomerExists } from '../customers/customer.service';
import { recordAssignment } from '../assignments/assignment.service';
import { assertConversationAccess, visibilityFilter } from './conversation.access';
import { conversationSelect, toConversationDto, type ConversationDto } from './conversation.select';
import type {
  ConversationTagsInput,
  CreateConversationInput,
  ListConversationsQuery,
  UpdatePriorityInput,
  UpdateStatusInput,
} from './conversation.schema';

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
  query: ListConversationsQuery,
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
  query: ListConversationsQuery,
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
  sort: ListConversationsQuery['sort'],
): Prisma.ConversationOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ lastMessageAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }];
    case 'priority':
      // Enum order in the schema is LOW < NORMAL < HIGH < URGENT, so descending
      // puts URGENT first.
      return [
        { priority: 'desc' },
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      ];
    case 'recent':
    default:
      // `nulls: 'last'` is explicit because Postgres would otherwise float a
      // conversation with no activity to the top of the inbox.
      return [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];
  }
}

export async function listConversations(actor: AuthContext, query: ListConversationsQuery) {
  const where = buildWhere(actor, query);
  const { skip, take } = toSkipTake(query);

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      skip,
      take,
      orderBy: buildOrderBy(query.sort),
      select: conversationSelect,
    }),
    prisma.conversation.count({ where }),
  ]);

  return {
    items: rows.map(toConversationDto),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function getConversationById(
  actor: AuthContext,
  conversationId: string,
): Promise<ConversationDto> {
  await assertConversationAccess(actor, conversationId);
  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: conversationSelect,
  });
  if (!row) throw new NotFoundError('Conversation', 'CONVERSATION_NOT_FOUND');
  return toConversationDto(row);
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

/**
 * Aggregate counters for the inbox header and dashboard, as grouped counts
 * rather than one query per bucket.
 */
export async function getConversationStats(actor: AuthContext) {
  const scope = visibilityFilter(actor);

  const [byStatus, byChannel, byPriority, unreadAggregate, assignedToMe] = await Promise.all([
    prisma.conversation.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
    prisma.conversation.groupBy({ by: ['channel'], where: scope, _count: { _all: true } }),
    prisma.conversation.groupBy({ by: ['priority'], where: scope, _count: { _all: true } }),
    prisma.conversation.aggregate({ where: scope, _sum: { unreadCount: true } }),
    prisma.conversation.count({
      where: { ...scope, assignedUserId: actor.userId, status: { not: ConversationStatus.CLOSED } },
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
async function assertCreateReferences(
  actor: AuthContext,
  input: CreateConversationInput,
): Promise<void> {
  await assertCustomerExists(actor.organizationId, input.customerId);

  if (input.integrationId) {
    const integration = await prisma.integration.findFirst({
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
    const channel = await prisma.customerChannel.findFirst({
      where: { id: input.customerChannelId, customerId: input.customerId },
      select: { id: true },
    });
    if (!channel) {
      throw new BadRequestError('Customer channel not found', 'CUSTOMER_CHANNEL_NOT_FOUND');
    }
  }

  if (input.assignedUserId) {
    const user = await prisma.user.findFirst({
      where: { id: input.assignedUserId, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!user) throw new BadRequestError('Assignee not found', 'USER_NOT_FOUND');
  }

  if (input.assignedTeamId) {
    const team = await prisma.team.findFirst({
      where: { id: input.assignedTeamId, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!team) throw new BadRequestError('Team not found', 'TEAM_NOT_FOUND');
  }
}

export async function createConversation(
  actor: AuthContext,
  input: CreateConversationInput,
  context: ClientContext,
): Promise<ConversationDto> {
  await assertCreateReferences(actor, input);

  const created = await prisma.$transaction(async (tx) => {
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
      await recordAssignment(tx, {
        conversationId: conversation.id,
        assignedUserId: input.assignedUserId ?? null,
        assignedTeamId: input.assignedTeamId ?? null,
        assignedById: actor.userId,
      });
    }

    return conversation;
  });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.CONVERSATION_CREATED,
    entityType: AUDIT_ENTITIES.CONVERSATION,
    entityId: created.id,
    newData: { customerId: input.customerId, channel: input.channel },
    ...context,
  });

  const conversation = await getConversationById(actor, created.id);
  emitConversationChanged(conversation, 'created');
  return conversation;
}

export async function updateStatus(
  actor: AuthContext,
  conversationId: string,
  input: UpdateStatusInput,
  context: ClientContext,
): Promise<ConversationDto> {
  const existing = await assertConversationAccess(actor, conversationId);
  if (existing.status === input.status) {
    return getConversationById(actor, conversationId);
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: input.status,
      // Reopening clears the closure stamp so time-to-close stays meaningful.
      closedAt: input.status === ConversationStatus.CLOSED ? new Date() : null,
    },
  });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.CONVERSATION_STATUS_CHANGED,
    entityType: AUDIT_ENTITIES.CONVERSATION,
    entityId: conversationId,
    oldData: { status: existing.status },
    newData: { status: input.status },
    ...context,
  });

  const conversation = await getConversationById(actor, conversationId);
  emitConversationChanged(conversation, 'status');
  return conversation;
}

export async function updatePriority(
  actor: AuthContext,
  conversationId: string,
  input: UpdatePriorityInput,
  context: ClientContext,
): Promise<ConversationDto> {
  await assertConversationAccess(actor, conversationId);

  const before = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { priority: true },
  });
  if (before?.priority === input.priority) {
    return getConversationById(actor, conversationId);
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { priority: input.priority },
  });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.CONVERSATION_PRIORITY_CHANGED,
    entityType: AUDIT_ENTITIES.CONVERSATION,
    entityId: conversationId,
    oldData: { priority: before?.priority ?? null },
    newData: { priority: input.priority },
    ...context,
  });

  const conversation = await getConversationById(actor, conversationId);
  emitConversationChanged(conversation, 'priority');
  return conversation;
}

/**
 * Clears the unread badge and stamps read receipts on the customer's messages.
 * Idempotent: reopening an already-read conversation writes nothing new.
 */
export async function markConversationRead(
  actor: AuthContext,
  conversationId: string,
): Promise<{ id: string; unreadCount: number }> {
  await assertConversationAccess(actor, conversationId);

  const now = new Date();
  const [, updated] = await prisma.$transaction([
    prisma.message.updateMany({
      where: { conversationId, senderType: SenderType.CUSTOMER, readAt: null },
      data: { readAt: now },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
      select: { id: true, unreadCount: true },
    }),
  ]);

  // The badge clearing is broadcast so the agent's other tabs — and a manager
  // watching the same queue — stop showing an unread count that is now stale.
  const refreshed = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: conversationSelect,
  });
  if (refreshed) emitConversationChanged(toConversationDto(refreshed), 'read');

  return updated;
}

export async function addConversationTags(
  actor: AuthContext,
  conversationId: string,
  input: ConversationTagsInput,
): Promise<ConversationDto> {
  await assertConversationAccess(actor, conversationId);
  await assertTagsBelongToOrganization(actor.organizationId, input.tagIds);

  await prisma.conversationTag.createMany({
    data: input.tagIds.map((tagId) => ({ conversationId, tagId })),
    skipDuplicates: true,
  });

  const conversation = await getConversationById(actor, conversationId);
  emitConversationChanged(conversation, 'tags');
  return conversation;
}

export async function removeConversationTag(
  actor: AuthContext,
  conversationId: string,
  tagId: string,
): Promise<ConversationDto> {
  await assertConversationAccess(actor, conversationId);
  await prisma.conversationTag.deleteMany({ where: { conversationId, tagId } });

  const conversation = await getConversationById(actor, conversationId);
  emitConversationChanged(conversation, 'tags');
  return conversation;
}
