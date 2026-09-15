'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, UsersRound } from 'lucide-react';
import { Topbar } from '@/components/shell/topbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import { PERMISSIONS, useAuth } from '@/lib/auth';
import { formatRelative } from '@/lib/format';
import { useTeams, useUsers } from '@/lib/hooks';
import { queryKeys } from '@/lib/query-keys';
import { useSocket } from '@/lib/socket';
import type { UserRole } from '@/lib/types';

const ROLES: Array<{ value: UserRole; label: string; hint: string }> = [
  { value: 'AGENT', label: 'Agent', hint: 'Own queue, team queue and unassigned' },
  { value: 'MANAGER', label: 'Manager', hint: 'All conversations, assignment, tags' },
  { value: 'ADMIN', label: 'Admin', hint: 'Users, integrations, audit log' },
  { value: 'SUPER_ADMIN', label: 'Super admin', hint: 'Everything, including org settings' },
];

const ROLE_VARIANT: Record<UserRole, 'muted' | 'secondary' | 'default' | 'success'> = {
  AGENT: 'muted',
  MANAGER: 'secondary',
  ADMIN: 'default',
  SUPER_ADMIN: 'success',
};

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('AGENT');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.users.create({ name: name.trim(), email: email.trim(), password, role }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success('Team member added');
      onOpenChange(false);
      setName('');
      setEmail('');
      setPassword('');
      setError(null);
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not add this person');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a team member</DialogTitle>
          <DialogDescription>
            They can sign in immediately with the password you set here, and should change it on
            first login.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="member-name">Name</Label>
            <Input
              id="member-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Priya Nair"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="priya@company.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="member-password">Temporary password</Label>
            <Input
              id="member-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="member-role">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
              <SelectTrigger id="member-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ROLES.find((option) => option.value === role)?.hint}
            </p>
          </div>

          {error ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !name.trim() || !email.trim() || password.length < 8}
          >
            {create.isPending ? <Spinner /> : null}
            Add member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamPage() {
  const { can, user: currentUser } = useAuth();
  const { onlineUserIds } = useSocket();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: users, isLoading } = useUsers();
  const { data: teams } = useTeams(can(PERMISSIONS.TEAM_READ));

  const canCreate = can(PERMISSIONS.USER_CREATE);
  const canUpdate = can(PERMISSIONS.USER_UPDATE);

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => api.users.update(id, { role }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success('Role updated');
    },
    onError: (caught) =>
      toast.error(caught instanceof ApiError ? caught.message : 'Could not change the role'),
  });

  return (
    <>
      <Topbar
        title="Team"
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <Plus className="size-3.5" />
              Add member
            </Button>
          ) : null
        }
      />

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-12" />
                  ))}
                </div>
              ) : !users || users.items.length === 0 ? (
                <EmptyState icon={UsersRound} title="No team members" className="py-6" />
              ) : (
                <ul className="divide-y">
                  {users.items.map((member) => (
                    <li key={member.id} className="flex items-center gap-3 py-2.5">
                      <span className="relative shrink-0">
                        <UserAvatar name={member.name} src={member.avatar} />
                        {onlineUserIds.includes(member.id) ? (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success ring-2 ring-card"
                            title="Online now"
                          />
                        ) : null}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {member.name}
                          {member.id === currentUser?.id ? (
                            <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.email}
                          {member.teams.length > 0
                            ? ` · ${member.teams.map((team) => team.name).join(', ')}`
                            : ''}
                        </p>
                      </div>

                      <span className="hidden text-xs text-muted-foreground sm:block">
                        {onlineUserIds.includes(member.id)
                          ? 'Online'
                          : `Seen ${formatRelative(member.lastSeenAt)}`}
                      </span>

                      {canUpdate && member.id !== currentUser?.id ? (
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            updateRole.mutate({ id: member.id, role: role as UserRole })
                          }
                        >
                          <SelectTrigger
                            className="h-8 w-36 text-xs"
                            aria-label={`Role for ${member.name}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={ROLE_VARIANT[member.role]} className="shrink-0 capitalize">
                          {member.role.toLowerCase().replace('_', ' ')}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {teams ? (
            <Card>
              <CardHeader>
                <CardTitle>Teams</CardTitle>
              </CardHeader>
              <CardContent>
                {teams.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No teams yet. Teams let a conversation be assigned to a group rather than one
                    person, and every member of that team can see it.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {teams.map((team) => (
                      <li key={team.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{team.name}</p>
                          {team.description ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {team.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex -space-x-2">
                          {team.members.slice(0, 5).map((member) => (
                            <UserAvatar
                              key={member.id}
                              name={member.name}
                              src={member.avatar}
                              className="size-6 text-[10px] ring-2 ring-card"
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {team.memberCount}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  );
}
