'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { api, type ConversationFilters, type CustomerFilters } from './api';
import { queryKeys } from './query-keys';
import type { CursorMeta, Message } from './types';

/**
 * Data hooks shared by the screens.
 *
 * Anything that more than one component needs to fetch the same way lives here,
 * so a filter change or a cache key rename happens in one place rather than in
 * every page that happens to list conversations.
 */

/** Delays a value so a search box does not fire a request per keystroke. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function useConversations(filters: ConversationFilters) {
  return useQuery({
    queryKey: queryKeys.conversations.list(filters as Record<string, unknown>),
    queryFn: () => api.conversations.list(filters),
    // Keeping the previous page visible while the next one loads stops the
    // whole list from blanking every time a filter changes.
    placeholderData: (previous) => previous,
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations.detail(id ?? ''),
    queryFn: () => api.conversations.get(id as string),
    enabled: Boolean(id),
  });
}

export function useConversationStats() {
  return useQuery({
    queryKey: queryKeys.conversations.stats,
    queryFn: () => api.conversations.stats(),
  });
}

interface MessagePage {
  items: Message[];
  meta: CursorMeta;
}

/**
 * Chat history, paged backwards.
 *
 * "Next page" means older history, so `pages[0]` holds the newest messages.
 * `flatMessages` reverses the page order (not the items inside a page) to give
 * the caller one oldest-first array to render.
 */
export function useMessages(conversationId: string | undefined) {
  const query = useInfiniteQuery<MessagePage>({
    queryKey: queryKeys.conversations.messages(conversationId ?? ''),
    queryFn: ({ pageParam }) =>
      api.conversations.messages(conversationId as string, {
        cursor: pageParam as string | undefined,
        limit: 40,
        includeInternal: true,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    enabled: Boolean(conversationId),
  });

  const flatMessages = useMemo(() => {
    if (!query.data) return [];
    return [...query.data.pages].reverse().flatMap((page) => page.items);
  }, [query.data]);

  return { ...query, flatMessages };
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { content?: string; isInternal?: boolean }) =>
      api.conversations.send(conversationId, input),

    /**
     * The sent message is written straight into the thread.
     *
     * The socket will broadcast the same message a moment later; `applyMessage`
     * dedupes on id, so the bubble does not appear twice. Writing it here
     * rather than waiting means the composer clears instantly even on a slow
     * provider round trip.
     */
    onSuccess: (message) => {
      queryClient.setQueryData<InfiniteData<MessagePage>>(
        queryKeys.conversations.messages(conversationId),
        (existing) => {
          if (!existing) return existing;
          if (existing.pages.some((page) => page.items.some((item) => item.id === message.id))) {
            return existing;
          }

          const pages = [...existing.pages];
          const newest = pages[0];
          if (!newest) return existing;

          pages[0] = { ...newest, items: [...newest.items, message] };
          return { ...existing, pages };
        },
      );

      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
    },
  });
}

export function useCustomers(filters: CustomerFilters) {
  return useQuery({
    queryKey: queryKeys.customers.list(filters as Record<string, unknown>),
    queryFn: () => api.customers.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id ?? ''),
    queryFn: () => api.customers.get(id as string),
    enabled: Boolean(id),
  });
}

export function useTags(enabled = true) {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: () => api.tags.list(),
    // Tags change rarely and are read on nearly every screen.
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useTeams(enabled = true) {
  return useQuery({
    queryKey: queryKeys.teams,
    queryFn: () => api.teams.list(),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useUsers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.users.list({ limit: 100 }),
    queryFn: () => api.users.list({ page: 1, limit: 100 }),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useIntegrations(enabled = true) {
  return useQuery({
    queryKey: queryKeys.integrations.all,
    queryFn: () => api.integrations.list(),
    enabled,
  });
}

export function useChannelCatalogue(enabled = true) {
  return useQuery({
    queryKey: queryKeys.integrations.catalogue,
    queryFn: () => api.integrations.catalogue(),
    enabled,
  });
}
