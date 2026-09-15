'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FlaskConical, MessageSquarePlus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api, ApiError } from '@/lib/api';
import { PERMISSIONS, useAuth } from '@/lib/auth';
import { queryKeys } from '@/lib/query-keys';

const SAMPLE_MESSAGES = [
  'Hi, is this still available?',
  'My order has not arrived yet, can you check?',
  'Do you offer refunds on the annual plan?',
  'Can someone call me back today please?',
];

/**
 * Drives the inbox without a connected Facebook Page.
 *
 * These endpoints run the real ingest path, so the conversations they create
 * behave exactly like live ones — including the socket broadcast, which is what
 * makes this useful for checking that realtime actually works.
 *
 * The menu is hidden entirely without the `dev:tools` permission, and the API
 * answers 404 when ENABLE_DEV_TOOLS is off, so production never shows it.
 */
export function SimulateMenu() {
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
  };

  function reportError(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.status === 404) {
      toast.error('Simulation is switched off', {
        description: 'Set ENABLE_DEV_TOOLS=true in backend/.env and restart the API.',
      });
      return;
    }
    toast.error(fallback);
  }

  const sendOne = useMutation({
    mutationFn: () =>
      api.dev.simulateInbound({
        channel: 'FACEBOOK',
        content:
          SAMPLE_MESSAGES[Math.floor(Math.random() * SAMPLE_MESSAGES.length)] ?? 'Hello there',
        name: 'Simulated Customer',
      }),
    onSuccess: () => {
      refresh();
      toast.success('Inbound message simulated');
    },
    onError: (error) => reportError(error, 'Could not simulate a message'),
  });

  const seed = useMutation({
    mutationFn: () => api.dev.seed({ conversations: 6, messagesPerConversation: 4 }),
    onSuccess: (result) => {
      refresh();
      toast.success(
        `Created ${result.conversations} conversations with ${result.messages} messages`,
      );
    },
    onError: (error) => reportError(error, 'Could not seed sample conversations'),
  });

  const reset = useMutation({
    mutationFn: () => api.dev.reset(),
    onSuccess: (result) => {
      refresh();
      toast.success(`Removed ${result.customersRemoved} simulated customers`);
    },
    onError: (error) => reportError(error, 'Could not clear simulated data'),
  });

  if (!can(PERMISSIONS.DEV_TOOLS)) return null;

  const busy = sendOne.isPending || seed.isPending || reset.isPending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={busy}>
          <FlaskConical className="size-3.5" />
          Simulate
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium text-foreground">Development tools</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Runs the same ingest path a real webhook uses.
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => sendOne.mutate()}>
          <MessageSquarePlus />
          One inbound message
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => seed.mutate()}>
          <Sparkles />
          Seed sample conversations
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => reset.mutate()} className="text-destructive">
          <Trash2 />
          Clear simulated data
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
