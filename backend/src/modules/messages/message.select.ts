import type { Prisma } from '../../generated/prisma/client';

export const messageSelect = {
  id: true,
  conversationId: true,
  organizationId: true,
  senderType: true,
  senderUserId: true,
  externalMessageId: true,
  messageType: true,
  content: true,
  isInternal: true,
  status: true,
  failureReason: true,
  deliveredAt: true,
  readAt: true,
  createdAt: true,
  updatedAt: true,
  sender: { select: { id: true, name: true, avatar: true, role: true } },
  attachments: {
    select: {
      id: true,
      type: true,
      url: true,
      name: true,
      mimeType: true,
      size: true,
    },
  },
} satisfies Prisma.MessageSelect;

export type MessageDto = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;
