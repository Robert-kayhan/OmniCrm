import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server, type Socket } from 'socket.io';
import { AuthContextService } from '../common/auth/auth-context.service';
import { allowedOrigins } from '../config/env';
import { PERMISSIONS } from '../config/permissions';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../database/redis.service';
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

interface SocketData {
  auth: AuthContext;
}

type AppSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

/**
 * The realtime layer.
 *
 * Nothing here reaches into a module's service. Services inject this gateway
 * and call the emit methods at the bottom, which are safe no-ops before the
 * socket server is attached — so a unit test, a script or a worker can exercise
 * the same service code without a socket server existing.
 */
@WebSocketGateway({
  path: '/socket.io',
  // The same origin list the HTTP side allows. Read from the validated
  // environment rather than injected, because a decorator is evaluated at class
  // definition time, before the DI container exists.
  cors: { origin: allowedOrigins, credentials: true },
  // Matches the API's JSON body limit; a socket is not a file upload channel.
  maxHttpBufferSize: 1_000_000,
  pingInterval: 25_000,
  pingTimeout: 20_000,
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private readonly server?: Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly authContext: AuthContextService,
  ) {}

  afterInit(server: Server): void {
    /**
     * Horizontal scale. Without the adapter each API instance only reaches the
     * sockets it personally holds, so a message ingested on instance B would
     * never reach an agent connected to instance A.
     */
    const pair = this.redis.createPair();
    if (pair) {
      server.adapter(createAdapter(pair.pubClient, pair.subClient));
      this.logger.log('Socket.IO using the Redis adapter');
    } else {
      this.logger.warn(
        'Socket.IO running single-node — set REDIS_URL before scaling past one instance',
      );
    }

    // Authentication happens once, at connect. The token is verified with the
    // same code path the REST API uses, so a deactivated user is refused here too.
    server.use((socket, next) => {
      const token = this.handshakeToken(socket as AppSocket);
      if (!token) {
        next(new Error('UNAUTHORIZED'));
        return;
      }
      this.authContext
        .fromToken(token)
        .then((auth) => {
          (socket as AppSocket).data.auth = auth;
          next();
        })
        .catch(() => next(new Error('UNAUTHORIZED')));
    });

    this.logger.log('Socket.IO initialised');
  }

  /**
   * Extracts the access token from the handshake.
   *
   * `auth.token` is the documented path; the Authorization header is accepted so
   * a non-browser client can reuse the same credential it sends to the REST API.
   */
  private handshakeToken(socket: AppSocket): string | null {
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
  private async canJoinConversation(
    auth: AuthContext,
    conversationId: string,
  ): Promise<boolean> {
    const conversation = await this.prisma.conversation.findFirst({
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

  private async touchPresence(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt: new Date() },
        select: { id: true },
      });
    } catch (error) {
      // Presence is decoration. A failed write must not tear down the socket.
      this.logger.debug({ err: error, userId }, 'Failed to record presence');
    }
  }

  handleConnection(socket: AppSocket): void {
    const auth = socket.data.auth;
    // A socket that failed the handshake middleware never reaches here, but
    // the type does not know that.
    if (!auth) return;

    // Every socket is in its organization room and its own user room from the
    // moment it connects, so notifications and inbox updates need no join.
    void socket.join(rooms.organization(auth.organizationId));
    void socket.join(rooms.user(auth.organizationId, auth.userId));

    void this.touchPresence(auth.userId);
    this.server?.to(rooms.organization(auth.organizationId)).emit(SERVER_EVENTS.PRESENCE, {
      userId: auth.userId,
      online: true,
      lastSeenAt: new Date().toISOString(),
    });

    this.logger.debug({ userId: auth.userId, socketId: socket.id }, 'Socket connected');

    socket.on('disconnect', (reason) => {
      this.logger.debug(
        { userId: auth.userId, socketId: socket.id, reason },
        'Socket disconnected',
      );
      void this.touchPresence(auth.userId);
      this.server?.to(rooms.organization(auth.organizationId)).emit(SERVER_EVENTS.PRESENCE, {
        userId: auth.userId,
        online: false,
        lastSeenAt: new Date().toISOString(),
      });
    });
  }

  @SubscribeMessage(CLIENT_EVENTS.JOIN_CONVERSATION)
  async onJoinConversation(socket: AppSocket, conversationId: unknown): Promise<void> {
    if (typeof conversationId !== 'string' || !conversationId) return;
    const auth = socket.data.auth;
    if (!auth) return;

    if (await this.canJoinConversation(auth, conversationId)) {
      await socket.join(rooms.conversation(auth.organizationId, conversationId));
    }
  }

  @SubscribeMessage(CLIENT_EVENTS.LEAVE_CONVERSATION)
  async onLeaveConversation(socket: AppSocket, conversationId: unknown): Promise<void> {
    if (typeof conversationId !== 'string' || !conversationId) return;
    const auth = socket.data.auth;
    if (!auth) return;
    await socket.leave(rooms.conversation(auth.organizationId, conversationId));
  }

  @SubscribeMessage(CLIENT_EVENTS.TYPING_START)
  onTypingStart(socket: AppSocket, conversationId: unknown): void {
    this.emitTyping(socket, conversationId, true);
  }

  @SubscribeMessage(CLIENT_EVENTS.TYPING_STOP)
  onTypingStop(socket: AppSocket, conversationId: unknown): void {
    this.emitTyping(socket, conversationId, false);
  }

  private emitTyping(socket: AppSocket, conversationId: unknown, isTyping: boolean): void {
    if (typeof conversationId !== 'string' || !conversationId) return;
    const auth = socket.data.auth;
    if (!auth) return;

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
  }

  // --- Emit helpers -------------------------------------------------------
  //
  // Every one is a no-op when the socket server has not been started, so service
  // code calls them unconditionally and stays testable without a server.

  emitMessageCreated(
    organizationId: string,
    message: MessageDto,
    conversation: ConversationDto | null,
  ): void {
    if (!this.server) return;
    const payload: MessageCreatedPayload = {
      conversationId: message.conversationId,
      message,
      conversation,
    };

    // The thread room gets the message; the organization room gets it too so an
    // agent looking at the inbox list sees the preview move without having opened
    // the conversation. Internal notes stay inside the thread room.
    this.server
      .to(rooms.conversation(organizationId, message.conversationId))
      .emit(SERVER_EVENTS.MESSAGE_CREATED, payload);

    if (!message.isInternal) {
      this.server
        .to(rooms.organization(organizationId))
        .emit(SERVER_EVENTS.MESSAGE_CREATED, payload);
    }
  }

  emitMessageUpdated(organizationId: string, message: MessageDto): void {
    if (!this.server) return;
    const payload: MessageUpdatedPayload = {
      conversationId: message.conversationId,
      message,
    };
    this.server
      .to(rooms.conversation(organizationId, message.conversationId))
      .emit(SERVER_EVENTS.MESSAGE_UPDATED, payload);
  }

  emitConversationChanged(
    conversation: ConversationDto,
    reason: ConversationChangedPayload['reason'],
  ): void {
    if (!this.server) return;
    const payload: ConversationChangedPayload = { conversation, reason };
    const event =
      reason === 'created'
        ? SERVER_EVENTS.CONVERSATION_CREATED
        : SERVER_EVENTS.CONVERSATION_UPDATED;
    this.server.to(rooms.organization(conversation.organizationId)).emit(event, payload);
  }

  emitNotification(notification: NotificationPayload): void {
    if (!this.server) return;
    this.server
      .to(rooms.user(notification.organizationId, notification.userId))
      .emit(SERVER_EVENTS.NOTIFICATION_CREATED, notification);
  }
}
