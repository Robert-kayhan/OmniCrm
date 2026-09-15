'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Topbar } from '@/components/shell/topbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/avatar';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatFullDate } from '@/lib/format';

export default function AccountSettingsPage() {
  const { user, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const changePassword = useMutation({
    mutationFn: () => api.auth.changePassword(currentPassword, newPassword),
    onSuccess: async () => {
      // The server revokes every refresh token on a password change, so the
      // session this tab holds is already dead. Signing out is honest about it
      // rather than letting the next request fail mysteriously.
      toast.success('Password changed — sign in again with the new one');
      await logout();
    },
    onError: (caught) => {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not change the password',
      );
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('The new password must be at least 8 characters.');
      return;
    }

    changePassword.mutate();
  }

  if (!user) return null;

  return (
    <>
      <Topbar title="Account" />

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-2xl space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <UserAvatar name={user.name} src={user.avatar} className="size-14 text-base" />
                <div className="min-w-0">
                  <p className="font-medium">{user.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                  <Badge variant="secondary" className="mt-1 capitalize">
                    {user.role.toLowerCase().replace('_', ' ')}
                  </Badge>
                </div>
              </div>

              <Separator />

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Workspace</dt>
                  <dd className="mt-0.5">{user.organization.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Teams</dt>
                  <dd className="mt-0.5">
                    {user.teams.length > 0
                      ? user.teams.map((team) => team.name).join(', ')
                      : 'Not in a team'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Member since</dt>
                  <dd className="mt-0.5">{formatFullDate(user.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Permissions</dt>
                  <dd className="mt-0.5 tabular-nums">{user.permissions.length} granted</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-3" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>

                {error ? (
                  <p
                    role="alert"
                    className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {error}
                  </p>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  Changing the password signs you out of every device.
                </p>

                <Button
                  type="submit"
                  disabled={
                    changePassword.isPending || !currentPassword || !newPassword || !confirmPassword
                  }
                >
                  {changePassword.isPending ? <Spinner /> : null}
                  Change password
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
