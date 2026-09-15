'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Link2Off, Plug, Plus } from 'lucide-react';
import { Topbar } from '@/components/shell/topbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ChannelIcon } from '@/components/ui/channel-icon';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { api, API_BASE_URL, ApiError } from '@/lib/api';
import { PERMISSIONS, useAuth } from '@/lib/auth';
import { formatRelative } from '@/lib/format';
import { useChannelCatalogue } from '@/lib/hooks';
import { queryKeys } from '@/lib/query-keys';
import type { ChannelCapability, Integration, IntegrationStatus } from '@/lib/types';

const STATUS_BADGE: Record<IntegrationStatus, { variant: 'success' | 'warning' | 'muted' | 'destructive'; label: string }> = {
  CONNECTED: { variant: 'success', label: 'Connected' },
  PENDING: { variant: 'warning', label: 'Pending' },
  DISCONNECTED: { variant: 'muted', label: 'Disconnected' },
  ERROR: { variant: 'destructive', label: 'Error' },
};

function ConnectFacebookDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [pageId, setPageId] = useState('');
  const [pageAccessToken, setPageAccessToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const connect = useMutation({
    mutationFn: () =>
      api.integrations.connectFacebook({
        name: name.trim(),
        pageId: pageId.trim(),
        pageAccessToken: pageAccessToken.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all });
      toast.success('Facebook Page connected');
      onOpenChange(false);
      setName('');
      setPageId('');
      setPageAccessToken('');
      setError(null);
    },
    onError: (caught) => {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not connect the Page. Check the values and try again.',
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a Facebook Page</DialogTitle>
          <DialogDescription>
            Paste a long-lived Page access token from the Meta app dashboard. It is encrypted before
            it is stored and is never returned by the API.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="integration-name">Display name</Label>
            <Input
              id="integration-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Support"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="page-id">Page ID</Label>
            <Input
              id="page-id"
              value={pageId}
              onChange={(event) => setPageId(event.target.value)}
              placeholder="123456789012345"
              inputMode="numeric"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="page-token">Page access token</Label>
            <Input
              id="page-token"
              type="password"
              value={pageAccessToken}
              onChange={(event) => setPageAccessToken(event.target.value)}
              placeholder="EAAG..."
              autoComplete="off"
            />
          </div>

          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Webhook settings for the Meta app</p>
            <p>
              Callback URL:{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">
                {API_BASE_URL}/api/webhooks/facebook
              </code>
            </p>
            <p className="mt-1">
              Verify token: the value of <code className="font-mono">META_WEBHOOK_VERIFY_TOKEN</code>{' '}
              in the API environment. Subscribe to the <code className="font-mono">messages</code>{' '}
              and <code className="font-mono">messaging_postbacks</code> fields.
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
            onClick={() => connect.mutate()}
            disabled={connect.isPending || !name.trim() || !pageId.trim() || !pageAccessToken.trim()}
          >
            {connect.isPending ? <Spinner /> : null}
            Connect Page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationRow({ integration }: { integration: Integration }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const badge = STATUS_BADGE[integration.status];

  const disconnect = useMutation({
    mutationFn: () => api.integrations.disconnect(integration.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all });
      toast.success('Integration disconnected');
    },
    onError: () => toast.error('Could not disconnect this integration'),
  });

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{integration.name}</p>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>

        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {integration.externalPageId ? `Page ${integration.externalPageId}` : 'No page bound'} ·{' '}
          {integration.conversationCount} conversations · {integration.customerChannelCount}{' '}
          identities
        </p>

        {integration.lastError ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            {integration.lastError}
          </p>
        ) : null}

        {integration.lastSyncedAt ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Last synced {formatRelative(integration.lastSyncedAt)}
          </p>
        ) : null}
      </div>

      {can(PERMISSIONS.INTEGRATION_MANAGE) && integration.status !== 'DISCONNECTED' ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 text-destructive">
              <Link2Off className="size-3.5" />
              Disconnect
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect {integration.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                The stored access token is destroyed and no new messages will arrive from this Page.
                Existing conversations and history are kept, so reconnecting later restores the
                inbox intact.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => disconnect.mutate()}>Disconnect</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

function ChannelCard({ capability }: { capability: ChannelCapability }) {
  const { can } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const canManage = can(PERMISSIONS.INTEGRATION_MANAGE);
  const isFacebook = capability.channel === 'FACEBOOK';

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <ChannelIcon channel={capability.channel} withBackground className="size-8" />
        <div className="min-w-0 flex-1">
          <CardTitle>{capability.displayName}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {!capability.available
              ? 'Not built in this release — messages can be read but not sent.'
              : capability.configured
                ? 'Ready to connect'
                : 'Server credentials missing'}
          </p>
        </div>

        {capability.available ? (
          capability.configured ? (
            <Badge variant="success" className="shrink-0">
              <CheckCircle2 className="size-3" />
              Available
            </Badge>
          ) : (
            <Badge variant="warning" className="shrink-0">
              Not configured
            </Badge>
          )
        ) : (
          <Badge variant="muted" className="shrink-0">
            Coming soon
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {capability.integrations.length > 0 ? (
          <div className="space-y-2">
            {capability.integrations.map((integration) => (
              <IntegrationRow key={integration.id} integration={integration} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {capability.available
              ? 'No accounts connected yet.'
              : 'A provider for this channel has not been implemented yet. It plugs into the same conversation system when it is.'}
          </p>
        )}

        {isFacebook && canManage ? (
          <>
            {!capability.configured ? (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                Set <code className="font-mono">META_APP_ID</code>,{' '}
                <code className="font-mono">META_APP_SECRET</code> and{' '}
                <code className="font-mono">META_WEBHOOK_VERIFY_TOKEN</code> in the API environment,
                then restart it before connecting a Page.
              </p>
            ) : null}

            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialogOpen(true)}
              disabled={!capability.configured}
            >
              <Plus className="size-3.5" />
              Connect a Page
            </Button>

            <ConnectFacebookDialog open={dialogOpen} onOpenChange={setDialogOpen} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function IntegrationsPage() {
  const { data: catalogue, isLoading } = useChannelCatalogue();

  return (
    <>
      <Topbar title="Integrations" />

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          <p className="text-sm text-muted-foreground">
            Every channel the product knows about. A channel becomes available when a provider is
            implemented for it; each one plugs into the same conversation system, so adding one
            changes nothing about how the inbox works.
          </p>

          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-40" />
              ))}
            </div>
          ) : !catalogue || catalogue.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Plug className="mx-auto mb-2 size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No channels available.</p>
            </div>
          ) : (
            catalogue.map((capability) => (
              <ChannelCard key={capability.channel} capability={capability} />
            ))
          )}
        </div>
      </div>
    </>
  );
}
