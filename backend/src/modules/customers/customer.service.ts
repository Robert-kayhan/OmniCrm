import { prisma } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/response';
import { toSkipTake } from '../../utils/pagination';
import { recordAudit } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import type { AuthContext } from '../../types/auth';
import type { ClientContext } from '../auth/auth.service';
import { assertTagsBelongToOrganization } from '../tags/tag.service';
import { customerSelect, toCustomerDto, type CustomerDto } from './customer.select';
import type {
  CreateCustomerInput,
  CustomerTagsInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from './customer.schema';

/**
 * Free-text search across the fields an agent would actually type. Postgres
 * ILIKE via `mode: 'insensitive'`; the supporting indexes are on
 * (organizationId, email) and (organizationId, phone).
 */
function searchFilter(search: string): Prisma.CustomerWhereInput {
  const term = search.trim();
  return {
    OR: [
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term, mode: 'insensitive' } },
      { company: { contains: term, mode: 'insensitive' } },
      { channels: { some: { username: { contains: term, mode: 'insensitive' } } } },
    ],
  };
}

function buildWhere(organizationId: string, query: ListCustomersQuery): Prisma.CustomerWhereInput {
  return {
    // Tenant scope is applied here and is never taken from the request.
    organizationId,
    ...(query.search ? searchFilter(query.search) : {}),
    ...(query.status?.length ? { status: { in: query.status } } : {}),
    ...(query.source?.length ? { source: { in: query.source } } : {}),
    ...(query.channel?.length ? { channels: { some: { channel: { in: query.channel } } } } : {}),
    ...(query.tagIds?.length ? { tags: { some: { tagId: { in: query.tagIds } } } } : {}),
    ...(query.assignedUserId
      ? { conversations: { some: { assignedUserId: query.assignedUserId } } }
      : {}),
  };
}

function buildOrderBy(sort: ListCustomersQuery['sort']): Prisma.CustomerOrderByWithRelationInput[] {
  switch (sort) {
    case 'name':
      return [{ firstName: 'asc' }, { lastName: 'asc' }];
    case 'created':
      return [{ createdAt: 'desc' }];
    case 'recent':
    default:
      return [{ updatedAt: 'desc' }];
  }
}

export async function listCustomers(organizationId: string, query: ListCustomersQuery) {
  const where = buildWhere(organizationId, query);
  const { skip, take } = toSkipTake(query);

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take,
      orderBy: buildOrderBy(query.sort),
      select: customerSelect,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    items: rows.map(toCustomerDto),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function getCustomerById(
  organizationId: string,
  customerId: string,
): Promise<CustomerDto> {
  const row = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: customerSelect,
  });
  if (!row) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND');
  return toCustomerDto(row);
}

/**
 * Email is not unique on the model — the same person can legitimately exist
 * twice while merge tooling is pending — but a same-tenant duplicate is almost
 * always a mistake, so it is rejected at the API boundary.
 */
async function assertEmailAvailable(
  organizationId: string,
  email: string | null | undefined,
  excludeCustomerId?: string,
): Promise<void> {
  if (!email) return;
  const existing = await prisma.customer.findFirst({
    where: {
      organizationId,
      email,
      ...(excludeCustomerId ? { NOT: { id: excludeCustomerId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError('A customer with this email already exists', 'CUSTOMER_EMAIL_EXISTS', {
      customerId: existing.id,
    });
  }
}

export async function createCustomer(
  actor: AuthContext,
  input: CreateCustomerInput,
  context: ClientContext,
): Promise<CustomerDto> {
  await assertEmailAvailable(actor.organizationId, input.email);

  const tagIds = input.tagIds ?? [];
  if (tagIds.length > 0) {
    await assertTagsBelongToOrganization(actor.organizationId, tagIds);
  }

  const created = await prisma.customer.create({
    data: {
      organizationId: actor.organizationId,
      firstName: input.firstName,
      lastName: input.lastName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      company: input.company ?? null,
      avatar: input.avatar ?? null,
      location: input.location ?? null,
      status: input.status,
      source: input.source,
      ...(tagIds.length > 0 ? { tags: { create: tagIds.map((tagId) => ({ tagId })) } } : {}),
    },
    select: customerSelect,
  });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.CUSTOMER_CREATED,
    entityType: AUDIT_ENTITIES.CUSTOMER,
    entityId: created.id,
    newData: {
      firstName: created.firstName,
      lastName: created.lastName,
      email: created.email,
      status: created.status,
      source: created.source,
    },
    ...context,
  });

  return toCustomerDto(created);
}

export async function updateCustomer(
  actor: AuthContext,
  customerId: string,
  input: UpdateCustomerInput,
  context: ClientContext,
): Promise<CustomerDto> {
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: actor.organizationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      company: true,
      location: true,
      status: true,
      source: true,
    },
  });
  if (!existing) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND');

  if (input.email !== undefined) {
    await assertEmailAvailable(actor.organizationId, input.email, customerId);
  }

  const data: Prisma.CustomerUpdateInput = {};
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.email !== undefined) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.company !== undefined) data.company = input.company;
  if (input.avatar !== undefined) data.avatar = input.avatar;
  if (input.location !== undefined) data.location = input.location;
  if (input.status !== undefined) data.status = input.status;
  if (input.source !== undefined) data.source = input.source;

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data,
    select: customerSelect,
  });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.CUSTOMER_UPDATED,
    entityType: AUDIT_ENTITIES.CUSTOMER,
    entityId: customerId,
    oldData: existing,
    newData: data,
    ...context,
  });

  return toCustomerDto(updated);
}

export async function deleteCustomer(
  actor: AuthContext,
  customerId: string,
  context: ClientContext,
): Promise<void> {
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: actor.organizationId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!existing) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND');

  // Conversations, messages, channels and notes cascade with the customer.
  await prisma.customer.delete({ where: { id: customerId } });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.CUSTOMER_DELETED,
    entityType: AUDIT_ENTITIES.CUSTOMER,
    entityId: customerId,
    oldData: existing,
    ...context,
  });
}

/** Cheap existence + tenant check used before writes on child collections. */
export async function assertCustomerExists(
  organizationId: string,
  customerId: string,
): Promise<void> {
  const found = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND');
}

export async function addCustomerTags(
  actor: AuthContext,
  customerId: string,
  input: CustomerTagsInput,
): Promise<CustomerDto> {
  await assertCustomerExists(actor.organizationId, customerId);
  await assertTagsBelongToOrganization(actor.organizationId, input.tagIds);

  await prisma.customerTag.createMany({
    data: input.tagIds.map((tagId) => ({ customerId, tagId })),
    skipDuplicates: true,
  });

  return getCustomerById(actor.organizationId, customerId);
}

export async function removeCustomerTag(
  actor: AuthContext,
  customerId: string,
  tagId: string,
): Promise<CustomerDto> {
  await assertCustomerExists(actor.organizationId, customerId);
  await prisma.customerTag.deleteMany({ where: { customerId, tagId } });
  return getCustomerById(actor.organizationId, customerId);
}
