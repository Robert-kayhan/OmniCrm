import { AtSign, Facebook, Globe, Instagram, MessageCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CHANNEL_COLOR_VAR, CHANNEL_LABELS } from '@/lib/format';
import type { Channel } from '@/lib/types';
import { cn } from '@/lib/utils';

const ICONS: Record<Channel, LucideIcon> = {
  FACEBOOK: Facebook,
  INSTAGRAM: Instagram,
  EMAIL: AtSign,
  WEBSITE: Globe,
  WHATSAPP: MessageCircle,
};

/**
 * The channel marker used across the inbox.
 *
 * Colour alone would fail for a colour-blind agent, so the icon differs per
 * channel too and every use carries a title.
 */
export function ChannelIcon({
  channel,
  className,
  withBackground = false,
}: {
  channel: Channel;
  className?: string;
  withBackground?: boolean;
}) {
  const Icon = ICONS[channel] ?? Globe;
  const color = CHANNEL_COLOR_VAR[channel];

  if (withBackground) {
    return (
      <span
        className={cn('flex size-5 items-center justify-center rounded-full', className)}
        style={{ backgroundColor: color }}
        title={CHANNEL_LABELS[channel]}
      >
        <Icon className="size-3 text-white" aria-hidden />
        <span className="sr-only">{CHANNEL_LABELS[channel]}</span>
      </span>
    );
  }

  return (
    <span title={CHANNEL_LABELS[channel]} className={cn('inline-flex', className)}>
      <Icon className="size-4" style={{ color }} aria-hidden />
      <span className="sr-only">{CHANNEL_LABELS[channel]}</span>
    </span>
  );
}
