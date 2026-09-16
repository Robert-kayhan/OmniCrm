import { Injectable } from '@nestjs/common';
import type { ClientContext } from '../../common/decorators/client-context.decorator';
import { toSkipTake } from '../../common/dto/pagination.dto';
import { ConflictError, NotFoundError } from '../../common/errors/app.error';
import { buildPaginationMeta } from '../../common/http/api-response';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthContext } from '../../types/auth';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import { TagService } from '../tags/tag.service';
import { customerSelect, toCustomerDto, type CustomerDto } from './customer.select';
import type {
  CreateCustomerDto,
  CustomerTagsDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

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

function buildWhere(
  organizationId: string,
  query: ListCustomersQueryDto,
): Prisma.CustomerWhereInput {
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

function buildOrderBy(
  sort: ListCustomersQueryDto['sort'],
): Prisma.CustomerOrderByWithRelationInput[] {
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

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tags: TagService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async list(organizationId: string, query: ListCustomersQueryDto) {
    const where = buildWhere(organizationId, query);
    const { skip, take } = toSkipTake(query);

    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sort),
        select: customerSelect,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items: rows.map(toCustomerDto),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async getById(organizationId: string, customerId: string): Promise<CustomerDto> {
    const row = await this.prisma.customer.findFirst({
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
  private async assertEmailAvailable(
    organizationId: string,
    email: string | null | undefined,
    excludeCustomerId?: string,
  ): Promise<void> {
    if (!email) return;
    const existing = await this.prisma.customer.findFirst({
      where: {
        organizationId,
        email,
        ...(excludeCustomerId ? { NOT: { id: excludeCustomerId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError(
        'A customer with this email already exists',
        'CUSTOMER_EMAIL_EXISTS',
        { customerId: existing.id },
      );
    }
  }

  async create(
    actor: AuthContext,
    input: CreateCustomerDto,
    context: ClientContext,
  ): Promise<CustomerDto> {
    await this.assertEmailAvailable(actor.organizationId, input.email);

    const tagIds = input.tagIds ?? [];
    if (tagIds.length > 0) {
      await this.tags.assertTagsBelongToOrganization(actor.organizationId, tagIds);
    }

    const created = await this.prisma.customer.create({
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

    await this.auditLogs.record({
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

  async update(
    actor: AuthContext,
    customerId: string,
    input: UpdateCustomerDto,
    context: ClientContext,
  ): Promise<CustomerDto> {
    const existing = await this.prisma.customer.findFirst({
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
      await this.assertEmailAvailable(actor.organizationId, input.email, customerId);
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

    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data,
      select: customerSelect,
    });

    await this.auditLogs.record({
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

  async remove(actor: AuthContext, customerId: string, context: ClientContext): Promise<void> {
    const existing = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId: actor.organizationId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!existing) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND');

    // Conversations, messages, channels and notes cascade with the customer.
    await this.prisma.customer.delete({ where: { id: customerId } });

    await this.auditLogs.record({
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
  async assertExists(organizationId: string, customerId: string): Promise<void> {
    const found = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true },
    });
    if (!found) throw new NotFoundError('Customer', 'CUSTOMER_NOT_FOUND');
  }

  async addTags(
    actor: AuthContext,
    customerId: string,
    input: CustomerTagsDto,
  ): Promise<CustomerDto> {
    await this.assertExists(actor.organizationId, customerId);
    await this.tags.assertTagsBelongToOrganization(actor.organizationId, input.tagIds);

    await this.prisma.customerTag.createMany({
      data: input.tagIds.map((tagId) => ({ customerId, tagId })),
      skipDuplicates: true,
    });

    return this.getById(actor.organizationId, customerId);
  }

  async removeTag(
    actor: AuthContext,
    customerId: string,
    tagId: string,
  ): Promise<CustomerDto> {
    await this.assertExists(actor.organizationId, customerId);
    await this.prisma.customerTag.deleteMany({ where: { customerId, tagId } });
    return this.getById(actor.organizationId, customerId);
  }
}
