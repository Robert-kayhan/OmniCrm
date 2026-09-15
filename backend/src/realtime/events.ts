import type { ConversationDto } from '../modules/conversations/conversation.select';
import type { MessageDto } from '../modules/messages/message.select';
import type { NotificationDto } from '../modules/notifications/notification.service';

/**
 * The realtime contract.
 *
 * These names and payloads are the only thing the frontend socket client knows
 * about, so they live in one file rather than as string literals at each emit
 * site. Payloads reuse the REST DTOs verbatim: a conversation that arrives over
 * the socket is byte-identical to one fetched over HTTP, which is what lets the
 * client merge them into the same cache without a translation layer.
 */

export const SERVER_EVENTS = {
  MESSAGE_CREATED: 'message:created',
  MESSAGE_UPDATED: 'message:updated',
  CONVERSATION_CREATED: 'conversation:created',
  CONVERSATION_UPDATED: 'conversation:updated',
  NOTIFICATION_CREATED: 'notification:created',
  TYPING: 'conversation:typing',
  PRESENCE: 'presence:updated',
} as const;

export const CLIENT_EVENTS = {
  JOIN_CONVERSATION: 'conversation:join',
  LEAVE_CONVERSATION: 'conversation:leave',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
} as const;

export interface MessageCreatedPayload {
  conversationId: string;
  message: MessageDto;
  /** Sent alongside so the inbox list can update its preview in one round trip. */
  conversation: ConversationDto | null;
}

export interface MessageUpdatedPayload {
  conversationId: string;
  message: MessageDto;
}

export interface ConversationChangedPayload {
  conversation: ConversationDto;
  /** What moved, so a client can decide whether it cares. */
  reason:
    | 'created'
    | 'message'
    | 'status'
    | 'priority'
    | 'assignment'
    | 'read'
    | 'tags';
}

export interface TypingPayload {
  conversationId: string;
  userId: string;
  name: string;
  isTyping: boolean;
}

export interface PresencePayload {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
}

export type NotificationPayload = NotificationDto;

/**
 * Room naming.
 *
 * Every room is prefixed with the organization id. A socket is only ever joined
 * to rooms built from its own verified token, so a payload cannot reach another
 * tenant even if a room name is guessed.
 */
export const rooms = {
  organization: (organizationId: string) => `org:${organizationId}`,
  user: (organizationId: string, userId: string) => `org:${organizationId}:user:${userId}`,
  conversation: (organizationId: string, conversationId: string) =>
    `org:${organizationId}:conversation:${conversationId}`,
};
