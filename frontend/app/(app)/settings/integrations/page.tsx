'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import type {
  ChannelCapability,
  Integration,
  IntegrationStatus,
  SelectablePage,
} from '@/lib/types';

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


/**
 * One connectable inbox.
 *
 * A Page yields one row for Messenger and, when a Professional Instagram
 * account is linked, a second for Instagram Direct. They are separate
 * integrations with separate availability, so the picker flattens them rather
 * than nesting Instagram under its Page.
 */
interface InboxChoice {
  /** Unique per row, since one Page can appear twice. */
  key: string;
  page: SelectablePage;
  channel: 'FACEBOOK' | 'INSTAGRAM';
  name: string;
  subtitle: string;
  pictureUrl: string | null;
  unavailable: boolean;
  connectedHere: boolean;
}

function inboxesForPage(page: SelectablePage): InboxChoice[] {
  const rows: InboxChoice[] = [
    {
      key: `FACEBOOK:${page.id}`,
      page,
      channel: 'FACEBOOK',
      name: page.name,
      subtitle: page.category ?? `Page ${page.id}`,
      pictureUrl: page.pictureUrl,
      unavailable: page.unavailable,
      connectedHere: page.connectedHere,
    },
  ];

  if (page.instagram) {
    const handle = page.instagram.username ? `@${page.instagram.username}` : page.instagram.name;
    rows.push({
      key: `INSTAGRAM:${page.instagram.id}`,
      page,
      channel: 'INSTAGRAM',
      name: handle ?? `Instagram ${page.instagram.id}`,
      subtitle: `Instagram · linked to ${page.name}`,
      pictureUrl: page.instagram.pictureUrl ?? page.pictureUrl,
      unavailable: page.instagram.unavailable,
      connectedHere: page.instagram.connectedHere,
    });
  }

  return rows;
}

/**
 * The Page picker.
 *
 * Opens when the operator lands back from Meta with a handoff id in the URL.
 * The handoff holds the Page tokens server-side; this component only ever sees
 * names and ids, and posts back the id the operator chose.
 */
function FacebookPagePicker({
  handoffId,
  onDone,
}: {
  handoffId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [pendingPageId, setPendingPageId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['facebook-oauth-pages', handoffId],
    queryFn: () => api.integrations.facebookPages(handoffId),
    // The handoff expires in ten minutes; a stale refetch would 404 for a
    // reason the operator cannot act on.
    retry: false,
    staleTime: Infinity,
  });

  const connect = useMutation({
    mutationFn: (choice: InboxChoice) =>
      api.integrations.connectFacebookPage({
        handoffId,
        // Always the Page id: Instagram Direct is reached through the Page it
        // is linked to, and the channel picks which inbox.
        pageId: choice.page.id,
        channel: choice.channel,
        name: choice.name,
      }),
    onMutate: (choice) => setPendingPageId(choice.key),
    onSettled: () => setPendingPageId(null),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });

      const { messagesCreated, threads } = result.import;
      toast.success(
        messagesCreated > 0
          ? `${result.integration.name} connected — imported ${messagesCreated} messages from ${threads} conversations`
          : `${result.integration.name} connected. New messages will appear as they arrive.`,
      );
      onDone();
    },
    onError: (caught) =>
      toast.error(
        caught instanceof ApiError ? caught.message : 'Could not connect that Page. Try again.',
      ),
  });

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onDone())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose a Page</DialogTitle>
          <DialogDescription>
            These are the inboxes your Facebook account administers. A Page with a linked
            Instagram Professional account offers both, and they connect separately. Connecting one
            subscribes it to this app&apos;s webhook and imports its recent conversations.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-14" />
            ))}
          </div>
        ) : error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error instanceof ApiError
              ? error.message
              : 'This Facebook login has expired. Start the connection again.'}
          </p>
        ) : (
          <div className="space-y-2">
            {(data?.pages ?? []).flatMap(inboxesForPage).map((choice) => {
              const busy = connect.isPending && pendingPageId === choice.key;
              return (
                <div key={choice.key} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="relative shrink-0">
                    {choice.pictureUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={choice.pictureUrl}
                        alt=""
                        className="size-9 rounded-full object-cover"
                      />
                    ) : (
                      <div className="size-9 rounded-full bg-muted" />
                    )}
                    {/* Two rows can share one avatar, so the channel badge is
                        what tells a Messenger inbox from an Instagram one. */}
                    <ChannelIcon
                      channel={choice.channel}
                      withBackground
                      className="absolute -bottom-0.5 -right-0.5 size-4 ring-2 ring-background"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{choice.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{choice.subtitle}</p>
                  </div>

                  {choice.unavailable ? (
                    <Badge variant="muted" className="shrink-0">
                      Another workspace
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant={choice.connectedHere ? 'outline' : 'default'}
                      onClick={() => connect.mutate(choice)}
                      disabled={connect.isPending}
                    >
                      {busy ? <Spinner /> : null}
                      {choice.connectedHere ? 'Reconnect' : 'Connect'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The one-click entry point.
 *
 * Asks the API where to send the browser rather than building the Meta URL
 * here — the app id and scopes are server configuration, and duplicating them
 * in the bundle would let the two drift apart.
 */
function ConnectWithFacebookButton({
  disabled,
  label = 'Connect with Facebook',
}: {
  disabled: boolean;
  label?: string;
}) {
  const start = useMutation({
    mutationFn: () => api.integrations.facebookOAuthUrl(),
    onSuccess: ({ authorizeUrl }) => {
      // A full navigation, not a popup: Meta blocks its login dialog inside
      // many popup contexts, and the callback redirects straight back here.
      window.location.href = authorizeUrl;
    },
    onError: (caught) =>
      toast.error(
        caught instanceof ApiError ? caught.message : 'Could not start the Facebook login.',
      ),
  });

  return (
    <Button
      size="sm"
      onClick={() => start.mutate()}
      disabled={disabled || start.isPending}
      className="bg-[#1877F2] text-white hover:bg-[#1877F2]/90"
    >
      {start.isPending ? <Spinner /> : <ChannelIcon channel="FACEBOOK" className="size-3.5" />}
      {label}
    </Button>
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
  const isInstagram = capability.channel === 'INSTAGRAM';
  // Both Meta inboxes are claimed through the same Facebook Login, so the
  // Instagram card offers the same button rather than a second flow.
  const isMeta = isFacebook || isInstagram;

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

        {isMeta && canManage ? (
          <>
            {!capability.configured ? (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                Set <code className="font-mono">META_APP_ID</code>,{' '}
                <code className="font-mono">META_APP_SECRET</code> and{' '}
                <code className="font-mono">META_WEBHOOK_VERIFY_TOKEN</code> in the API environment,
                then restart it before connecting an account.
              </p>
            ) : null}

            {isInstagram ? (
              <p className="text-xs text-muted-foreground">
                Instagram Direct is authorised through Facebook: your Instagram Professional account
                must be linked to a Page you administer.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <ConnectWithFacebookButton
                disabled={!capability.configured}
                label={isInstagram ? 'Connect Instagram via Facebook' : 'Connect with Facebook'}
              />

              {/*
                The original paste-a-token path, kept for the cases OAuth cannot
                serve: a System User token, or a Page whose admin cannot log in
                here. Facebook only — an Instagram inbox has no token of its own
                to paste, since the Page token is what authorises it.
              */}
              {isFacebook ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDialogOpen(true)}
                  disabled={!capability.configured}
                >
                  <Plus className="size-3.5" />
                  Enter a token manually
                </Button>
              ) : null}
            </div>

            {isFacebook ? (
              <ConnectFacebookDialog open={dialogOpen} onOpenChange={setDialogOpen} />
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function IntegrationsPage() {
  const { data: catalogue, isLoading } = useChannelCatalogue();
  const [handoffId, setHandoffId] = useState<string | null>(null);

  /**
   * Strips the OAuth result out of the URL as soon as it is read.
   *
   * Read from `window.location` rather than `useSearchParams` so the page needs
   * no Suspense boundary, and replaced rather than pushed so Back does not
   * re-trigger a spent handoff.
   */
  const clearCallbackParams = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('fb_handoff');
    url.searchParams.delete('fb_error');
    window.history.replaceState({}, '', url.toString());
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoff = params.get('fb_handoff');
    const failure = params.get('fb_error');

    // Reading the URL is a genuine external-system sync and happens exactly
    // once, on the mount that follows Meta's redirect. A lazy useState
    // initializer would be the usual alternative, but it reads `window` during
    // render and so hydrates differently from the server's null.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (handoff) setHandoffId(handoff);
    if (failure) toast.error(failure);
    if (handoff || failure) clearCallbackParams();
  }, [clearCallbackParams]);

  return (
    <>
      <Topbar title="Integrations" />

      {handoffId ? (
        <FacebookPagePicker handoffId={handoffId} onDone={() => setHandoffId(null)} />
      ) : null}

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
