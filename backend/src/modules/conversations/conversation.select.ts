import type { Prisma } from '../../generated/prisma/client';
import { fullName } from '../customers/customer.select';
import { integrationSummarySelect, tagSummarySelect } from '../customers/customer.select';

const customerSummarySelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  company: true,
  avatar: true,
  status: true,
} satisfies Prisma.CustomerSelect;

const assigneeSelect = {
  id: true,
  name: true,
  email: true,
  avatar: true,
} satisfies Prisma.UserSelect;

/** The single message shown as the list preview. */
const lastMessageSelect = {
  id: true,
  senderType: true,
  messageType: true,
  content: true,
  isInternal: true,
  status: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

export const conversationSelect = {
  id: true,
  organizationId: true,
  customerId: true,
  integrationId: true,
  customerChannelId: true,
  channel: true,
  subject: true,
  status: true,
  priority: true,
  assignedUserId: true,
  assignedTeamId: true,
  lastMessageAt: true,
  lastCustomerMessageAt: true,
  unreadCount: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: customerSummarySelect },
  customerChannel: {
    select: {
      id: true,
      channel: true,
      externalUserId: true,
      username: true,
      profileUrl: true,
      avatar: true,
    },
  },
  integration: { select: integrationSummarySelect },
  assignedUser: { select: assigneeSelect },
  assignedTeam: { select: { id: true, name: true } },
  tags: { select: { tag: { select: tagSummarySelect } } },
  _count: { select: { messages: true, notes: true } },
  messages: {
    // The preview excludes internal notes-as-messages so the list never shows
    // an agent's private text as the customer-facing last message.
    where: { isInternal: false },
    select: lastMessageSelect,
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
} satisfies Prisma.ConversationSelect;

export type ConversationRow = Prisma.ConversationGetPayload<{ select: typeof conversationSelect }>;
export type LastMessageRow = Prisma.MessageGetPayload<{ select: typeof lastMessageSelect }>;

export interface ConversationDto {
  id: string;
  organizationId: string;
  customerId: string;
  integrationId: string | null;
  customerChannelId: string | null;
  channel: ConversationRow['channel'];
  subject: string | null;
  status: ConversationRow['status'];
  priority: ConversationRow['priority'];
  customer: ConversationRow['customer'] & { fullName: string };
  customerChannel: ConversationRow['customerChannel'];
  integration: ConversationRow['integration'];
  assignedUser: ConversationRow['assignedUser'];
  assignedTeam: ConversationRow['assignedTeam'];
  tags: { id: string; name: string; color: string }[];
  lastMessage: LastMessageRow | null;
  messageCount: number;
  noteCount: number;
  unreadCount: number;
  lastMessageAt: Date | null;
  lastCustomerMessageAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toConversationDto(row: ConversationRow): ConversationDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    customerId: row.customerId,
    integrationId: row.integrationId,
    customerChannelId: row.customerChannelId,
    channel: row.channel,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    customer: {
      ...row.customer,
      fullName: fullName(row.customer.firstName, row.customer.lastName),
    },
    customerChannel: row.customerChannel,
    integration: row.integration,
    assignedUser: row.assignedUser,
    assignedTeam: row.assignedTeam,
    tags: row.tags.map((link) => link.tag),
    lastMessage: row.messages[0] ?? null,
    messageCount: row._count.messages,
    noteCount: row._count.notes,
    unreadCount: row.unreadCount,
    lastMessageAt: row.lastMessageAt,
    lastCustomerMessageAt: row.lastCustomerMessageAt,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
