'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Clock, Inbox, MessageSquare, TrendingUp, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Topbar } from '@/components/shell/topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { VolumeChart } from '@/components/analytics/volume-chart';
import { api } from '@/lib/api';
import { CHANNEL_LABELS, PRIORITY_LABELS, STATUS_LABELS, formatDuration, formatNumber } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 pt-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="size-4 text-primary" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** A labelled proportion bar — used for the status, channel and priority splits. */
function BreakdownBar({
  rows,
}: {
  rows: Array<{ key: string; label: React.ReactNode; count: number }>;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  if (total === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Nothing in this period.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const share = Math.round((row.count / total) * 100);
        return (
          <li key={row.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">{row.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatNumber(row.count)} · {share}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState('30');

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.analytics({ days: Number(days) }),
    queryFn: () => api.analytics.overview({ days: Number(days) }),
  });

  return (
    <>
      <Topbar
        title="Analytics"
        actions={
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-8 w-36 text-xs" aria-label="Reporting period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((range) => (
                <SelectItem key={range.value} value={range.value}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : isError || !data ? (
          <EmptyState
            icon={BarChart3}
            title="Could not load analytics"
            description="Reporting needs workspace-wide visibility. If you are an agent, ask a manager to share these numbers."
          />
        ) : (
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                icon={Inbox}
                label="Conversations opened"
                value={formatNumber(data.totals.conversationsOpened)}
                hint={`${formatNumber(data.totals.conversationsClosed)} closed`}
              />
              <StatTile
                icon={MessageSquare}
                label="Messages exchanged"
                value={formatNumber(data.totals.messagesInbound + data.totals.messagesOutbound)}
                hint={`${formatNumber(data.totals.messagesInbound)} in · ${formatNumber(
                  data.totals.messagesOutbound,
                )} out`}
              />
              <StatTile
                icon={Clock}
                label="Median first response"
                value={formatDuration(data.responseTime.medianFirstResponseSeconds)}
                hint={
                  data.responseTime.answeredConversations > 0
                    ? `across ${formatNumber(data.responseTime.answeredConversations)} answered`
                    : 'no answered conversations yet'
                }
              />
              <StatTile
                icon={UserPlus}
                label="New customers"
                value={formatNumber(data.totals.newCustomers)}
                hint={`${formatNumber(data.totals.openNow)} conversations open now`}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Message volume</CardTitle>
              </CardHeader>
              <CardContent>
                <VolumeChart data={data.volume} />
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>By channel</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownBar
                    rows={data.byChannel.map((row) => ({
                      key: row.channel,
                      label: (
                        <>
                          <ChannelIcon channel={row.channel} />
                          <span className="truncate">{CHANNEL_LABELS[row.channel]}</span>
                        </>
                      ),
                      count: row.conversations,
                    }))}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>By status</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownBar
                    rows={data.byStatus.map((row) => ({
                      key: row.status,
                      label: <span>{STATUS_LABELS[row.status]}</span>,
                      count: row.count,
                    }))}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>By priority</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownBar
                    rows={data.byPriority.map((row) => ({
                      key: row.priority,
                      label: <span>{PRIORITY_LABELS[row.priority]}</span>,
                      count: row.count,
                    }))}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Agent activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.agents.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No agent activity in this period.
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="pb-2 font-medium">Agent</th>
                          <th className="pb-2 text-right font-medium">Replies sent</th>
                          <th className="pb-2 text-right font-medium">Assigned</th>
                          <th className="pb-2 text-right font-medium">Closed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.agents.map((agent) => (
                          <tr key={agent.userId}>
                            <td className="py-2">
                              <span className="flex items-center gap-2">
                                <UserAvatar
                                  name={agent.name}
                                  src={agent.avatar}
                                  className="size-6 text-[10px]"
                                />
                                <span className="truncate">{agent.name}</span>
                              </span>
                            </td>
                            <td className="py-2 text-right tabular-nums">{agent.messagesSent}</td>
                            <td className="py-2 text-right tabular-nums">
                              {agent.conversationsAssigned}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {agent.conversationsClosed}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Resolution</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Average first response</span>
                      <span className="font-medium tabular-nums">
                        {formatDuration(data.responseTime.averageFirstResponseSeconds)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Average time to close</span>
                      <span className="font-medium tabular-nums">
                        {formatDuration(data.responseTime.averageResolutionSeconds)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Unassigned now</span>
                      <span className="font-medium tabular-nums">
                        {formatNumber(data.totals.unassignedNow)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Unread now</span>
                      <span className="font-medium tabular-nums">
                        {formatNumber(data.totals.unreadNow)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Top tags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data.tags.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No tags applied in this period.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {data.tags.map((tag) => (
                          <li key={tag.id} className="flex items-center justify-between gap-2">
                            <TagChip tag={tag} />
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {tag.count}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <p className="flex items-center justify-center gap-1.5 pb-2 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5" />
              Covering {data.range.days} days across the whole workspace.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
