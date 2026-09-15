'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { dayKey, formatDayLabel } from '@/lib/format';
import { useMessages } from '@/lib/hooks';
import { useSocket } from '@/lib/socket';
import type { Message } from '@/lib/types';
import { MessageBubble } from './message-bubble';

/** How close to the bottom still counts as "following the conversation". */
const STICK_TO_BOTTOM_PX = 120;

/**
 * The thread.
 *
 * Two scroll behaviours have to coexist: new messages pin the view to the
 * bottom, but only if the reader was already there — yanking someone away from
 * history they are reading is the single most irritating thing a chat UI can
 * do. Loading older pages preserves the reader's position instead.
 */
export function MessageList({ conversationId }: { conversationId: string }) {
  const { flatMessages, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useMessages(conversationId);
  const { typingByConversation } = useSocket();

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const wasAtBottom = useRef(true);
  const previousHeight = useRef(0);
  const previousCount = useRef(0);
  const previousConversation = useRef(conversationId);

  const typing = typingByConversation[conversationId];

  const isNearBottom = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return true;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    return distance < STICK_TO_BOTTOM_PX;
  }, []);

  const handleScroll = useCallback(() => {
    wasAtBottom.current = isNearBottom();
  }, [isNearBottom]);

  /**
   * Positions the viewport after every render that changed the content.
   *
   * `useLayoutEffect` rather than `useEffect`: the adjustment has to happen
   * before the browser paints, or the reader sees the thread jump.
   */
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const switchedConversation = previousConversation.current !== conversationId;
    const grewAtTop =
      flatMessages.length > previousCount.current && viewport.scrollTop < STICK_TO_BOTTOM_PX;

    if (switchedConversation) {
      viewport.scrollTop = viewport.scrollHeight;
      previousConversation.current = conversationId;
      wasAtBottom.current = true;
    } else if (grewAtTop && previousHeight.current > 0) {
      // Older history was prepended. Restoring the offset from the bottom keeps
      // the message the reader was looking at exactly where it was.
      viewport.scrollTop = viewport.scrollHeight - previousHeight.current;
    } else if (wasAtBottom.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }

    previousHeight.current = viewport.scrollHeight;
    previousCount.current = flatMessages.length;
  }, [flatMessages, conversationId]);

  // A typing indicator appearing should also scroll, but only for a follower.
  useEffect(() => {
    if (!typing?.length) return;
    if (!wasAtBottom.current) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [typing]);

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className={index % 2 ? 'flex justify-end' : 'flex'}>
            <Skeleton className="h-12 w-64 rounded-2xl" />
          </div>
        ))}
      </div>
    );
  }

  if (flatMessages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={MessagesSquare}
          title="No messages yet"
          description="Send the first message to start this conversation."
        />
      </div>
    );
  }

  return (
    <div
      ref={viewportRef}
      onScroll={handleScroll}
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4"
    >
      {hasNextPage ? (
        <div className="mb-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? <Spinner /> : null}
            Load earlier messages
          </Button>
        </div>
      ) : (
        <p className="mb-4 text-center text-xs text-muted-foreground">
          This is the beginning of the conversation.
        </p>
      )}

      <div className="space-y-1">
        {flatMessages.map((message, index) => {
          const previous = flatMessages[index - 1];
          const showDaySeparator = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
          // One avatar per run of messages from the same person, so a burst of
          // five replies does not repeat the same face five times.
          const showAvatar = isLastOfGroup(flatMessages, index);

          return (
            <div key={message.id} className="space-y-1">
              {showDaySeparator ? (
                <div className="flex items-center gap-3 py-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatDayLabel(message.createdAt)}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              <MessageBubble message={message} showAvatar={showAvatar} />
            </div>
          );
        })}
      </div>

      {typing?.length ? (
        <div className="mt-2 flex items-center gap-2 pl-9 text-xs text-muted-foreground">
          <span className="flex gap-1" aria-hidden>
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
          </span>
          {typing.join(', ')} {typing.length === 1 ? 'is' : 'are'} typing
        </div>
      ) : null}

      <div ref={bottomRef} />
    </div>
  );
}

/** True when the next message comes from someone else, or there is no next one. */
function isLastOfGroup(messages: Message[], index: number): boolean {
  const current = messages[index];
  const next = messages[index + 1];
  if (!current) return false;
  if (!next) return true;
  if (next.senderType !== current.senderType) return true;
  return next.senderUserId !== current.senderUserId;
}
