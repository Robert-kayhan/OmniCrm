import { prisma } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/response';
import { toSkipTake } from '../../utils/pagination';
import type { AuthContext } from '../../types/auth';
import type { CreateTagInput, ListTagsQuery, UpdateTagInput } from './tag.schema';

const tagSelect = {
  id: true,
  organizationId: true,
  name: true,
  color: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { customers: true, conversations: true } },
} satisfies Prisma.TagSelect;

type TagRow = Prisma.TagGetPayload<{ select: typeof tagSelect }>;

export interface TagDto {
  id: string;
  organizationId: string;
  name: string;
  color: string;
  description: string | null;
  customerCount: number;
  conversationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function toTagDto(row: TagRow): TagDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    color: row.color,
    description: row.description,
    customerCount: row._count.customers,
    conversationCount: row._count.conversations,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Guards every place a caller supplies tag ids. Without this a user could
 * attach another tenant's tag by id, which would leak that tag's name into
 * their UI.
 */
export async function assertTagsBelongToOrganization(
  organizationId: string,
  tagIds: string[],
): Promise<void> {
  if (tagIds.length === 0) return;
  const unique = Array.from(new Set(tagIds));
  const count = await prisma.tag.count({ where: { id: { in: unique }, organizationId } });
  if (count !== unique.length) {
    throw new BadRequestError('One or more tags do not exist', 'TAG_NOT_FOUND');
  }
}

export async function listTags(organizationId: string, query: ListTagsQuery) {
  const where: Prisma.TagWhereInput = {
    organizationId,
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const { skip, take } = toSkipTake(query);

  const [rows, total] = await Promise.all([
    prisma.tag.findMany({ where, skip, take, orderBy: { name: 'asc' }, select: tagSelect }),
    prisma.tag.count({ where }),
  ]);

  return {
    items: rows.map(toTagDto),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function getTagById(organizationId: string, tagId: string): Promise<TagDto> {
  const row = await prisma.tag.findFirst({
    where: { id: tagId, organizationId },
    select: tagSelect,
  });
  if (!row) throw new NotFoundError('Tag', 'TAG_NOT_FOUND');
  return toTagDto(row);
}

export async function createTag(actor: AuthContext, input: CreateTagInput): Promise<TagDto> {
  // P2002 on (organizationId, name) is mapped to a 409 by the error handler.
  const created = await prisma.tag.create({
    data: {
      organizationId: actor.organizationId,
      name: input.name,
      color: input.color,
      description: input.description ?? null,
    },
    select: tagSelect,
  });
  return toTagDto(created);
}

export async function updateTag(
  actor: AuthContext,
  tagId: string,
  input: UpdateTagInput,
): Promise<TagDto> {
  const existing = await prisma.tag.findFirst({
    where: { id: tagId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Tag', 'TAG_NOT_FOUND');

  const updated = await prisma.tag.update({
    where: { id: tagId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
    select: tagSelect,
  });
  return toTagDto(updated);
}

export async function deleteTag(actor: AuthContext, tagId: string): Promise<void> {
  const existing = await prisma.tag.findFirst({
    where: { id: tagId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Tag', 'TAG_NOT_FOUND');
  // CustomerTag / ConversationTag links cascade.
  await prisma.tag.delete({ where: { id: tagId } });
}
