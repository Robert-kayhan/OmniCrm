import { prisma } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/response';
import { toSkipTake } from '../../utils/pagination';
import { PERMISSIONS } from '../../config/permissions';
import type { AuthContext } from '../../types/auth';
import { assertCustomerExists } from '../customers/customer.service';
import type { CreateNoteInput, ListNotesQuery } from './note.schema';

/**
 * Notes are internal by construction: they live in their own table and are
 * never read by the outbound message path, so there is no code route by which
 * one could reach Facebook, Instagram or a customer's inbox.
 */
const noteSelect = {
  id: true,
  organizationId: true,
  customerId: true,
  conversationId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, avatar: true, role: true } },
} satisfies Prisma.NoteSelect;

export type NoteDto = Prisma.NoteGetPayload<{ select: typeof noteSelect }>;

async function listNotes(where: Prisma.NoteWhereInput, query: ListNotesQuery) {
  const { skip, take } = toSkipTake(query);
  const [items, total] = await Promise.all([
    prisma.note.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: noteSelect,
    }),
    prisma.note.count({ where }),
  ]);
  return { items, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function listCustomerNotes(
  organizationId: string,
  customerId: string,
  query: ListNotesQuery,
) {
  await assertCustomerExists(organizationId, customerId);
  return listNotes({ organizationId, customerId }, query);
}

export async function listConversationNotes(
  organizationId: string,
  conversationId: string,
  query: ListNotesQuery,
) {
  return listNotes({ organizationId, conversationId }, query);
}

export async function createCustomerNote(
  actor: AuthContext,
  customerId: string,
  input: CreateNoteInput,
): Promise<NoteDto> {
  await assertCustomerExists(actor.organizationId, customerId);
  return prisma.note.create({
    data: {
      organizationId: actor.organizationId,
      userId: actor.userId,
      customerId,
      content: input.content,
    },
    select: noteSelect,
  });
}

export async function createConversationNote(
  actor: AuthContext,
  conversationId: string,
  customerId: string | null,
  input: CreateNoteInput,
): Promise<NoteDto> {
  return prisma.note.create({
    data: {
      organizationId: actor.organizationId,
      userId: actor.userId,
      conversationId,
      customerId,
      content: input.content,
    },
    select: noteSelect,
  });
}

/**
 * An author may always delete their own note. Deleting someone else's requires
 * NOTE_DELETE, which managers and above hold.
 */
export async function deleteNote(actor: AuthContext, noteId: string): Promise<void> {
  const existing = await prisma.note.findFirst({
    where: { id: noteId, organizationId: actor.organizationId },
    select: { id: true, userId: true },
  });
  if (!existing) throw new NotFoundError('Note', 'NOTE_NOT_FOUND');

  const isAuthor = existing.userId === actor.userId;
  if (!isAuthor && !actor.permissions.has(PERMISSIONS.NOTE_DELETE)) {
    throw new ForbiddenError('You can only delete your own notes', 'NOTE_NOT_OWNED');
  }

  await prisma.note.delete({ where: { id: noteId } });
}
