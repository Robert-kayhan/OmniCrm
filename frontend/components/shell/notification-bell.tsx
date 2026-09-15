'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatRelative } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import type { Notification } from '@/lib/types';

export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: queryKeys.notifications.list({ page: 1, limit: 20 }),
    queryFn: () => api.notifications.list({ page: 1, limit: 20 }),
    enabled: Boolean(user),
  });

  const notifications = data?.items ?? [];
  // The server's count spans every unread notification, not just this first page.
  const unreadCount = data?.unread ?? 0;

  const markRead = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });

  function open(notification: Notification) {
    if (!notification.isRead) markRead.mutate(notification.id);
    if (notification.conversationId) router.push(`/inbox/${notification.conversationId}`);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={
            unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
          }
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute right-1 top-1 flex size-2 rounded-full bg-primary ring-2 ring-background" />
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-88 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nothing yet"
            description="You will be told here when a conversation is assigned to you or a customer replies."
            className="py-10"
          />
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="divide-y">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => open(notification)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-accent',
                      !notification.isRead && 'bg-primary/[0.04]',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {!notification.isRead ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                      ) : null}
                      <span className="truncate text-sm font-medium">{notification.title}</span>
                    </span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {notification.message}
                    </span>
                    <span className="text-xs text-muted-foreground/70">
                      {formatRelative(notification.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
