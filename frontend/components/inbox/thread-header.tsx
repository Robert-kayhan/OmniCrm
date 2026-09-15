'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronDown, PanelRightClose, PanelRightOpen, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/ui/avatar';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { StatusBadge } from '@/components/ui/status-badge';
import { Hint } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { PERMISSIONS, useAuth } from '@/lib/auth';
import { CHANNEL_LABELS, PRIORITY_LABELS, STATUS_LABELS } from '@/lib/format';
import { useTeams, useUsers } from '@/lib/hooks';
import { queryKeys } from '@/lib/query-keys';
import { useSocket } from '@/lib/socket';
import type { Conversation, ConversationPriority, ConversationStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const STATUSES: ConversationStatus[] = ['OPEN', 'PENDING', 'CLOSED'];
const PRIORITIES: ConversationPriority[] = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];

export function ThreadHeader({
  conversation,
  panelOpen,
  onTogglePanel,
}: {
  conversation: Conversation;
  panelOpen: boolean;
  onTogglePanel: () => void;
}) {
  const { can, user } = useAuth();
  const { onlineUserIds } = useSocket();
  const queryClient = useQueryClient();

  const canAssign = can(PERMISSIONS.CONVERSATION_ASSIGN);
  const canUpdate = can(PERMISSIONS.CONVERSATION_UPDATE);

  const { data: users } = useUsers(canAssign);
  const { data: teams } = useTeams(canAssign);

  /**
   * Every mutation here refreshes the same two things. The socket also
   * broadcasts the change, but an agent acting on their own conversation should
   * not have to wait for a round trip through the server to see it.
   */
  function afterChange() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversation.id) });
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.conversations.all, 'list'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.stats });
  }

  const setStatus = useMutation({
    mutationFn: (status: ConversationStatus) => api.conversations.setStatus(conversation.id, status),
    onSuccess: (_data, status) => {
      afterChange();
      toast.success(`Marked as ${STATUS_LABELS[status].toLowerCase()}`);
    },
    onError: () => toast.error('Could not change the status'),
  });

  const setPriority = useMutation({
    mutationFn: (priority: ConversationPriority) =>
      api.conversations.setPriority(conversation.id, priority),
    onSuccess: (_data, priority) => {
      afterChange();
      toast.success(`Priority set to ${PRIORITY_LABELS[priority].toLowerCase()}`);
    },
    onError: () => toast.error('Could not change the priority'),
  });

  const assign = useMutation({
    mutationFn: (input: { assignedUserId?: string | null; assignedTeamId?: string | null }) =>
      api.conversations.assign(conversation.id, input),
    onSuccess: () => {
      afterChange();
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.assignments(conversation.id),
      });
      toast.success('Assignment updated');
    },
    onError: () => toast.error('Could not reassign this conversation'),
  });

  const assignee = conversation.assignedUser;
  const assigneeOnline = assignee ? onlineUserIds.includes(assignee.id) : false;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
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
        <p className="truncate text-sm font-semibold">
          {conversation.customer.fullName || 'Unknown customer'}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {CHANNEL_LABELS[conversation.channel]}
          {conversation.customerChannel?.username
            ? ` · ${conversation.customerChannel.username}`
            : ''}
          {conversation.subject ? ` · ${conversation.subject}` : ''}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {canUpdate ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1" disabled={setStatus.isPending}>
                <StatusBadge status={conversation.status} />
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              {STATUSES.map((status) => (
                <DropdownMenuItem key={status} onSelect={() => setStatus.mutate(status)}>
                  <span className="flex-1">{STATUS_LABELS[status]}</span>
                  {conversation.status === status ? <Check className="size-4" /> : null}
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Priority</DropdownMenuLabel>
              {PRIORITIES.map((priority) => (
                <DropdownMenuItem key={priority} onSelect={() => setPriority.mutate(priority)}>
                  <span className="flex-1">{PRIORITY_LABELS[priority]}</span>
                  {conversation.priority === priority ? <Check className="size-4" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <StatusBadge status={conversation.status} />
        )}

        {canAssign ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2" disabled={assign.isPending}>
                {assignee ? (
                  <>
                    <span className="relative">
                      <UserAvatar
                        name={assignee.name}
                        src={assignee.avatar}
                        className="size-5 text-[10px]"
                      />
                      {assigneeOnline ? (
                        <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-success ring-2 ring-background" />
                      ) : null}
                    </span>
                    <span className="max-w-24 truncate">{assignee.name}</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="size-3.5" />
                    Unassigned
                  </>
                )}
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="max-h-96 w-56 overflow-y-auto">
              <DropdownMenuLabel>Assign to</DropdownMenuLabel>

              {user ? (
                <DropdownMenuItem onSelect={() => assign.mutate({ assignedUserId: user.id })}>
                  <UserAvatar name={user.name} src={user.avatar} className="size-5 text-[10px]" />
                  <span className="flex-1">Me</span>
                  {assignee?.id === user.id ? <Check className="size-4" /> : null}
                </DropdownMenuItem>
              ) : null}

              <DropdownMenuItem
                onSelect={() => assign.mutate({ assignedUserId: null, assignedTeamId: null })}
              >
                <span className="flex-1">Unassign</span>
                {!assignee && !conversation.assignedTeam ? <Check className="size-4" /> : null}
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Agents</DropdownMenuLabel>
              {(users?.items ?? [])
                .filter((candidate) => candidate.id !== user?.id)
                .map((candidate) => (
                  <DropdownMenuItem
                    key={candidate.id}
                    onSelect={() => assign.mutate({ assignedUserId: candidate.id })}
                  >
                    <span className="relative">
                      <UserAvatar
                        name={candidate.name}
                        src={candidate.avatar}
                        className="size-5 text-[10px]"
                      />
                      {onlineUserIds.includes(candidate.id) ? (
                        <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-success ring-2 ring-popover" />
                      ) : null}
                    </span>
                    <span className="flex-1 truncate">{candidate.name}</span>
                    {assignee?.id === candidate.id ? <Check className="size-4" /> : null}
                  </DropdownMenuItem>
                ))}

              {teams && teams.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Teams</DropdownMenuLabel>
                  {teams.map((team) => (
                    <DropdownMenuItem
                      key={team.id}
                      onSelect={() => assign.mutate({ assignedTeamId: team.id })}
                    >
                      <span className="flex-1 truncate">{team.name}</span>
                      {conversation.assignedTeam?.id === team.id ? (
                        <Check className="size-4" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : assignee ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserAvatar name={assignee.name} src={assignee.avatar} className="size-5 text-[10px]" />
            {assignee.name}
          </span>
        ) : null}

        <Hint label={panelOpen ? 'Hide customer details' : 'Show customer details'}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onTogglePanel}
            aria-expanded={panelOpen}
            aria-label={panelOpen ? 'Hide customer details' : 'Show customer details'}
            className={cn('hidden xl:inline-flex')}
          >
            {panelOpen ? (
              <PanelRightClose className="size-4" />
            ) : (
              <PanelRightOpen className="size-4" />
            )}
          </Button>
        </Hint>
      </div>
    </header>
  );
}
