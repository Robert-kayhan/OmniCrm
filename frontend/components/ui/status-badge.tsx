import { Badge } from './badge';
import { PRIORITY_LABELS, STATUS_LABELS } from '@/lib/format';
import type { ConversationPriority, ConversationStatus, MessageStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<ConversationStatus, 'default' | 'warning' | 'muted'> = {
  OPEN: 'default',
  PENDING: 'warning',
  CLOSED: 'muted',
};

export function StatusBadge({
  status,
  className,
}: {
  status: ConversationStatus;
  className?: string;
}) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const PRIORITY_VARIANT: Record<
  ConversationPriority,
  'muted' | 'secondary' | 'warning' | 'destructive'
> = {
  LOW: 'muted',
  NORMAL: 'secondary',
  HIGH: 'warning',
  URGENT: 'destructive',
};

/**
 * NORMAL is deliberately not rendered by default. If every row carries a
 * priority chip the chip stops meaning anything, and the urgent ones stop
 * standing out — which is the only reason the field exists.
 */
export function PriorityBadge({
  priority,
  showNormal = false,
  className,
}: {
  priority: ConversationPriority;
  showNormal?: boolean;
  className?: string;
}) {
  if (priority === 'NORMAL' && !showNormal) return null;
  if (priority === 'LOW' && !showNormal) return null;

  return (
    <Badge variant={PRIORITY_VARIANT[priority]} className={className}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

const MESSAGE_STATUS_STYLE: Record<MessageStatus, string> = {
  PENDING: 'text-muted-foreground',
  SENT: 'text-muted-foreground',
  DELIVERED: 'text-muted-foreground',
  READ: 'text-primary',
  FAILED: 'text-destructive',
};

export function messageStatusClass(status: MessageStatus, className?: string): string {
  return cn(MESSAGE_STATUS_STYLE[status], className);
}
