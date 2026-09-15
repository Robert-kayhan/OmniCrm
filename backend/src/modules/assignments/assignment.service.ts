import { prisma, type Db } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { NotificationType } from '../../generated/prisma/enums';
import { BadRequestError } from '../../utils/errors';
import { emitConversationChanged } from '../../realtime';
import { recordAudit } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import type { AuthContext } from '../../types/auth';
import type { ClientContext } from '../auth/auth.service';
import { createNotification } from '../notifications/notification.service';
import { assertConversationAccess } from '../conversations/conversation.access';
import { getConversationById } from '../conversations/conversation.service';
import type { ConversationDto } from '../conversations/conversation.select';
import type { AssignConversationInput } from './assignment.schema';

const assignmentSelect = {
  id: true,
  conversationId: true,
  assignedUserId: true,
  assignedTeamId: true,
  assignedById: true,
  assignedAt: true,
  unassignedAt: true,
  assignedUser: { select: { id: true, name: true, avatar: true } },
  assignedTeam: { select: { id: true, name: true } },
  assignedBy: { select: { id: true, name: true, avatar: true } },
} satisfies Prisma.ConversationAssignmentSelect;

export type AssignmentDto = Prisma.ConversationAssignmentGetPayload<{
  select: typeof assignmentSelect;
}>;

export interface RecordAssignmentInput {
  conversationId: string;
  assignedUserId: string | null;
  assignedTeamId: string | null;
  assignedById: string | null;
}

/**
 * Appends to the assignment ledger: closes whatever period is currently open,
 * then opens a new one.
 *
 * `Conversation.assignedUserId` remains the fast path for queries; this table
 * is the history that answers "who had this, and when". Callers must pass a
 * transaction handle so the two can never disagree.
 */
export async function recordAssignment(db: Db, input: RecordAssignmentInput): Promise<void> {
  const now = new Date();

  await db.conversationAssignment.updateMany({
    where: { conversationId: input.conversationId, unassignedAt: null },
    data: { unassignedAt: now },
  });

  // Both targets null means "returned to the queue" — the closure above is the
  // whole story, so no new open period is opened.
  if (!input.assignedUserId && !input.assignedTeamId) return;

  await db.conversationAssignment.create({
    data: {
      conversationId: input.conversationId,
      assignedUserId: input.assignedUserId,
      assignedTeamId: input.assignedTeamId,
      assignedById: input.assignedById,
      assignedAt: now,
    },
  });
}

export async function listAssignmentHistory(
  actor: AuthContext,
  conversationId: string,
): Promise<AssignmentDto[]> {
  await assertConversationAccess(actor, conversationId);
  return prisma.conversationAssignment.findMany({
    where: { conversationId },
    orderBy: { assignedAt: 'desc' },
    select: assignmentSelect,
  });
}

export async function assignConversation(
  actor: AuthContext,
  conversationId: string,
  input: AssignConversationInput,
  context: ClientContext,
): Promise<ConversationDto> {
  const existing = await assertConversationAccess(actor, conversationId);

  // `undefined` means "leave as is"; an explicit null means "clear".
  const nextUserId =
    input.assignedUserId === undefined ? existing.assignedUserId : input.assignedUserId;
  const nextTeamId =
    input.assignedTeamId === undefined ? existing.assignedTeamId : input.assignedTeamId;

  if (nextUserId) {
    const user = await prisma.user.findFirst({
      where: { id: nextUserId, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!user) throw new BadRequestError('Assignee not found', 'USER_NOT_FOUND');
  }

  if (nextTeamId) {
    const team = await prisma.team.findFirst({
      where: { id: nextTeamId, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!team) throw new BadRequestError('Team not found', 'TEAM_NOT_FOUND');
  }

  const unchanged =
    nextUserId === existing.assignedUserId && nextTeamId === existing.assignedTeamId;
  if (unchanged) {
    return getConversationById(actor, conversationId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.conversation.update({
      where: { id: conversationId },
      data: { assignedUserId: nextUserId, assignedTeamId: nextTeamId },
    });
    await recordAssignment(tx, {
      conversationId,
      assignedUserId: nextUserId,
      assignedTeamId: nextTeamId,
      assignedById: actor.userId,
    });
  });

  // Notify the new owner, unless they assigned it to themselves.
  if (nextUserId && nextUserId !== actor.userId) {
    const wasReassigned = Boolean(existing.assignedUserId);
    await createNotification({
      organizationId: actor.organizationId,
      userId: nextUserId,
      conversationId,
      type: wasReassigned
        ? NotificationType.CONVERSATION_REASSIGNED
        : NotificationType.CONVERSATION_ASSIGNED,
      title: wasReassigned ? 'Conversation reassigned to you' : 'Conversation assigned to you',
      message: `${actor.name} assigned a conversation to you.`,
    });
  }

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.CONVERSATION_ASSIGNED,
    entityType: AUDIT_ENTITIES.CONVERSATION,
    entityId: conversationId,
    oldData: {
      assignedUserId: existing.assignedUserId,
      assignedTeamId: existing.assignedTeamId,
    },
    newData: { assignedUserId: nextUserId, assignedTeamId: nextTeamId },
    ...context,
  });

  const conversation = await getConversationById(actor, conversationId);
  emitConversationChanged(conversation, 'assignment');
  return conversation;
}
