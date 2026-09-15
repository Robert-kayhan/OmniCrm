'use client';

import { useMemo, useState } from 'react';
import { Topbar } from '@/components/shell/topbar';
import { ConversationList } from '@/components/inbox/conversation-list';
import { InboxFilters, type InboxFilterState } from '@/components/inbox/inbox-filters';
import { SimulateMenu } from '@/components/inbox/simulate-menu';
import { useConversationStats, useDebouncedValue } from '@/lib/hooks';
import type { ConversationFilters } from '@/lib/api';

const DEFAULT_FILTERS: InboxFilterState = {
  search: '',
  status: [],
  channel: [],
  priority: [],
  tagIds: [],
  assignedUserId: undefined,
  unreadOnly: false,
  sort: 'recent',
};

export default function InboxLayout({ children }: LayoutProps<'/inbox'>) {
  const [filters, setFilters] = useState<InboxFilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const { data: stats } = useConversationStats();

  const query = useMemo<ConversationFilters>(
    () => ({
      page,
      limit: 25,
      search: debouncedSearch.trim() || undefined,
      status: filters.status.length ? filters.status : undefined,
      channel: filters.channel.length ? filters.channel : undefined,
      priority: filters.priority.length ? filters.priority : undefined,
      tagIds: filters.tagIds.length ? filters.tagIds : undefined,
      assignedUserId: filters.assignedUserId,
      unreadOnly: filters.unreadOnly || undefined,
      sort: filters.sort,
    }),
    [page, debouncedSearch, filters],
  );

  function updateFilters(next: InboxFilterState) {
    setFilters(next);
    // Any filter change invalidates the current page number: page 4 of the old
    // result set has nothing to do with page 4 of the new one.
    setPage(1);
  }

  return (
    <>
      <Topbar
        title={
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold">Inbox</h1>
            {stats ? (
              <span className="text-xs text-muted-foreground">
                {stats.byStatus.OPEN ?? 0} open
                {stats.unread > 0 ? ` · ${stats.unread} unread` : ''}
                {stats.assignedToMe > 0 ? ` · ${stats.assignedToMe} yours` : ''}
              </span>
            ) : null}
          </div>
        }
        actions={<SimulateMenu />}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex w-full max-w-96 shrink-0 flex-col border-r lg:w-96">
          <InboxFilters value={filters} onChange={updateFilters} />
          <ConversationList query={query} page={page} onPageChange={setPage} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </>
  );
}
