'use client';

import { AlertCircle, Check, CheckCheck, Clock, FileText, Lock } from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { Hint } from '@/components/ui/tooltip';
import { formatBytes, formatMessageTime, messageStatusLabel } from '@/lib/format';
import type { Attachment, Message } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Delivery state, shown only on messages the business sent.
 *
 * A customer's own message has no meaningful status from our side, and putting
 * a tick on it would imply we delivered it.
 */
function DeliveryState({ message }: { message: Message }) {
  if (message.senderType === 'CUSTOMER') return null;

  const label = messageStatusLabel(message.status);

  const icon = (() => {
    switch (message.status) {
      case 'PENDING':
        return <Clock className="size-3" />;
      case 'FAILED':
        return <AlertCircle className="size-3" />;
      case 'READ':
        return <CheckCheck className="size-3" />;
      case 'DELIVERED':
        return <CheckCheck className="size-3" />;
      default:
        return <Check className="size-3" />;
    }
  })();

  return (
    <Hint label={message.failureReason ? `${label}: ${message.failureReason}` : label}>
      <span
        className={cn(
          'inline-flex items-center',
          message.status === 'FAILED' && 'text-destructive',
          message.status === 'READ' && 'text-primary',
        )}
      >
        {icon}
        <span className="sr-only">{label}</span>
      </span>
    </Hint>
  );
}

function AttachmentView({ attachment }: { attachment: Attachment }) {
  if (attachment.type === 'IMAGE') {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-lg border"
      >
        {/* Provider CDNs are not in an allowlist, so a plain <img> avoids
            next/image's remote-host configuration entirely. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name ?? 'Attachment'}
          className="max-h-64 w-auto max-w-full object-cover"
          loading="lazy"
        />
      </a>
    );
  }

  if (attachment.type === 'VIDEO') {
    return (
      <video controls src={attachment.url} className="max-h-64 max-w-full rounded-lg border">
        <track kind="captions" />
      </video>
    );
  }

  if (attachment.type === 'AUDIO') {
    return <audio controls src={attachment.url} className="max-w-full" />;
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-sm transition-colors hover:bg-accent"
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{attachment.name ?? 'Attachment'}</span>
      {attachment.size ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatBytes(attachment.size)}
        </span>
      ) : null}
    </a>
  );
}

export function MessageBubble({
  message,
  showAvatar,
}: {
  message: Message;
  showAvatar: boolean;
}) {
  const fromCustomer = message.senderType === 'CUSTOMER';
  const isSystem = message.senderType === 'SYSTEM';

  if (isSystem) {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-end gap-2',
        fromCustomer ? 'justify-start' : 'flex-row-reverse justify-start',
      )}
    >
      <div className="w-7 shrink-0">
        {showAvatar ? (
          <UserAvatar
            name={fromCustomer ? 'Customer' : (message.sender?.name ?? 'Agent')}
            src={message.sender?.avatar}
            className="size-7 text-[10px]"
          />
        ) : null}
      </div>

      <div className={cn('flex min-w-0 max-w-[min(34rem,75%)] flex-col gap-1')}>
        {message.attachments.length > 0 ? (
          <div className={cn('flex flex-col gap-1.5', !fromCustomer && 'items-end')}>
            {message.attachments.map((attachment) => (
              <AttachmentView key={attachment.id} attachment={attachment} />
            ))}
          </div>
        ) : null}

        {message.content ? (
          <div
            className={cn(
              'w-fit whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm',
              message.isInternal
                ? // An internal note must never be mistaken for something the
                  // customer can see, so it gets its own treatment rather than
                  // just a label.
                  'border border-dashed border-warning/60 bg-warning/10 text-foreground'
                : fromCustomer
                  ? 'rounded-bl-md bg-muted text-foreground'
                  : 'rounded-br-md bg-primary text-primary-foreground',
              !fromCustomer && 'self-end',
              message.status === 'FAILED' && !message.isInternal && 'opacity-70',
            )}
          >
            {message.isInternal ? (
              <span className="mb-1 flex items-center gap-1 text-xs font-medium text-warning-foreground/80">
                <Lock className="size-3" />
                Internal note — not sent to the customer
              </span>
            ) : null}
            {message.content}
          </div>
        ) : null}

        <div
          className={cn(
            'flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground',
            !fromCustomer && 'flex-row-reverse',
          )}
        >
          <span className="tabular-nums">{formatMessageTime(message.createdAt)}</span>
          {!fromCustomer && message.sender ? (
            <span className="truncate">{message.sender.name}</span>
          ) : null}
          {!message.isInternal ? <DeliveryState message={message} /> : null}
        </div>

        {message.status === 'FAILED' && message.failureReason ? (
          <p className={cn('px-1 text-xs text-destructive', !fromCustomer && 'text-right')}>
            {message.failureReason}
          </p>
        ) : null}
      </div>
    </div>
  );
}
