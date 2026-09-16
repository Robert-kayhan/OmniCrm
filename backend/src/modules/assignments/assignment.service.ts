import { Injectable } from '@nestjs/common';
import type { ClientContext } from '../../common/decorators/client-context.decorator';
import { BadRequestError } from '../../common/errors/app.error';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { NotificationType } from '../../generated/prisma/enums';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import type { AuthContext } from '../../types/auth';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import { ConversationAccessService } from '../conversations/conversation.access';
import { ConversationService } from '../conversations/conversation.service';
import type { ConversationDto } from '../conversations/conversation.select';
import { NotificationService } from '../notifications/notification.service';
import { AssignmentLedgerService } from './assignment-ledger.service';
import type { AssignConversationDto } from './dto/assign-conversation.dto';

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

@Injectable()
export class AssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConversationAccessService,
    private readonly conversations: ConversationService,
    private readonly ledger: AssignmentLedgerService,
    private readonly notifications: NotificationService,
    private readonly auditLogs: AuditLogService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async listHistory(
    actor: AuthContext,
    conversationId: string,
  ): Promise<AssignmentDto[]> {
    await this.access.assertAccess(actor, conversationId);
    return this.prisma.conversationAssignment.findMany({
      where: { conversationId },
      orderBy: { assignedAt: 'desc' },
      select: assignmentSelect,
    });
  }

  async assign(
    actor: AuthContext,
    conversationId: string,
    input: AssignConversationDto,
    context: ClientContext,
  ): Promise<ConversationDto> {
    const existing = await this.access.assertAccess(actor, conversationId);

    // `undefined` means "leave as is"; an explicit null means "clear".
    const nextUserId =
      input.assignedUserId === undefined ? existing.assignedUserId : input.assignedUserId;
    const nextTeamId =
      input.assignedTeamId === undefined ? existing.assignedTeamId : input.assignedTeamId;

    if (nextUserId) {
      const user = await this.prisma.user.findFirst({
        where: { id: nextUserId, organizationId: actor.organizationId },
        select: { id: true },
      });
      if (!user) throw new BadRequestError('Assignee not found', 'USER_NOT_FOUND');
    }

    if (nextTeamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: nextTeamId, organizationId: actor.organizationId },
        select: { id: true },
      });
      if (!team) throw new BadRequestError('Team not found', 'TEAM_NOT_FOUND');
    }

    const unchanged =
      nextUserId === existing.assignedUserId && nextTeamId === existing.assignedTeamId;
    if (unchanged) {
      return this.conversations.getById(actor, conversationId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.conversation.update({
        where: { id: conversationId },
        data: { assignedUserId: nextUserId, assignedTeamId: nextTeamId },
      });
      await this.ledger.record(tx, {
        conversationId,
        assignedUserId: nextUserId,
        assignedTeamId: nextTeamId,
        assignedById: actor.userId,
      });
    });

    // Notify the new owner, unless they assigned it to themselves.
    if (nextUserId && nextUserId !== actor.userId) {
      const wasReassigned = Boolean(existing.assignedUserId);
      await this.notifications.create({
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

    await this.auditLogs.record({
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

    const conversation = await this.conversations.getById(actor, conversationId);
    this.realtime.emitConversationChanged(conversation, 'assignment');
    return conversation;
  }
}
