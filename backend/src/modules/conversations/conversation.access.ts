import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '../../config/permissions';
import { NotFoundError } from '../../common/errors/app.error';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthContext } from '../../types/auth';

export interface ConversationAccessRow {
  id: string;
  organizationId: string;
  customerId: string;
  customerChannelId: string | null;
  integrationId: string | null;
  channel: Prisma.ConversationGetPayload<{ select: { channel: true } }>['channel'];
  status: Prisma.ConversationGetPayload<{ select: { status: true } }>['status'];
  assignedUserId: string | null;
  assignedTeamId: string | null;
}

const accessSelect = {
  id: true,
  organizationId: true,
  customerId: true,
  customerChannelId: true,
  integrationId: true,
  channel: true,
  status: true,
  assignedUserId: true,
  assignedTeamId: true,
} satisfies Prisma.ConversationSelect;

/**
 * The row-level visibility rule, expressed as a Prisma filter so it can be
 * composed into list queries instead of being re-checked per row.
 *
 * Holders of CONVERSATION_READ_ALL (manager and above) see everything in their
 * organization. An agent sees conversations assigned to them, assigned to a
 * team they belong to, or not yet assigned — the last so an unclaimed inbound
 * message is not invisible to the people meant to answer it.
 */
export function visibilityFilter(actor: AuthContext): Prisma.ConversationWhereInput {
  if (actor.permissions.has(PERMISSIONS.CONVERSATION_READ_ALL)) {
    return { organizationId: actor.organizationId };
  }
  return {
    organizationId: actor.organizationId,
    OR: [
      { assignedUserId: actor.userId },
      { assignedTeam: { members: { some: { userId: actor.userId } } } },
      { AND: [{ assignedUserId: null }, { assignedTeamId: null }] },
    ],
  };
}

/**
 * The gate every conversation-scoped read and write goes through.
 *
 * A provider rather than a bare function so it can be injected by the message,
 * note and assignment services, which all need the same check before they touch
 * a thread.
 */
@Injectable()
export class ConversationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads a conversation the actor is allowed to see.
   *
   * Returns 404 rather than 403 when the conversation exists but is out of scope:
   * confirming existence would leak that another team is talking to that customer.
   */
  async assertAccess(
    actor: AuthContext,
    conversationId: string,
  ): Promise<ConversationAccessRow> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, ...visibilityFilter(actor) },
      select: accessSelect,
    });
    if (!conversation) {
      throw new NotFoundError('Conversation', 'CONVERSATION_NOT_FOUND');
    }
    return conversation;
  }
}
