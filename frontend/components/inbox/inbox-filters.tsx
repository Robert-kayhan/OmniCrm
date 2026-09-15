'use client';

import { Filter, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TagChip } from '@/components/ui/tag-chip';
import { CHANNEL_LABELS, PRIORITY_LABELS, STATUS_LABELS } from '@/lib/format';
import { useTags } from '@/lib/hooks';
import { PERMISSIONS, useAuth } from '@/lib/auth';
import type { Channel, ConversationPriority, ConversationStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface InboxFilterState {
  search: string;
  status: ConversationStatus[];
  channel: Channel[];
  priority: ConversationPriority[];
  tagIds: string[];
  /** An id, `me`, or `unassigned`. */
  assignedUserId: string | undefined;
  unreadOnly: boolean;
  sort: 'recent' | 'oldest' | 'priority';
}

const STATUSES: ConversationStatus[] = ['OPEN', 'PENDING', 'CLOSED'];
const CHANNELS: Channel[] = ['FACEBOOK', 'INSTAGRAM', 'EMAIL', 'WEBSITE', 'WHATSAPP'];
const PRIORITIES: ConversationPriority[] = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];

/** Toggles one value in a filter array without mutating it. */
function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function InboxFilters({
  value,
  onChange,
}: {
  value: InboxFilterState;
  onChange: (next: InboxFilterState) => void;
}) {
  const { can } = useAuth();
  const { data: tags } = useTags(can(PERMISSIONS.TAG_READ));

  const activeCount =
    value.status.length +
    value.channel.length +
    value.priority.length +
    value.tagIds.length +
    (value.assignedUserId ? 1 : 0) +
    (value.unreadOnly ? 1 : 0);

  const selectedTags = (tags ?? []).filter((tag) => value.tagIds.includes(tag.id));

  const set = (patch: Partial<InboxFilterState>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-2 border-b p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value.search}
          onChange={(event) => set({ search: event.target.value })}
          placeholder="Search people and messages"
          className="pl-8.5"
          aria-label="Search conversations"
        />
        {value.search ? (
          <button
            type="button"
            onClick={() => set({ search: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="size-3.5" />
              Filters
              {activeCount > 0 ? (
                <Badge variant="default" className="ml-0.5 px-1.5 tabular-nums">
                  {activeCount}
                </Badge>
              ) : null}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="max-h-[70vh] w-56 overflow-y-auto">
            <DropdownMenuLabel>Assignment</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={value.assignedUserId === 'me'}
              onCheckedChange={(checked) => set({ assignedUserId: checked ? 'me' : undefined })}
            >
              Assigned to me
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={value.assignedUserId === 'unassigned'}
              onCheckedChange={(checked) =>
                set({ assignedUserId: checked ? 'unassigned' : undefined })
              }
            >
              Unassigned
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={value.unreadOnly}
              onCheckedChange={(checked) => set({ unreadOnly: Boolean(checked) })}
            >
              Unread only
            </DropdownMenuCheckboxItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {STATUSES.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={value.status.includes(status)}
                onCheckedChange={() => set({ status: toggle(value.status, status) })}
              >
                {STATUS_LABELS[status]}
              </DropdownMenuCheckboxItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Channel</DropdownMenuLabel>
            {CHANNELS.map((channel) => (
              <DropdownMenuCheckboxItem
                key={channel}
                checked={value.channel.includes(channel)}
                onCheckedChange={() => set({ channel: toggle(value.channel, channel) })}
              >
                {CHANNEL_LABELS[channel]}
              </DropdownMenuCheckboxItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Priority</DropdownMenuLabel>
            {PRIORITIES.map((priority) => (
              <DropdownMenuCheckboxItem
                key={priority}
                checked={value.priority.includes(priority)}
                onCheckedChange={() => set({ priority: toggle(value.priority, priority) })}
              >
                {PRIORITY_LABELS[priority]}
              </DropdownMenuCheckboxItem>
            ))}

            {tags && tags.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Tags</DropdownMenuLabel>
                {tags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag.id}
                    checked={value.tagIds.includes(tag.id)}
                    onCheckedChange={() => set({ tagIds: toggle(value.tagIds, tag.id) })}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: tag.color }}
                        aria-hidden
                      />
                      {tag.name}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <Select
          value={value.sort}
          onValueChange={(sort) => set({ sort: sort as InboxFilterState['sort'] })}
        >
          <SelectTrigger className="h-8 w-auto flex-1 text-xs" aria-label="Sort conversations">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most recent</SelectItem>
            <SelectItem value="oldest">Longest waiting</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {activeCount > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {value.assignedUserId ? (
            <FilterPill
              label={value.assignedUserId === 'me' ? 'Mine' : 'Unassigned'}
              onRemove={() => set({ assignedUserId: undefined })}
            />
          ) : null}
          {value.unreadOnly ? (
            <FilterPill label="Unread" onRemove={() => set({ unreadOnly: false })} />
          ) : null}
          {value.status.map((status) => (
            <FilterPill
              key={status}
              label={STATUS_LABELS[status]}
              onRemove={() => set({ status: toggle(value.status, status) })}
            />
          ))}
          {value.channel.map((channel) => (
            <FilterPill
              key={channel}
              label={CHANNEL_LABELS[channel]}
              onRemove={() => set({ channel: toggle(value.channel, channel) })}
            />
          ))}
          {value.priority.map((priority) => (
            <FilterPill
              key={priority}
              label={PRIORITY_LABELS[priority]}
              onRemove={() => set({ priority: toggle(value.priority, priority) })}
            />
          ))}
          {selectedTags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              onRemove={() => set({ tagIds: toggle(value.tagIds, tag.id) })}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FilterPill({
  label,
  onRemove,
  className,
}: {
  label: string;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground',
        className,
      )}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="opacity-60 transition-opacity hover:opacity-100"
        aria-label={`Remove filter ${label}`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
