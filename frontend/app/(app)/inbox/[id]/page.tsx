'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquareOff } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { ThreadHeader } from '@/components/inbox/thread-header';
import { MessageList } from '@/components/inbox/message-list';
import { Composer } from '@/components/inbox/composer';
import { CustomerPanel } from '@/components/inbox/customer-panel';
import { api, ApiError } from '@/lib/api';
import { useConversation } from '@/lib/hooks';
import { queryKeys } from '@/lib/query-keys';
import { useSocket } from '@/lib/socket';

export default function ConversationPage({ params }: PageProps<'/inbox/[id]'>) {
  // `params` is a promise in Next 16; `use` unwraps it in a client component.
  const { id } = use(params);

  const queryClient = useQueryClient();
  const { joinConversation, leaveConversation } = useSocket();
  const { data: conversation, isLoading, error } = useConversation(id);

  const [panelOpen, setPanelOpen] = useState(true);

  /**
   * Subscribe to this thread's room for the duration of the visit.
   *
   * Joining is what makes typing indicators and internal notes arrive; leaving
   * on unmount is what stops a long session from accumulating every room the
   * agent has ever opened.
   */
  useEffect(() => {
    joinConversation(id);
    return () => leaveConversation(id);
  }, [id, joinConversation, leaveConversation]);

  const markRead = useMutation({
    mutationFn: () => api.conversations.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(id) });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.conversations.all, 'list'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.stats });
    },
  });

  // Clear the unread badge once per visit, and again if new messages land while
  // the thread is open. Tracked in a ref so the effect does not loop on the
  // count it just changed.
  const lastClearedCount = useRef<number | null>(null);
  useEffect(() => {
    if (!conversation) return;
    if (conversation.unreadCount === 0) return;
    if (lastClearedCount.current === conversation.unreadCount) return;

    lastClearedCount.current = conversation.unreadCount;
    markRead.mutate();
    // `markRead` is a stable mutation object; including it would re-run this on
    // every status change of the mutation itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id, conversation?.unreadCount]);

  useEffect(() => {
    lastClearedCount.current = null;
  }, [id]);

  if (isLoading) return <FullPageSpinner label="Loading conversation" />;

  if (error || !conversation) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={MessageSquareOff}
          title={notFound ? 'Conversation not available' : 'Could not load this conversation'}
          description={
            notFound
              ? 'It may have been closed, reassigned to another team, or it does not exist.'
              : 'Something went wrong fetching this thread. Try again in a moment.'
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <ThreadHeader
          conversation={conversation}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((open) => !open)}
        />
        <MessageList conversationId={id} />
        {/* Keyed so a thread switch discards any half-typed draft. */}
        <Composer key={conversation.id} conversation={conversation} />
      </div>

      {panelOpen ? (
        <div className="hidden xl:block">
          <CustomerPanel conversation={conversation} />
        </div>
      ) : null}
    </div>
  );
}
