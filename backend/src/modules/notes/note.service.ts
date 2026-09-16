import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '../../config/permissions';
import { toSkipTake } from '../../common/dto/pagination.dto';
import { ForbiddenError, NotFoundError } from '../../common/errors/app.error';
import { buildPaginationMeta } from '../../common/http/api-response';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthContext } from '../../types/auth';
import { CustomerService } from '../customers/customer.service';
import type { CreateNoteDto, ListNotesQueryDto } from './dto/note.dto';

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

@Injectable()
export class NoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomerService,
  ) {}

  private async listWhere(where: Prisma.NoteWhereInput, query: ListNotesQueryDto) {
    const { skip, take } = toSkipTake(query);
    const [items, total] = await Promise.all([
      this.prisma.note.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: noteSelect,
      }),
      this.prisma.note.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(query.page, query.limit, total) };
  }

  async listForCustomer(organizationId: string, customerId: string, query: ListNotesQueryDto) {
    await this.customers.assertExists(organizationId, customerId);
    return this.listWhere({ organizationId, customerId }, query);
  }

  async listForConversation(
    organizationId: string,
    conversationId: string,
    query: ListNotesQueryDto,
  ) {
    return this.listWhere({ organizationId, conversationId }, query);
  }

  async createForCustomer(
    actor: AuthContext,
    customerId: string,
    input: CreateNoteDto,
  ): Promise<NoteDto> {
    await this.customers.assertExists(actor.organizationId, customerId);
    return this.prisma.note.create({
      data: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        customerId,
        content: input.content,
      },
      select: noteSelect,
    });
  }

  async createForConversation(
    actor: AuthContext,
    conversationId: string,
    customerId: string | null,
    input: CreateNoteDto,
  ): Promise<NoteDto> {
    return this.prisma.note.create({
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
  async remove(actor: AuthContext, noteId: string): Promise<void> {
    const existing = await this.prisma.note.findFirst({
      where: { id: noteId, organizationId: actor.organizationId },
      select: { id: true, userId: true },
    });
    if (!existing) throw new NotFoundError('Note', 'NOTE_NOT_FOUND');

    const isAuthor = existing.userId === actor.userId;
    if (!isAuthor && !actor.permissions.has(PERMISSIONS.NOTE_DELETE)) {
      throw new ForbiddenError('You can only delete your own notes', 'NOTE_NOT_OWNED');
    }

    await this.prisma.note.delete({ where: { id: noteId } });
  }
}
