import type { Prisma } from '../../generated/prisma/client';

/** Integration fields that are safe to expose — never the token columns. */
export const integrationSummarySelect = {
  id: true,
  type: true,
  name: true,
  status: true,
} satisfies Prisma.IntegrationSelect;

export const customerChannelSelect = {
  id: true,
  customerId: true,
  channel: true,
  externalUserId: true,
  username: true,
  profileUrl: true,
  avatar: true,
  createdAt: true,
  updatedAt: true,
  integration: { select: integrationSummarySelect },
} satisfies Prisma.CustomerChannelSelect;

export const tagSummarySelect = {
  id: true,
  name: true,
  color: true,
} satisfies Prisma.TagSelect;

/**
 * One shape for both list and detail. The `take: 1` conversation is what powers
 * the "Last contact" and "Assigned" columns without a second round trip.
 */
export const customerSelect = {
  id: true,
  organizationId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  company: true,
  avatar: true,
  location: true,
  status: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  channels: { select: customerChannelSelect, orderBy: { createdAt: 'asc' } },
  tags: { select: { tag: { select: tagSummarySelect } } },
  _count: { select: { conversations: true } },
  conversations: {
    select: {
      id: true,
      channel: true,
      status: true,
      lastMessageAt: true,
      assignedUser: { select: { id: true, name: true, avatar: true } },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 1,
  },
} satisfies Prisma.CustomerSelect;

export type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;
export type CustomerChannelRow = Prisma.CustomerChannelGetPayload<{
  select: typeof customerChannelSelect;
}>;

export interface CustomerDto {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  avatar: string | null;
  location: string | null;
  status: CustomerRow['status'];
  source: CustomerRow['source'];
  channels: CustomerChannelRow[];
  tags: { id: string; name: string; color: string }[];
  conversationCount: number;
  lastContactAt: Date | null;
  lastConversationId: string | null;
  assignedUser: { id: string; name: string; avatar: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
}

export function fullName(firstName: string, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ');
}

export function toCustomerDto(row: CustomerRow): CustomerDto {
  const latest = row.conversations[0] ?? null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: fullName(row.firstName, row.lastName),
    email: row.email,
    phone: row.phone,
    company: row.company,
    avatar: row.avatar,
    location: row.location,
    status: row.status,
    source: row.source,
    channels: row.channels,
    tags: row.tags.map((link) => link.tag),
    conversationCount: row._count.conversations,
    lastContactAt: latest?.lastMessageAt ?? null,
    lastConversationId: latest?.id ?? null,
    assignedUser: latest?.assignedUser ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
