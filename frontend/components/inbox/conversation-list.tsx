'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/ui/avatar';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { PriorityBadge } from '@/components/ui/status-badge';
import { TagChip } from '@/components/ui/tag-chip';
import { formatListTime, messagePreview } from '@/lib/format';
import { useConversations } from '@/lib/hooks';
import { useSocket } from '@/lib/socket';
import type { Conversation } from '@/lib/types';
import type { ConversationFilters } from '@/lib/api';
import { cn } from '@/lib/utils';

export function ConversationList({
  query,
  page,
  onPageChange,
}: {
  query: ConversationFilters;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;
  const { data, isLoading, isError, error, refetch } = useConversations(query);

  if (isLoading) {
    return (
      <div className="flex-1 space-y-1 p-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex gap-3 rounded-lg p-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1">
        <EmptyState
          icon={Inbox}
          title="Could not load conversations"
          description={error instanceof Error ? error.message : 'Something went wrong.'}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const conversations = data?.items ?? [];
  const meta = data?.meta;

  if (conversations.length === 0) {
    return (
      <div className="flex-1">
        <EmptyState
          icon={Inbox}
          title="No conversations match"
          description="Adjust the filters, or wait for a customer to write in. Simulated traffic can be generated from the Simulate menu."
        />
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="divide-y">
          {conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeId}
            />
          ))}
        </ul>
      </ScrollArea>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            Page {meta.page} of {meta.totalPages} · {meta.total} total
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!meta.hasPreviousPage}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!meta.hasNextPage}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ConversationRow({
  conversation,
  active,
}: {
  conversation: Conversation;
  active: boolean;
}) {
  const { typingByConversation } = useSocket();
  const typing = typingByConversation[conversation.id];

  const unread = conversation.unreadCount > 0;
  const preview = conversation.lastMessage
    ? messagePreview(
        conversation.lastMessage.content,
        conversation.lastMessage.messageType,
        conversation.lastMessage.senderType,
      )
    : 'No messages yet';

  return (
    <li>
      <Link
        href={`/inbox/${conversation.id}`}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex gap-3 px-3 py-3 transition-colors',
          active ? 'bg-accent' : 'hover:bg-accent/50',
        )}
      >
        <div className="relative shrink-0">
          <UserAvatar
            name={conversation.customer.fullName}
            src={conversation.customer.avatar ?? conversation.customerChannel?.avatar}
          />
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-background">
            <ChannelIcon channel={conversation.channel} withBackground />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>
              {conversation.customer.fullName || 'Unknown'}
            </p>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatListTime(conversation.lastMessageAt)}
            </span>
          </div>

          <p
            className={cn(
              'mt-0.5 line-clamp-1 text-xs',
              // A live typing indicator replaces the preview: it is strictly
              // newer information than the last stored message.
              typing?.length ? 'italic text-primary' : 'text-muted-foreground',
              unread && !typing?.length && 'text-foreground',
            )}
          >
            {typing?.length ? `${typing.join(', ')} is typing…` : preview}
          </p>

          <div className="mt-1.5 flex items-center gap-1.5">
            <PriorityBadge priority={conversation.priority} />
            {conversation.status === 'CLOSED' ? (
              <span className="text-xs text-muted-foreground">Closed</span>
            ) : null}
            {conversation.tags.slice(0, 2).map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
            {conversation.tags.length > 2 ? (
              <span className="text-xs text-muted-foreground">
                +{conversation.tags.length - 2}
              </span>
            ) : null}

            <span className="ml-auto flex items-center gap-1.5">
              {conversation.assignedUser ? (
                <UserAvatar
                  name={conversation.assignedUser.name}
                  src={conversation.assignedUser.avatar}
                  className="size-5 text-[10px]"
                />
              ) : null}
              {unread ? (
                <span className="flex min-w-4.5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground tabular-nums">
                  {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                </span>
              ) : null}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
