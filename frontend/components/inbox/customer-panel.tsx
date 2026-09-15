'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2,
  ExternalLink,
  History,
  Mail,
  MapPin,
  Phone,
  Plus,
  StickyNote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserAvatar } from '@/components/ui/avatar';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { TagChip } from '@/components/ui/tag-chip';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { api } from '@/lib/api';
import { PERMISSIONS, useAuth } from '@/lib/auth';
import { CHANNEL_LABELS, formatFullDate, formatRelative } from '@/lib/format';
import { useTags } from '@/lib/hooks';
import { queryKeys } from '@/lib/query-keys';
import type { Conversation } from '@/lib/types';

function Field({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Mail;
  label: string;
  value: string | null;
  href?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {href ? (
          <a href={href} className="block truncate text-sm hover:underline">
            {value}
          </a>
        ) : (
          <p className="truncate text-sm">{value}</p>
        )}
      </div>
    </div>
  );
}

/** Tag picker limited to tags that already exist — creating them is a settings job. */
function TagEditor({ conversation }: { conversation: Conversation }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data: tags } = useTags(can(PERMISSIONS.TAG_READ));

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.detail(conversation.id),
    });
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.conversations.all, 'list'] });
  };

  const addTag = useMutation({
    mutationFn: (tagId: string) => api.conversations.addTags(conversation.id, [tagId]),
    onSuccess: invalidate,
    onError: () => toast.error('Could not add the tag'),
  });

  const removeTag = useMutation({
    mutationFn: (tagId: string) => api.conversations.removeTag(conversation.id, tagId),
    onSuccess: invalidate,
    onError: () => toast.error('Could not remove the tag'),
  });

  const applied = new Set(conversation.tags.map((tag) => tag.id));
  const available = (tags ?? []).filter((tag) => !applied.has(tag.id));
  const canEdit = can(PERMISSIONS.CONVERSATION_UPDATE);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {conversation.tags.map((tag) => (
        <TagChip
          key={tag.id}
          tag={tag}
          onRemove={canEdit ? () => removeTag.mutate(tag.id) : undefined}
        />
      ))}

      {canEdit ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-xs">
              <Plus className="size-3" />
              Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2">
            {available.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {tags?.length ? 'Every tag is already applied.' : 'No tags exist yet.'}
              </p>
            ) : (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {available.map((tag) => (
                  <li key={tag.id}>
                    <button
                      type="button"
                      onClick={() => addTag.mutate(tag.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                        aria-hidden
                      />
                      <span className="truncate">{tag.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

function NotesTab({ conversation }: { conversation: Conversation }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [draft, setDraft] = useState('');

  const { data: notes, isLoading } = useQuery({
    queryKey: queryKeys.conversations.notes(conversation.id),
    queryFn: () => api.conversations.notes(conversation.id),
    enabled: can(PERMISSIONS.NOTE_READ),
  });

  const addNote = useMutation({
    mutationFn: (content: string) => api.conversations.addNote(conversation.id, content),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.notes(conversation.id),
      });
    },
    onError: () => toast.error('Could not save the note'),
  });

  return (
    <div className="space-y-3">
      {can(PERMISSIONS.NOTE_CREATE) ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a note about this customer for your team"
            rows={3}
            className="text-sm"
          />
          <Button
            size="sm"
            className="w-full"
            disabled={!draft.trim() || addNote.isPending}
            onClick={() => addNote.mutate(draft.trim())}
          >
            {addNote.isPending ? <Spinner /> : null}
            Save note
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading notes…</p>
      ) : notes && notes.length > 0 ? (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border bg-muted/30 p-3">
              <p className="whitespace-pre-wrap text-sm">{note.content}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserAvatar
                  name={note.user?.name}
                  src={note.user?.avatar}
                  className="size-4 text-[9px]"
                />
                {note.user?.name ?? 'Someone'} · {formatRelative(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-xs text-muted-foreground">No notes yet.</p>
      )}
    </div>
  );
}

function HistoryTab({ conversation }: { conversation: Conversation }) {
  const { data: assignments, isLoading } = useQuery({
    queryKey: queryKeys.conversations.assignments(conversation.id),
    queryFn: () => api.conversations.assignments(conversation.id),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading history…</p>;
  if (!assignments || assignments.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        This conversation has never been assigned.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {assignments.map((assignment) => (
        <li key={assignment.id} className="flex gap-2.5">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              {assignment.assignedUser?.name ?? assignment.assignedTeam?.name ?? 'Returned to queue'}
              {assignment.unassignedAt ? null : (
                <Badge variant="success" className="ml-2">
                  Current
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {assignment.assignedBy ? `by ${assignment.assignedBy.name} · ` : ''}
              {formatFullDate(assignment.assignedAt)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CustomerPanel({ conversation }: { conversation: Conversation }) {
  const customer = conversation.customer;
  const channel = conversation.customerChannel;

  return (
    <aside className="scrollbar-thin w-80 shrink-0 overflow-y-auto border-l bg-background p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <UserAvatar
          name={customer.fullName}
          src={customer.avatar ?? channel?.avatar}
          className="size-16 text-lg"
        />
        <div>
          <p className="text-sm font-semibold">{customer.fullName || 'Unknown customer'}</p>
          <p className="text-xs capitalize text-muted-foreground">
            {customer.status.toLowerCase()}
          </p>
        </div>
        <Link
          href={`/customers/${conversation.customerId}`}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Full profile
          <ExternalLink className="size-3" />
        </Link>
      </div>

      <Separator className="my-4" />

      <div className="space-y-3">
        <Field icon={Mail} label="Email" value={customer.email} href={`mailto:${customer.email}`} />
        <Field icon={Phone} label="Phone" value={customer.phone} href={`tel:${customer.phone}`} />
        <Field icon={Building2} label="Company" value={customer.company} />
        <Field
          icon={MapPin}
          label="Channel identity"
          value={channel ? `${CHANNEL_LABELS[channel.channel]} · ${channel.username ?? channel.externalUserId}` : null}
        />
      </div>

      <Separator className="my-4" />

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
        <TagEditor conversation={conversation} />
      </div>

      <Separator className="my-4" />

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Messages</dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums">{conversation.messageCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Opened</dt>
          <dd className="mt-0.5 text-sm font-medium">{formatRelative(conversation.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Channel</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
            <ChannelIcon channel={conversation.channel} />
            {CHANNEL_LABELS[conversation.channel]}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last activity</dt>
          <dd className="mt-0.5 text-sm font-medium">
            {formatRelative(conversation.lastMessageAt)}
          </dd>
        </div>
      </dl>

      <Separator className="my-4" />

      <Tabs defaultValue="notes">
        <TabsList className="w-full">
          <TabsTrigger value="notes" className="flex-1">
            <StickyNote className="size-3.5" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            <History className="size-3.5" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notes">
          <NotesTab conversation={conversation} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab conversation={conversation} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
