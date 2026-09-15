'use client';

import { useEffect, useRef, useState } from 'react';
import { Lock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { ApiError } from '@/lib/api';
import { PERMISSIONS, useAuth } from '@/lib/auth';
import { useSendMessage } from '@/lib/hooks';
import { useSocket } from '@/lib/socket';
import type { Conversation } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Typing events are throttled so a fast typist does not flood the socket. */
const TYPING_PING_MS = 2_000;

/**
 * The reply box.
 *
 * Switching threads must not carry a half-typed reply into the next one. That
 * reset is done by keying this component on the conversation id at the call
 * site, so React discards the state — clearing it from an effect would render
 * the previous thread's draft for one frame first.
 */
export function Composer({ conversation }: { conversation: Conversation }) {
  const { can } = useAuth();
  const { startTyping, stopTyping } = useSocket();
  const send = useSendMessage(conversation.id);

  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastTypingPing = useRef(0);

  const canSend = can(PERMISSIONS.MESSAGE_SEND);
  const canReply = Boolean(conversation.integrationId && conversation.customerChannelId);
  const closed = conversation.status === 'CLOSED';

  // Grow with the content up to a ceiling, so a long reply is readable without
  // the composer eating the thread.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [content]);

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(event.target.value);

    if (isInternal) return;
    const now = Date.now();
    if (now - lastTypingPing.current > TYPING_PING_MS) {
      lastTypingPing.current = now;
      startTyping(conversation.id);
    }
  }

  async function submit() {
    const trimmed = content.trim();
    if (!trimmed || send.isPending) return;

    // Cleared before the request so the composer feels instant. Restored below
    // if the send fails, so nothing an agent typed is ever silently lost.
    setContent('');
    stopTyping(conversation.id);

    try {
      await send.mutateAsync({ content: trimmed, isInternal });
    } catch (error) {
      setContent(trimmed);
      const message =
        error instanceof ApiError
          ? error.message
          : 'The message could not be sent. Check your connection.';
      toast.error('Message not sent', { description: message });
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter is a newline — the convention every chat app
    // shares, and the one agents' fingers already know.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  if (!canSend) {
    return (
      <div className="border-t px-4 py-3 text-center text-sm text-muted-foreground">
        You do not have permission to send messages.
      </div>
    );
  }

  const blockedReason = !canReply
    ? 'This conversation is not connected to a channel, so replies cannot be delivered. You can still add an internal note.'
    : null;

  const sendDisabled = send.isPending || !content.trim() || (!isInternal && !canReply);

  return (
    <div className="border-t bg-background">
      {closed ? (
        <p className="border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
          This conversation is closed. Sending a message will not reopen it — change the status
          above if you want it back in the queue.
        </p>
      ) : null}

      {blockedReason && !isInternal ? (
        <p className="border-b bg-warning/10 px-4 py-2 text-xs text-warning-foreground">
          {blockedReason}
        </p>
      ) : null}

      <div className="p-3">
        <div
          className={cn(
            'rounded-xl border transition-colors focus-within:border-ring',
            isInternal && 'border-dashed border-warning/60 bg-warning/5',
          )}
        >
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={() => stopTyping(conversation.id)}
            rows={1}
            placeholder={
              isInternal
                ? 'Write a note for your team — the customer will not see this'
                : `Reply to ${conversation.customer.fullName || 'this customer'}`
            }
            className="min-h-11 border-0 bg-transparent shadow-none focus-visible:outline-none"
            aria-label={isInternal ? 'Internal note' : 'Reply to customer'}
          />

          <div className="flex items-center gap-2 px-3 pb-2">
            <Button
              type="button"
              variant={isInternal ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setIsInternal((current) => !current)}
              aria-pressed={isInternal}
              className="gap-1.5"
            >
              <Lock className="size-3.5" />
              Internal note
            </Button>

            <span className="ml-auto text-xs text-muted-foreground">
              <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">Enter</kbd> to send
            </span>

            <Button type="button" size="sm" onClick={() => void submit()} disabled={sendDisabled}>
              {send.isPending ? <Spinner /> : <Send className="size-3.5" />}
              {isInternal ? 'Add note' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
