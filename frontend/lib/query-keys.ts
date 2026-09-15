/**
 * Every cache key in one place.
 *
 * Socket handlers invalidate by prefix (`queryKeys.conversations.all`), so the
 * keys have to nest consistently. Literal arrays scattered through components
 * are what make a realtime cache quietly stop updating.
 */
export const queryKeys = {
  me: ['me'] as const,

  conversations: {
    all: ['conversations'] as const,
    list: (filters: Record<string, unknown>) => ['conversations', 'list', filters] as const,
    detail: (id: string) => ['conversations', 'detail', id] as const,
    stats: ['conversations', 'stats'] as const,
    messages: (id: string) => ['conversations', 'messages', id] as const,
    notes: (id: string) => ['conversations', 'notes', id] as const,
    assignments: (id: string) => ['conversations', 'assignments', id] as const,
  },

  customers: {
    all: ['customers'] as const,
    list: (filters: Record<string, unknown>) => ['customers', 'list', filters] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
    notes: (id: string) => ['customers', 'notes', id] as const,
  },

  users: {
    all: ['users'] as const,
    list: (filters: Record<string, unknown>) => ['users', 'list', filters] as const,
  },

  teams: ['teams'] as const,
  tags: ['tags'] as const,

  integrations: {
    all: ['integrations'] as const,
    catalogue: ['integrations', 'catalogue'] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: (filters: Record<string, unknown>) => ['notifications', 'list', filters] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
  },

  auditLogs: (filters: Record<string, unknown>) => ['audit-logs', filters] as const,

  analytics: (filters: Record<string, unknown>) => ['analytics', filters] as const,
} as const;
