import type {
  AnalyticsOverview,
  Assignment,
  AuditLog,
  ChannelCapability,
  Conversation,
  ConversationPriority,
  ConversationStats,
  ConversationStatus,
  CurrentUser,
  Customer,
  CustomerChannel,
  CursorPaginated,
  ConnectPageResult,
  FacebookLoginResult,
  Integration,
  Message,
  MessageType,
  Note,
  Notification,
  Paginated,
  Session,
  TagDetail,
  Team,
  UserWithTeams,
} from './types';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';

/**
 * Socket.IO is served by the API process, so this defaults to the API origin.
 * It is overridable for deployments that put the websocket behind its own
 * ingress.
 */
export const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL?.replace(/\/$/, '') ?? API_BASE_URL;

const API_ROOT = `${API_BASE_URL}/api`;

/**
 * A failed request, carrying the machine-readable code the API guarantees.
 * Callers branch on `code`; `message` is only ever shown to a person.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId?: string;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  }) {
    super(input.message);
    this.name = 'ApiError';
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
    this.requestId = input.requestId;
  }

  /** Validation failures arrive as a list of per-field issues. */
  get fieldIssues(): Array<{ path: string; message: string }> {
    if (!Array.isArray(this.details)) return [];
    return this.details.filter(
      (issue): issue is { path: string; message: string } =>
        typeof issue === 'object' &&
        issue !== null &&
        typeof (issue as { path?: unknown }).path === 'string' &&
        typeof (issue as { message?: unknown }).message === 'string',
    );
  }
}

// --- Access token -----------------------------------------------------------
//
// The access token lives in a module variable, not localStorage: anything a
// script on the page can read, an injected script can exfiltrate. The durable
// credential is the httpOnly refresh cookie, which JavaScript cannot touch at
// all — a reload recovers the session from it rather than from storage.

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Called when the session is definitively gone, so the app can send the user to /login. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

// --- Refresh ----------------------------------------------------------------

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Exchanges the refresh cookie for a new access token.
 *
 * Concurrent callers share one in-flight request. Without that, a page that
 * fires six queries on mount with an expired token would rotate the refresh
 * token six times, and reuse detection on the server would revoke the whole
 * session — logging the user out for loading a page.
 */
export async function refreshSession(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_ROOT}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sends the httpOnly refresh cookie cross-origin.
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        setAccessToken(null);
        return null;
      }

      const body = (await response.json()) as { success: boolean; data: Session };
      if (!body.success) {
        setAccessToken(null);
        return null;
      }

      setAccessToken(body.data.accessToken);
      return body.data.accessToken;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

// --- Core request -----------------------------------------------------------

type Query = Record<string, string | number | boolean | string[] | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Skips the refresh-and-retry dance. Used by the auth calls themselves. */
  skipAuthRetry?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_ROOT}${path}`);
  if (!query) return url.toString();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    // The API reads repeated filters as a comma-separated list.
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      url.searchParams.set(key, value.join(','));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function parseError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const payload = (body ?? {}) as {
    message?: string;
    code?: string;
    details?: unknown;
    requestId?: string;
  };

  return new ApiError({
    status: response.status,
    code: payload.code ?? `HTTP_${response.status}`,
    message: payload.message ?? response.statusText ?? 'Request failed',
    details: payload.details,
    requestId: payload.requestId,
  });
}

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    signal: options.signal,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

/**
 * One request, with a single transparent refresh on 401.
 *
 * The retry happens once and only for 401. A 403 is a permission decision that
 * refreshing cannot change, and retrying it would just double the load while
 * showing the user the same error.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await rawRequest(path, options);

  if (response.status === 401 && !options.skipAuthRetry) {
    const token = await refreshSession();
    if (token) {
      response = await rawRequest(path, options);
    } else {
      onUnauthorized?.();
      throw await parseError(response);
    }
  }

  if (!response.ok) {
    const error = await parseError(response);
    if (error.status === 401) onUnauthorized?.();
    throw error;
  }

  if (response.status === 204) return undefined as T;

  const body = (await response.json()) as { success: boolean; data: T; meta?: unknown };
  return body.data;
}

/** Same as `request`, but keeps the `meta` envelope for paginated reads. */
async function requestWithMeta<T, M>(
  path: string,
  options: RequestOptions = {},
): Promise<{ items: T; meta: M }> {
  let response = await rawRequest(path, options);

  if (response.status === 401 && !options.skipAuthRetry) {
    const token = await refreshSession();
    if (token) {
      response = await rawRequest(path, options);
    } else {
      onUnauthorized?.();
      throw await parseError(response);
    }
  }

  if (!response.ok) {
    const error = await parseError(response);
    if (error.status === 401) onUnauthorized?.();
    throw error;
  }

  const body = (await response.json()) as { success: boolean; data: T; meta: M };
  return { items: body.data, meta: body.meta };
}

// --- Endpoints --------------------------------------------------------------

export interface ConversationFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ConversationStatus[];
  channel?: string[];
  priority?: ConversationPriority[];
  assignedUserId?: string;
  assignedTeamId?: string;
  customerId?: string;
  tagIds?: string[];
  unreadOnly?: boolean;
  sort?: 'recent' | 'oldest' | 'priority';
}

export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string[];
  source?: string[];
  channel?: string[];
  tagIds?: string[];
  sort?: 'recent' | 'created' | 'name';
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<Session>('/auth/login', {
        method: 'POST',
        body: { email, password },
        skipAuthRetry: true,
      }),

    register: (input: {
      organizationName: string;
      name: string;
      email: string;
      password: string;
    }) =>
      request<Session>('/auth/register', {
        method: 'POST',
        body: input,
        skipAuthRetry: true,
      }),

    logout: () => request<{ loggedOut: boolean }>('/auth/logout', { method: 'POST', body: {} }),

    me: () => request<CurrentUser>('/auth/me'),

    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ passwordChanged: boolean }>('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      }),
  },

  conversations: {
    list: (filters: ConversationFilters) =>
      requestWithMeta<Conversation[], Paginated<Conversation>['meta']>('/conversations', {
        query: filters as Query,
      }).then(({ items, meta }) => ({ items, meta })),

    stats: () => request<ConversationStats>('/conversations/stats'),

    get: (id: string) => request<Conversation>(`/conversations/${id}`),

    create: (input: {
      customerId: string;
      channel: string;
      subject?: string;
      priority?: ConversationPriority;
      assignedUserId?: string;
    }) => request<Conversation>('/conversations', { method: 'POST', body: input }),

    setStatus: (id: string, status: ConversationStatus) =>
      request<Conversation>(`/conversations/${id}/status`, {
        method: 'PATCH',
        body: { status },
      }),

    setPriority: (id: string, priority: ConversationPriority) =>
      request<Conversation>(`/conversations/${id}/priority`, {
        method: 'PATCH',
        body: { priority },
      }),

    markRead: (id: string) =>
      request<{ id: string; unreadCount: number }>(`/conversations/${id}/read`, {
        method: 'POST',
        body: {},
      }),

    assign: (id: string, input: { assignedUserId?: string | null; assignedTeamId?: string | null }) =>
      request<Conversation>(`/conversations/${id}/assign`, { method: 'POST', body: input }),

    assignments: (id: string) => request<Assignment[]>(`/conversations/${id}/assignments`),

    addTags: (id: string, tagIds: string[]) =>
      request<Conversation>(`/conversations/${id}/tags`, { method: 'POST', body: { tagIds } }),

    removeTag: (id: string, tagId: string) =>
      request<Conversation>(`/conversations/${id}/tags/${tagId}`, { method: 'DELETE' }),

    messages: (id: string, params: { cursor?: string; limit?: number; includeInternal?: boolean }) =>
      requestWithMeta<Message[], CursorPaginated<Message>['meta']>(`/conversations/${id}/messages`, {
        query: params as Query,
      }).then(({ items, meta }) => ({ items, meta })),

    send: (
      id: string,
      input: {
        content?: string;
        isInternal?: boolean;
        attachments?: Array<{ type: MessageType; url: string; name?: string }>;
      },
    ) => request<Message>(`/conversations/${id}/messages`, { method: 'POST', body: input }),

    notes: (id: string) =>
      requestWithMeta<Note[], Paginated<Note>['meta']>(`/conversations/${id}/notes`, {}).then(
        ({ items }) => items,
      ),

    addNote: (id: string, content: string) =>
      request<Note>(`/conversations/${id}/notes`, { method: 'POST', body: { content } }),
  },

  customers: {
    list: (filters: CustomerFilters) =>
      requestWithMeta<Customer[], Paginated<Customer>['meta']>('/customers', {
        query: filters as Query,
      }).then(({ items, meta }) => ({ items, meta })),

    get: (id: string) => request<Customer>(`/customers/${id}`),

    create: (input: Partial<Customer>) =>
      request<Customer>('/customers', { method: 'POST', body: input }),

    update: (id: string, input: Partial<Customer>) =>
      request<Customer>(`/customers/${id}`, { method: 'PATCH', body: input }),

    remove: (id: string) => request<void>(`/customers/${id}`, { method: 'DELETE' }),

    addTags: (id: string, tagIds: string[]) =>
      request<Customer>(`/customers/${id}/tags`, { method: 'POST', body: { tagIds } }),

    removeTag: (id: string, tagId: string) =>
      request<Customer>(`/customers/${id}/tags/${tagId}`, { method: 'DELETE' }),

    channels: (id: string) => request<CustomerChannel[]>(`/customers/${id}/channels`),

    notes: (id: string) =>
      requestWithMeta<Note[], Paginated<Note>['meta']>(`/customers/${id}/notes`, {}).then(
        ({ items }) => items,
      ),

    addNote: (id: string, content: string) =>
      request<Note>(`/customers/${id}/notes`, { method: 'POST', body: { content } }),
  },

  users: {
    list: (filters: { page?: number; limit?: number; search?: string; role?: string[] }) =>
      requestWithMeta<UserWithTeams[], Paginated<UserWithTeams>['meta']>('/users', {
        query: filters as Query,
      }).then(({ items, meta }) => ({ items, meta })),

    create: (input: { name: string; email: string; password: string; role: string }) =>
      request<UserWithTeams>('/users', { method: 'POST', body: input }),

    update: (id: string, input: { name?: string; role?: string; status?: string }) =>
      request<UserWithTeams>(`/users/${id}`, { method: 'PATCH', body: input }),

    remove: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),
  },

  teams: {
    list: () =>
      requestWithMeta<Team[], Paginated<Team>['meta']>('/teams', {}).then(({ items }) => items),

    create: (input: { name: string; description?: string }) =>
      request<Team>('/teams', { method: 'POST', body: input }),

    update: (id: string, input: { name?: string; description?: string }) =>
      request<Team>(`/teams/${id}`, { method: 'PATCH', body: input }),

    remove: (id: string) => request<void>(`/teams/${id}`, { method: 'DELETE' }),

    addMember: (id: string, userId: string) =>
      request<Team>(`/teams/${id}/members`, { method: 'POST', body: { userId } }),

    removeMember: (id: string, userId: string) =>
      request<Team>(`/teams/${id}/members/${userId}`, { method: 'DELETE' }),
  },

  tags: {
    list: () =>
      requestWithMeta<TagDetail[], Paginated<TagDetail>['meta']>('/tags', {}).then(
        ({ items }) => items,
      ),

    create: (input: { name: string; color?: string; description?: string }) =>
      request<TagDetail>('/tags', { method: 'POST', body: input }),

    update: (id: string, input: { name?: string; color?: string; description?: string }) =>
      request<TagDetail>(`/tags/${id}`, { method: 'PATCH', body: input }),

    remove: (id: string) => request<void>(`/tags/${id}`, { method: 'DELETE' }),
  },

  integrations: {
    list: () => request<Integration[]>('/integrations'),

    catalogue: () => request<ChannelCapability[]>('/integrations/catalogue'),

    connectFacebook: (input: {
      name: string;
      pageId: string;
      pageAccessToken: string;
      externalAccountId?: string;
    }) => request<Integration>('/integrations/facebook', { method: 'POST', body: input }),

    update: (id: string, input: { name?: string; status?: string }) =>
      request<Integration>(`/integrations/${id}`, { method: 'PATCH', body: input }),

    disconnect: (id: string) => request<Integration>(`/integrations/${id}`, { method: 'DELETE' }),

    /** Where to send the browser to start Facebook Login. */
    facebookOAuthUrl: () =>
      request<{ authorizeUrl: string }>('/integrations/facebook/oauth/start'),

    /** The Pages behind a completed login, read back after Meta redirects. */
    facebookPages: (handoffId: string) =>
      request<FacebookLoginResult>(
        `/integrations/facebook/oauth/pages?handoffId=${encodeURIComponent(handoffId)}`,
      ),

    /**
     * Subscribes the chosen inbox, stores it, and imports recent history.
     *
     * `pageId` is always the Facebook Page; `channel` picks which of its two
     * inboxes to connect, because Instagram Direct is reached through the Page
     * it is linked to.
     */
    connectFacebookPage: (input: {
      handoffId: string;
      pageId: string;
      channel?: 'FACEBOOK' | 'INSTAGRAM';
      name?: string;
    }) =>
      request<ConnectPageResult>('/integrations/facebook/pages', {
        method: 'POST',
        body: input,
      }),
  },

  notifications: {
    // This endpoint nests the page inside `data` alongside an org-wide unread
    // total, so `data` is not the array itself the way it is elsewhere.
    list: (filters: { page?: number; limit?: number; unreadOnly?: boolean }) =>
      requestWithMeta<{ items: Notification[]; unread: number }, Paginated<Notification>['meta']>(
        '/notifications',
        { query: filters as Query },
      ).then(({ items, meta }) => ({ items: items.items, unread: items.unread, meta })),

    unreadCount: () => request<{ count: number }>('/notifications/unread-count'),

    markRead: (id: string) =>
      request<Notification>(`/notifications/${id}/read`, { method: 'PATCH', body: {} }),

    markAllRead: () =>
      request<{ updated: number }>('/notifications/read-all', { method: 'POST', body: {} }),
  },

  auditLogs: {
    list: (filters: {
      page?: number;
      limit?: number;
      action?: string;
      entityType?: string;
      userId?: string;
    }) =>
      requestWithMeta<AuditLog[], Paginated<AuditLog>['meta']>('/audit-logs', {
        query: filters as Query,
      }).then(({ items, meta }) => ({ items, meta })),
  },

  analytics: {
    overview: (filters: { days?: number; channel?: string[] }) =>
      request<AnalyticsOverview>('/analytics/overview', { query: filters as Query }),
  },

  dev: {
    simulateInbound: (input: {
      channel: string;
      content: string;
      name?: string;
      externalUserId?: string;
    }) => request<unknown>('/dev/simulate/inbound-message', { method: 'POST', body: input }),

    seed: (input: { conversations: number; messagesPerConversation: number }) =>
      request<{ conversations: number; messages: number }>('/dev/simulate/seed', {
        method: 'POST',
        body: input,
      }),

    reset: () =>
      request<{ customersRemoved: number }>('/dev/simulate/reset', { method: 'POST', body: {} }),
  },
};
