'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, MessagesSquare, UserX } from 'lucide-react';
import { Topbar } from '@/components/shell/topbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/ui/empty-state';
import { FullPageSpinner, Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/avatar';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { TagChip } from '@/components/ui/tag-chip';
import { StatusBadge } from '@/components/ui/status-badge';
import { api } from '@/lib/api';
import { PERMISSIONS, useAuth } from '@/lib/auth';
import { CHANNEL_LABELS, formatFullDate, formatRelative } from '@/lib/format';
import { useCustomer } from '@/lib/hooks';
import { queryKeys } from '@/lib/query-keys';

export default function CustomerDetailPage({ params }: PageProps<'/customers/[id]'>) {
  const { id } = use(params);
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const { data: customer, isLoading, error } = useCustomer(id);

  // The customer's threads, so the profile answers "what have we said to them".
  const { data: conversations } = useQuery({
    queryKey: queryKeys.conversations.list({ customerId: id, limit: 50 }),
    queryFn: () => api.conversations.list({ customerId: id, limit: 50, page: 1 }),
    enabled: Boolean(id),
  });

  const { data: notes } = useQuery({
    queryKey: queryKeys.customers.notes(id),
    queryFn: () => api.customers.notes(id),
    enabled: Boolean(id) && can(PERMISSIONS.NOTE_READ),
  });

  const addNote = useMutation({
    mutationFn: (content: string) => api.customers.addNote(id, content),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.notes(id) });
    },
    onError: () => toast.error('Could not save the note'),
  });

  if (isLoading) return <FullPageSpinner label="Loading customer" />;

  if (error || !customer) {
    return (
      <>
        <Topbar title="Customer" />
        <EmptyState
          icon={UserX}
          title="Customer not found"
          description="This person may have been deleted, or belongs to another workspace."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/customers">Back to customers</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <Topbar
        title={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" asChild aria-label="Back to customers">
              <Link href="/customers">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <h1 className="truncate text-sm font-semibold">{customer.fullName}</h1>
          </div>
        }
      />

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <Card>
              <CardContent className="flex flex-col items-center gap-3 pt-5 text-center">
                <UserAvatar
                  name={customer.fullName}
                  src={customer.avatar}
                  className="size-16 text-lg"
                />
                <div>
                  <p className="font-semibold">{customer.fullName}</p>
                  <Badge variant="secondary" className="mt-1 capitalize">
                    {customer.status.toLowerCase()}
                  </Badge>
                </div>

                {customer.tags.length > 0 ? (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {customer.tags.map((tag) => (
                      <TagChip key={tag.id} tag={tag} />
                    ))}
                  </div>
                ) : null}
              </CardContent>

              <Separator />

              <CardContent className="space-y-2.5 pt-4 text-sm">
                <DetailRow label="Email" value={customer.email} />
                <DetailRow label="Phone" value={customer.phone} />
                <DetailRow label="Company" value={customer.company} />
                <DetailRow label="Location" value={customer.location} />
                <DetailRow label="Source" value={customer.source.toLowerCase()} />
                <DetailRow label="First seen" value={formatFullDate(customer.createdAt)} />
                <DetailRow label="Last contact" value={formatRelative(customer.lastContactAt)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Channel identities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {customer.channels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No channel identities linked yet.
                  </p>
                ) : (
                  customer.channels.map((channel) => (
                    <div key={channel.id} className="flex items-center gap-2.5 text-sm">
                      <ChannelIcon channel={channel.channel} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {channel.username ?? channel.externalUserId}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {CHANNEL_LABELS[channel.channel]}
                          {channel.integration ? ` · ${channel.integration.name}` : ''}
                        </p>
                      </div>
                      {channel.profileUrl ? (
                        <a
                          href={channel.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Conversations ({customer.conversationCount})</CardTitle>
              </CardHeader>
              <CardContent>
                {!conversations || conversations.items.length === 0 ? (
                  <EmptyState
                    icon={MessagesSquare}
                    title="No conversations"
                    description="Nothing has been exchanged with this person yet."
                    className="py-6"
                  />
                ) : (
                  <ul className="divide-y">
                    {conversations.items.map((conversation) => (
                      <li key={conversation.id}>
                        <Link
                          href={`/inbox/${conversation.id}`}
                          className="flex items-center gap-3 py-2.5 transition-colors hover:bg-accent/40"
                        >
                          <ChannelIcon channel={conversation.channel} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">
                              {conversation.lastMessage?.content ??
                                conversation.subject ??
                                'No messages'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatRelative(conversation.lastMessageAt)}
                              {conversation.assignedUser
                                ? ` · ${conversation.assignedUser.name}`
                                : ' · unassigned'}
                            </p>
                          </div>
                          <StatusBadge status={conversation.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {can(PERMISSIONS.NOTE_READ) ? (
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {can(PERMISSIONS.NOTE_CREATE) ? (
                    <div className="space-y-2">
                      <Textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        rows={3}
                        placeholder="Anything the team should know about this customer"
                      />
                      <Button
                        size="sm"
                        disabled={!draft.trim() || addNote.isPending}
                        onClick={() => addNote.mutate(draft.trim())}
                      >
                        {addNote.isPending ? <Spinner /> : null}
                        Save note
                      </Button>
                    </div>
                  ) : null}

                  {notes && notes.length > 0 ? (
                    <ul className="space-y-2.5">
                      {notes.map((note) => (
                        <li key={note.id} className="rounded-lg border bg-muted/30 p-3">
                          <p className="whitespace-pre-wrap text-sm">{note.content}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {note.user?.name ?? 'Someone'} · {formatRelative(note.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No notes yet.</p>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right capitalize-none">{value || '—'}</span>
    </div>
  );
}
