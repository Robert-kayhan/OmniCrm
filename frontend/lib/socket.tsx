'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SOCKET_URL, getAccessToken, refreshSession } from './api';
import { useAuth } from './auth';
import { queryKeys } from './query-keys';
import type {
  Conversation,
  ConversationChangedPayload,
  CursorMeta,
  Message,
  MessageCreatedPayload,
  MessageUpdatedPayload,
  Notification,
  PresencePayload,
  TypingPayload,
} from './types';

/**
 * The socket, and the cache writes it drives.
 *
 * Server events patch the React Query cache directly rather than invalidating
 * it. In a busy inbox, invalidation means a refetch per message, which is both
 * slow and visibly janky — the list reorders after a delay instead of moving as
 * the message arrives. The payloads are the same DTOs the REST endpoints
 * return, so writing them straight into the cache is safe.
 */

const SERVER_EVENTS = {
  MESSAGE_CREATED: 'message:created',
  MESSAGE_UPDATED: 'message:updated',
  CONVERSATION_CREATED: 'conversation:created',
  CONVERSATION_UPDATED: 'conversation:updated',
  NOTIFICATION_CREATED: 'notification:created',
  TYPING: 'conversation:typing',
  PRESENCE: 'presence:updated',
} as const;

const CLIENT_EVENTS = {
  JOIN_CONVERSATION: 'conversation:join',
  LEAVE_CONVERSATION: 'conversation:leave',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
} as const;

/** A typing indicator is cleared on a timer as well as on the stop event. */
const TYPING_TIMEOUT_MS = 4_000;

interface MessagePage {
  items: Message[];
  meta: CursorMeta;
}

interface SocketContextValue {
  connected: boolean;
  /** Who is typing, keyed by conversation id. */
  typingByConversation: Record<string, string[]>;
  onlineUserIds: string[];
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  startTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [typingByConversation, setTypingByConversation] = useState<Record<string, string[]>>({});
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Rooms are re-joined after a reconnect; the server forgets them on drop.
  const joinedRooms = useRef<Set<string>>(new Set());

  /**
   * Inserts a message into an open thread.
   *
   * Keyed on message id so the sender's own optimistic echo, the HTTP response
   * and the socket broadcast all collapse into one bubble.
   */
  const applyMessage = useCallback(
    (conversationId: string, message: Message) => {
      queryClient.setQueryData<InfiniteData<MessagePage>>(
        queryKeys.conversations.messages(conversationId),
        (existing) => {
          if (!existing) return existing;

          const alreadyPresent = existing.pages.some((page) =>
            page.items.some((item) => item.id === message.id),
          );

          if (alreadyPresent) {
            return {
              ...existing,
              pages: existing.pages.map((page) => ({
                ...page,
                items: page.items.map((item) => (item.id === message.id ? message : item)),
              })),
            };
          }

          // "Next page" means *older* history, so pages[0] holds the newest
          // messages and the rendered thread reverses the page order. A live
          // message therefore belongs at the end of the first page, not the last.
          const pages = [...existing.pages];
          const newest = pages[0];
          if (!newest) return existing;

          pages[0] = { ...newest, items: [...newest.items, message] };
          return { ...existing, pages };
        },
      );
    },
    [queryClient],
  );

  /**
   * Moves a conversation inside every cached list.
   *
   * Lists are filtered server-side, so a conversation that no longer matches a
   * filter is dropped rather than left behind — otherwise closing a thread
   * leaves it sitting in the "Open" tab until a manual refresh.
   */
  const applyConversation = useCallback(
    (conversation: Conversation) => {
      queryClient.setQueryData(queryKeys.conversations.detail(conversation.id), conversation);

      queryClient.setQueriesData<{ items: Conversation[]; meta: unknown }>(
        { queryKey: [...queryKeys.conversations.all, 'list'] },
        (existing) => {
          if (!existing) return existing;

          const index = existing.items.findIndex((item) => item.id === conversation.id);
          if (index === -1) {
            // Not in this list. Refetching would be correct but costly on every
            // message; the list refetches on focus and on filter change.
            return existing;
          }

          const items = [...existing.items];
          items[index] = conversation;
          return { ...existing, items };
        },
      );

      // Counters are cheap and wrong-looking when stale.
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.stats });
    },
    [queryClient],
  );

  useEffect(() => {
    if (!user) {
      // Nothing to connect to. `connected` is derived from `user` below, so
      // there is no state to reset here.
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      // The handshake carries the current access token; `auth` is re-read by
      // socket.io on every reconnect attempt, which is why it is a function.
      auth: (callback) => callback({ token: getAccessToken() ?? '' }),
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      // Re-enter the rooms this tab was watching before the drop.
      for (const conversationId of joinedRooms.current) {
        socket.emit(CLIENT_EVENTS.JOIN_CONVERSATION, conversationId);
      }
    });

    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('connect_error', (error: Error) => {
      // The usual cause is an access token that expired while the tab slept.
      // One refresh then lets the automatic reconnect succeed.
      if (error.message === 'UNAUTHORIZED') {
        void refreshSession();
      }
    });

    socket.on(SERVER_EVENTS.MESSAGE_CREATED, (payload: MessageCreatedPayload) => {
      applyMessage(payload.conversationId, payload.message);
      if (payload.conversation) applyConversation(payload.conversation);
    });

    socket.on(SERVER_EVENTS.MESSAGE_UPDATED, (payload: MessageUpdatedPayload) => {
      applyMessage(payload.conversationId, payload.message);
    });

    socket.on(SERVER_EVENTS.CONVERSATION_UPDATED, (payload: ConversationChangedPayload) => {
      applyConversation(payload.conversation);
    });

    socket.on(SERVER_EVENTS.CONVERSATION_CREATED, (payload: ConversationChangedPayload) => {
      queryClient.setQueryData(
        queryKeys.conversations.detail(payload.conversation.id),
        payload.conversation,
      );
      // A brand new thread is not in any cached page yet, so the list does have
      // to refetch — but only for a genuinely new conversation, not per message.
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.conversations.all, 'list'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.stats });
    });

    socket.on(SERVER_EVENTS.NOTIFICATION_CREATED, (notification: Notification) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      toast(notification.title, { description: notification.message });
    });

    socket.on(SERVER_EVENTS.TYPING, (payload: TypingPayload) => {
      const key = payload.conversationId;
      const timerKey = `${key}:${payload.userId}`;

      const clearFor = () => {
        setTypingByConversation((current) => {
          const names = (current[key] ?? []).filter((name) => name !== payload.name);
          if (names.length === 0) {
            const next = { ...current };
            delete next[key];
            return next;
          }
          return { ...current, [key]: names };
        });
      };

      const existingTimer = typingTimers.current.get(timerKey);
      if (existingTimer) clearTimeout(existingTimer);

      if (!payload.isTyping) {
        typingTimers.current.delete(timerKey);
        clearFor();
        return;
      }

      setTypingByConversation((current) => {
        const names = current[key] ?? [];
        if (names.includes(payload.name)) return current;
        return { ...current, [key]: [...names, payload.name] };
      });

      // A client that closes its tab mid-keystroke never sends `stop`, so the
      // indicator has to expire by itself or it hangs forever.
      typingTimers.current.set(
        timerKey,
        setTimeout(() => {
          typingTimers.current.delete(timerKey);
          clearFor();
        }, TYPING_TIMEOUT_MS),
      );
    });

    socket.on(SERVER_EVENTS.PRESENCE, (payload: PresencePayload) => {
      setOnlineUserIds((current) => {
        const set = new Set(current);
        if (payload.online) set.add(payload.userId);
        else set.delete(payload.userId);
        return Array.from(set);
      });
    });

    // Captured now so the cleanup does not read a ref that may have been
    // reassigned by the time it runs.
    const timers = typingTimers.current;

    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [user, queryClient, applyMessage, applyConversation]);

  const joinConversation = useCallback((conversationId: string) => {
    joinedRooms.current.add(conversationId);
    socketRef.current?.emit(CLIENT_EVENTS.JOIN_CONVERSATION, conversationId);
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    joinedRooms.current.delete(conversationId);
    socketRef.current?.emit(CLIENT_EVENTS.LEAVE_CONVERSATION, conversationId);
  }, []);

  const startTyping = useCallback((conversationId: string) => {
    socketRef.current?.emit(CLIENT_EVENTS.TYPING_START, conversationId);
  }, []);

  const stopTyping = useCallback((conversationId: string) => {
    socketRef.current?.emit(CLIENT_EVENTS.TYPING_STOP, conversationId);
  }, []);

  // Signed out means "not live", without a second source of truth to keep in
  // step with `user`.
  const connected = Boolean(user) && socketConnected;

  const value = useMemo<SocketContextValue>(
    () => ({
      connected,
      typingByConversation,
      onlineUserIds,
      joinConversation,
      leaveConversation,
      startTyping,
      stopTyping,
    }),
    [
      connected,
      typingByConversation,
      onlineUserIds,
      joinConversation,
      leaveConversation,
      startTyping,
      stopTyping,
    ],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used inside <SocketProvider>');
  return context;
}
