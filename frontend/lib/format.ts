import { format, formatDistanceToNowStrict, isThisYear, isToday, isYesterday } from 'date-fns';
import type { Channel, ConversationPriority, ConversationStatus, MessageStatus } from './types';

/**
 * Timestamp shown in the conversation list.
 *
 * Precision falls away with age on purpose: for a live queue the useful
 * question is "how long has this been waiting", and by next year it is only
 * "roughly when".
 */
export function formatListTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Yesterday';
  if (isThisYear(date)) return format(date, 'd MMM');
  return format(date, 'd MMM yyyy');
}

export function formatRelative(value: string | null): string {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'never';
  return `${formatDistanceToNowStrict(date)} ago`;
}

export function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'HH:mm');
}

export function formatFullDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'd MMM yyyy, HH:mm');
}

/** Date separator inside a thread. */
export function formatDayLabel(value: string): string {
  const date = new Date(value);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isThisYear(date)) return format(date, 'EEEE, d MMMM');
  return format(date, 'd MMMM yyyy');
}

export function dayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().slice(0, 10);
}

/** Compact duration for analytics tiles: 45s, 12m, 3h 20m, 2d. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const restMinutes = minutes % 60;
    return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

/** Two letters at most: initials are a fallback avatar, not a name. */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}

export const CHANNEL_LABELS: Record<Channel, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  EMAIL: 'Email',
  WEBSITE: 'Website',
  WHATSAPP: 'WhatsApp',
};

/** Maps to the per-channel accents defined once in globals.css. */
export const CHANNEL_COLOR_VAR: Record<Channel, string> = {
  FACEBOOK: 'var(--channel-facebook)',
  INSTAGRAM: 'var(--channel-instagram)',
  EMAIL: 'var(--channel-email)',
  WEBSITE: 'var(--channel-website)',
  WHATSAPP: 'var(--channel-whatsapp)',
};

export const STATUS_LABELS: Record<ConversationStatus, string> = {
  OPEN: 'Open',
  PENDING: 'Pending',
  CLOSED: 'Closed',
};

export const PRIORITY_LABELS: Record<ConversationPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const PRIORITY_ORDER: ConversationPriority[] = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];

export function messageStatusLabel(status: MessageStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Sending';
    case 'SENT':
      return 'Sent';
    case 'DELIVERED':
      return 'Delivered';
    case 'READ':
      return 'Read';
    case 'FAILED':
      return 'Failed';
    default:
      return status;
  }
}

/** One-line preview for the conversation list. */
export function messagePreview(
  content: string | null,
  messageType: string,
  senderType: string,
): string {
  if (content && content.trim()) {
    const prefix = senderType === 'CUSTOMER' ? '' : 'You: ';
    return `${prefix}${content.replace(/\s+/g, ' ').trim()}`;
  }
  switch (messageType) {
    case 'IMAGE':
      return 'Sent an image';
    case 'VIDEO':
      return 'Sent a video';
    case 'AUDIO':
      return 'Sent an audio message';
    case 'FILE':
      return 'Sent a file';
    default:
      return 'No messages yet';
  }
}

/** Turns `conversation.status_changed` into `Conversation status changed`. */
export function humanizeAuditAction(action: string): string {
  const words = action.replace(/[._]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
