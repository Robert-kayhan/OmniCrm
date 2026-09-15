'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ScrollText, Search, X } from 'lucide-react';
import { Topbar } from '@/components/shell/topbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { formatFullDate, humanizeAuditAction } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import { queryKeys } from '@/lib/query-keys';
import type { AuditLog } from '@/lib/types';

const ENTITY_TYPES = [
  { value: 'ALL', label: 'All entities' },
  { value: 'Conversation', label: 'Conversations' },
  { value: 'Customer', label: 'Customers' },
  { value: 'User', label: 'Users' },
  { value: 'Team', label: 'Teams' },
  { value: 'Integration', label: 'Integrations' },
  { value: 'Session', label: 'Sessions' },
];

/**
 * Colours the row by what kind of change it was.
 *
 * Destructive actions need to be findable by eye in a long list — that is
 * usually the reason somebody opened the audit log in the first place.
 */
function actionVariant(action: string): 'destructive' | 'warning' | 'success' | 'muted' {
  if (action.includes('delete') || action.includes('disconnect')) return 'destructive';
  if (action.includes('failed') || action.includes('reuse')) return 'warning';
  if (action.includes('create') || action.includes('connect')) return 'success';
  return 'muted';
}

function ChangeSummary({ log }: { log: AuditLog }) {
  const changes = useMemo(() => {
    const before = (log.oldData ?? {}) as Record<string, unknown>;
    const after = (log.newData ?? {}) as Record<string, unknown>;

    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    return keys
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .slice(0, 4)
      .map((key) => ({
        key,
        from: before[key],
        to: after[key],
      }));
  }, [log.oldData, log.newData]);

  if (changes.length === 0) return null;

  const render = (value: unknown) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <ul className="mt-1 space-y-0.5">
      {changes.map((change) => (
        <li key={change.key} className="text-xs text-muted-foreground">
          <span className="font-medium">{change.key}</span>:{' '}
          <span className="line-through opacity-60">{render(change.from)}</span>{' '}
          <span aria-hidden>→</span> <span className="text-foreground">{render(change.to)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AuditLogPage() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('ALL');
  const [page, setPage] = useState(1);

  const debouncedAction = useDebouncedValue(action, 300);

  const filters = useMemo(
    () => ({
      page,
      limit: 30,
      action: debouncedAction.trim() || undefined,
      entityType: entityType === 'ALL' ? undefined : entityType,
    }),
    [page, debouncedAction, entityType],
  );

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.auditLogs(filters),
    queryFn: () => api.auditLogs.list(filters),
    placeholderData: (previous) => previous,
  });

  const logs = data?.items ?? [];
  const meta = data?.meta;

  return (
    <>
      <Topbar
        title={
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold">Audit log</h1>
            {meta ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                {meta.total} entries
              </span>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
            placeholder="Filter by action, e.g. conversation.assigned"
            className="pl-8.5 font-mono text-xs"
            aria-label="Filter by action"
          />
          {action ? (
            <button
              type="button"
              onClick={() => setAction('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear action filter"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <Select
          value={entityType}
          onValueChange={(value) => {
            setEntityType(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44" aria-label="Filter by entity type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No audit entries match"
            description="Every change to users, teams, integrations, customers and conversations is recorded here. Secrets are redacted before the row is written."
          />
        ) : (
          <ul className="divide-y">
            {logs.map((log) => (
              <li key={log.id} className="flex gap-3 px-4 py-3">
                <UserAvatar
                  name={log.user?.name ?? 'System'}
                  src={log.user?.avatar}
                  className="mt-0.5 size-7 shrink-0 text-[10px]"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{log.user?.name ?? 'System'}</span>
                    <Badge variant={actionVariant(log.action)} className="font-mono text-[10px]">
                      {log.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {humanizeAuditAction(log.action)} · {log.entityType}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatFullDate(log.createdAt)}
                    </span>
                  </div>

                  <ChangeSummary log={log} />

                  {log.ipAddress ? (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">
                      {log.ipAddress}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
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
