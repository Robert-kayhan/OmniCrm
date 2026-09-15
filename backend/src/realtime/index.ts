import type http from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { allowedOrigins } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../database/prisma';
import { createRedisPair } from '../database/redis';
import { PERMISSIONS } from '../config/permissions';
import { resolveAuthFromToken } from '../middleware/authenticate';
import type { AuthContext } from '../types/auth';
import type { ConversationDto } from '../modules/conversations/conversation.select';
import type { MessageDto } from '../modules/messages/message.select';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  rooms,
  type ConversationChangedPayload,
  type MessageCreatedPayload,
  type MessageUpdatedPayload,
  type NotificationPayload,
  type TypingPayload,
} from './events';

export * from './events';

/**
 * The realtime layer.
 *
 * Nothing here reaches into a module's service. Services call the small emit
 * functions at the bottom of this file, which are safe no-ops before the server
 * starts — so a unit test, a script or a worker can exercise the same service
 * code without a socket server existing.
 */

let io: SocketServer | null = null;

interface SocketData {
  auth: AuthContext;
}

type AppSocket = Socket<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>;

/**
 * Extracts the access token from the handshake.
 *
 * `auth.token` is the documented path; the Authorization header is accepted so
 * a non-browser client can reuse the same credential it sends to the REST API.
 */
function handshakeToken(socket: AppSocket): string | null {
  const fromAuth = (socket.handshake.auth as { token?: unknown })?.token;
  if (typeof fromAuth === 'string' && fromAuth.trim()) return fromAuth.trim();

  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string') {
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token?.trim()) return token.trim();
  }
  return null;
}

/**
 * Whether this socket may listen to a conversation.
 *
 * The same row-level rule the REST API applies, re-checked here rather than
 * trusted from the client: a socket asking to join a conversation id it cannot
 * see is refused, so guessing an id leaks nothing.
 */
async function canJoinConversation(auth: AuthContext, conversationId: string): Promise<boolean> {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      organizationId: auth.organizationId,
      ...(auth.permissions.has(PERMISSIONS.CONVERSATION_READ_ALL)
        ? {}
        : {
            OR: [
              { assignedUserId: auth.userId },
              { assignedTeam: { members: { some: { userId: auth.userId } } } },
              { AND: [{ assignedUserId: null }, { assignedTeamId: null }] },
            ],
          }),
    },
    select: { id: true },
  });
  return Boolean(conversation);
}

async function touchPresence(userId: string, online: boolean): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
      select: { id: true },
    });
  } catch (error) {
    // Presence is decoration. A failed write must not tear down the socket.
    logger.debug({ err: error, userId, online }, 'Failed to record presence');
  }
}

export function initRealtime(server: http.Server): SocketServer {
  const instance = new SocketServer(server, {
    path: '/socket.io',
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    // Matches the API's JSON body limit; a socket is not a file upload channel.
    maxHttpBufferSize: 1_000_000,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  /**
   * Horizontal scale. Without the adapter each API instance only reaches the
   * sockets it personally holds, so a message ingested on instance B would
   * never reach an agent connected to instance A.
   */
  const redisPair = createRedisPair();
  if (redisPair) {
    instance.adapter(createAdapter(redisPair.pubClient, redisPair.subClient));
    logger.info('Socket.IO using the Redis adapter');
  } else {
    logger.warn('Socket.IO running single-node — set REDIS_URL before scaling past one instance');
  }

  // Authentication happens once, at connect. The token is verified with the
  // same code path the REST API uses, so a deactivated user is refused here too.
  instance.use((socket, next) => {
    const token = handshakeToken(socket as AppSocket);
    if (!token) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    resolveAuthFromToken(token)
      .then((auth) => {
        (socket as AppSocket).data.auth = auth;
        next();
      })
      .catch(() => next(new Error('UNAUTHORIZED')));
  });

  instance.on('connection', (socket) => {
    const appSocket = socket as AppSocket;
    const auth = appSocket.data.auth;

    // Every socket is in its organization room and its own user room from the
    // moment it connects, so notifications and inbox updates need no join.
    void socket.join(rooms.organization(auth.organizationId));
    void socket.join(rooms.user(auth.organizationId, auth.userId));

    void touchPresence(auth.userId, true);
    instance.to(rooms.organization(auth.organizationId)).emit(SERVER_EVENTS.PRESENCE, {
      userId: auth.userId,
      online: true,
      lastSeenAt: new Date().toISOString(),
    });

    logger.debug({ userId: auth.userId, socketId: socket.id }, 'Socket connected');

    socket.on(CLIENT_EVENTS.JOIN_CONVERSATION, (conversationId: unknown) => {
      if (typeof conversationId !== 'string' || !conversationId) return;
      void canJoinConversation(auth, conversationId).then((allowed) => {
        if (allowed) void socket.join(rooms.conversation(auth.organizationId, conversationId));
      });
    });

    socket.on(CLIENT_EVENTS.LEAVE_CONVERSATION, (conversationId: unknown) => {
      if (typeof conversationId !== 'string' || !conversationId) return;
      void socket.leave(rooms.conversation(auth.organizationId, conversationId));
    });

    const emitTyping = (conversationId: unknown, isTyping: boolean) => {
      if (typeof conversationId !== 'string' || !conversationId) return;
      const room = rooms.conversation(auth.organizationId, conversationId);
      // Only sockets already in the room receive this, and joining was
      // permission-checked, so typing cannot be used to probe for ids.
      if (!socket.rooms.has(room)) return;
      const payload: TypingPayload = {
        conversationId,
        userId: auth.userId,
        name: auth.name,
        isTyping,
      };
      socket.to(room).emit(SERVER_EVENTS.TYPING, payload);
    };

    socket.on(CLIENT_EVENTS.TYPING_START, (conversationId: unknown) =>
      emitTyping(conversationId, true),
    );
    socket.on(CLIENT_EVENTS.TYPING_STOP, (conversationId: unknown) =>
      emitTyping(conversationId, false),
    );

    socket.on('disconnect', (reason) => {
      logger.debug({ userId: auth.userId, socketId: socket.id, reason }, 'Socket disconnected');
      void touchPresence(auth.userId, false);
      instance.to(rooms.organization(auth.organizationId)).emit(SERVER_EVENTS.PRESENCE, {
        userId: auth.userId,
        online: false,
        lastSeenAt: new Date().toISOString(),
      });
    });
  });

  io = instance;
  logger.info('Socket.IO initialised');
  return instance;
}

export async function closeRealtime(): Promise<void> {
  if (!io) return;
  await io.close();
  io = null;
}

export function getIo(): SocketServer | null {
  return io;
}

// --- Emit helpers ---------------------------------------------------------
//
// Every one is a no-op when the socket server has not been started, so service
// code calls them unconditionally and stays testable without a server.

export function emitMessageCreated(
  organizationId: string,
  message: MessageDto,
  conversation: ConversationDto | null,
): void {
  if (!io) return;
  const payload: MessageCreatedPayload = {
    conversationId: message.conversationId,
    message,
    conversation,
  };

  // The thread room gets the message; the organization room gets it too so an
  // agent looking at the inbox list sees the preview move without having opened
  // the conversation. Internal notes stay inside the thread room.
  io.to(rooms.conversation(organizationId, message.conversationId)).emit(
    SERVER_EVENTS.MESSAGE_CREATED,
    payload,
  );
  if (!message.isInternal) {
    io.to(rooms.organization(organizationId)).emit(SERVER_EVENTS.MESSAGE_CREATED, payload);
  }
}

export function emitMessageUpdated(organizationId: string, message: MessageDto): void {
  if (!io) return;
  const payload: MessageUpdatedPayload = {
    conversationId: message.conversationId,
    message,
  };
  io.to(rooms.conversation(organizationId, message.conversationId)).emit(
    SERVER_EVENTS.MESSAGE_UPDATED,
    payload,
  );
}

export function emitConversationChanged(
  conversation: ConversationDto,
  reason: ConversationChangedPayload['reason'],
): void {
  if (!io) return;
  const payload: ConversationChangedPayload = { conversation, reason };
  const event =
    reason === 'created' ? SERVER_EVENTS.CONVERSATION_CREATED : SERVER_EVENTS.CONVERSATION_UPDATED;
  io.to(rooms.organization(conversation.organizationId)).emit(event, payload);
}

export function emitNotification(notification: NotificationPayload): void {
  if (!io) return;
  io.to(rooms.user(notification.organizationId, notification.userId)).emit(
    SERVER_EVENTS.NOTIFICATION_CREATED,
    notification,
  );
}
