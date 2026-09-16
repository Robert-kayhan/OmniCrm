import { Injectable } from '@nestjs/common';
import type { Db } from '../../database/prisma.service';

export interface RecordAssignmentInput {
  conversationId: string;
  assignedUserId: string | null;
  assignedTeamId: string | null;
  assignedById: string | null;
}

/**
 * The assignment ledger, split out from the assignment feature service.
 *
 * Creating a conversation with an owner has to write the first ledger entry,
 * and reassigning one has to read the conversation back — so the two would form
 * a dependency cycle if they lived together. This half has no dependencies of
 * its own and can be used from either side.
 */
@Injectable()
export class AssignmentLedgerService {
  /**
   * Appends to the ledger: closes whatever period is currently open, then opens
   * a new one.
   *
   * `Conversation.assignedUserId` remains the fast path for queries; this table
   * is the history that answers "who had this, and when". Callers pass a
   * transaction handle so the two can never disagree.
   */
  async record(db: Db, input: RecordAssignmentInput): Promise<void> {
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
}
