'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search, Users, X } from 'lucide-react';
import { Topbar } from '@/components/shell/topbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/ui/avatar';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { TagChip } from '@/components/ui/tag-chip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatRelative } from '@/lib/format';
import { useCustomers, useDebouncedValue } from '@/lib/hooks';
import type { CustomerStatus } from '@/lib/types';

const STATUSES: Array<{ value: CustomerStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'LEAD', label: 'Lead' },
  { value: 'PROSPECT', label: 'Prospect' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'LOST', label: 'Lost' },
];

const STATUS_VARIANT: Record<CustomerStatus, 'default' | 'secondary' | 'success' | 'muted'> = {
  LEAD: 'secondary',
  PROSPECT: 'default',
  CUSTOMER: 'success',
  INACTIVE: 'muted',
  LOST: 'muted',
};

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatus | 'ALL'>('ALL');
  const [sort, setSort] = useState<'recent' | 'created' | 'name'>('recent');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search, 300);

  const filters = useMemo(
    () => ({
      page,
      limit: 25,
      search: debouncedSearch.trim() || undefined,
      status: status === 'ALL' ? undefined : [status],
      sort,
    }),
    [page, debouncedSearch, status, sort],
  );

  const { data, isLoading } = useCustomers(filters);
  const customers = data?.items ?? [];
  const meta = data?.meta;

  return (
    <>
      <Topbar
        title={
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold">Customers</h1>
            {meta ? (
              <span className="text-xs text-muted-foreground tabular-nums">{meta.total} total</span>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by name, email, phone, company or channel handle"
            className="pl-8.5"
            aria-label="Search customers"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as CustomerStatus | 'ALL');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
          <SelectTrigger className="w-44" aria-label="Sort customers">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recently contacted</SelectItem>
            <SelectItem value="created">Newest first</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No customers match"
            description="Customers are created automatically the first time somebody writes in on any channel."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Channels</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Tags</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Conversations</th>
                <th className="px-4 py-2.5 font-medium">Last contact</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map((customer) => (
                <tr key={customer.id} className="transition-colors hover:bg-accent/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="flex items-center gap-2.5 hover:underline"
                    >
                      <UserAvatar
                        name={customer.fullName}
                        src={customer.avatar}
                        className="size-8"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{customer.fullName}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {customer.email ?? customer.phone ?? customer.company ?? '—'}
                        </span>
                      </span>
                    </Link>
                  </td>

                  <td className="hidden px-4 py-2.5 md:table-cell">
                    <span className="flex items-center gap-1">
                      {customer.channels.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        customer.channels
                          .slice(0, 4)
                          .map((channel) => (
                            <ChannelIcon key={channel.id} channel={channel.channel} />
                          ))
                      )}
                    </span>
                  </td>

                  <td className="hidden px-4 py-2.5 lg:table-cell">
                    <span className="flex flex-wrap gap-1">
                      {customer.tags.slice(0, 2).map((tag) => (
                        <TagChip key={tag.id} tag={tag} />
                      ))}
                      {customer.tags.length > 2 ? (
                        <span className="text-xs text-muted-foreground">
                          +{customer.tags.length - 2}
                        </span>
                      ) : null}
                    </span>
                  </td>

                  <td className="px-4 py-2.5">
                    <Badge variant={STATUS_VARIANT[customer.status]} className="capitalize">
                      {customer.status.toLowerCase()}
                    </Badge>
                  </td>

                  <td className="hidden px-4 py-2.5 tabular-nums sm:table-cell">
                    {customer.conversationCount}
                  </td>

                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {formatRelative(customer.lastContactAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            Page {meta.page} of {meta.totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={!meta.hasPreviousPage}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="size-3.5" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!meta.hasNextPage}
              onClick={() => setPage(page + 1)}
            >
              Next
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
