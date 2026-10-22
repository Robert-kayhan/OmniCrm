'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { Inbox } from 'lucide-react';
import { ChannelIcon } from '@/components/ui/channel-icon';
import type { Channel } from '@/lib/types';
import { EASE_OUT } from './motion';

/**
 * Channels on the left, one inbox on the right, and messages travelling along
 * the lines between them. Live channels carry traffic; planned ones are drawn
 * dashed and stay still, so the picture never claims more than exists.
 */

const W = 600;
const H = 400;
const INBOX = { x: 500, y: 200 };

const CHANNELS: { channel: Channel; label: string; live: boolean; y: number }[] = [
  { channel: 'FACEBOOK', label: 'Messenger', live: true, y: 56 },
  { channel: 'INSTAGRAM', label: 'Instagram', live: true, y: 128 },
  { channel: 'WHATSAPP', label: 'WhatsApp', live: false, y: 200 },
  { channel: 'EMAIL', label: 'Email', live: false, y: 272 },
  { channel: 'WEBSITE', label: 'Website chat', live: false, y: 344 },
];

const pathFor = (y: number) => `M 150 ${y} C 320 ${y}, 330 ${INBOX.y}, ${INBOX.x - 44} ${INBOX.y}`;

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

export function ChannelFlow() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // Traffic starts only once the lines have been drawn in view.
  const inView = useInView(ref, { once: true, amount: 0.4 });

  return (
    <div ref={ref} className="relative mx-auto aspect-[3/2] w-full max-w-xl" role="img" aria-label="Messenger and Instagram messages flowing into one inbox, with WhatsApp, email and website chat planned">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" aria-hidden>
        {CHANNELS.map((item, index) => (
          <g key={item.channel}>
            <motion.path
              d={pathFor(item.y)}
              fill="none"
              stroke={item.live ? `var(--channel-${item.channel.toLowerCase()})` : 'var(--muted-foreground)'}
              strokeWidth={item.live ? 2 : 1.25}
              strokeOpacity={item.live ? 1 : 0.35}
              strokeDasharray={item.live ? undefined : '5 6'}
              strokeLinecap="round"
              // Live lines draw themselves; planned ones fade in so their dashes survive
              // (animating pathLength rewrites stroke-dasharray).
              initial={reduce ? false : item.live ? { pathLength: 0, opacity: 0 } : { opacity: 0 }}
              whileInView={item.live ? { pathLength: 1, opacity: 0.55 } : { opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 1.2, delay: 0.15 + index * 0.1, ease: EASE_OUT }}
            />
            {item.live && !reduce && inView
              ? [0, 1].map((pulse) => (
                  <circle key={pulse} r={4} fill={`var(--channel-${item.channel.toLowerCase()})`}>
                    <animateMotion
                      dur="2.6s"
                      begin={`${index * 0.7 + pulse * 1.3}s`}
                      repeatCount="indefinite"
                      path={pathFor(item.y)}
                      keyPoints="0;1"
                      keyTimes="0;1"
                      calcMode="spline"
                      keySplines="0.4 0 0.2 1"
                    />
                  </circle>
                ))
              : null}
          </g>
        ))}
      </svg>

      {CHANNELS.map((item, index) => (
        <motion.div
          key={item.channel}
          className="absolute flex -translate-y-1/2 items-center gap-2.5"
          style={{ left: 0, top: pct(item.y, H) }}
          initial={reduce ? false : { opacity: 0, x: -16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, delay: index * 0.08, ease: EASE_OUT }}
        >
          <span
            className={`flex size-10 items-center justify-center rounded-xl border bg-card shadow-sm ${item.live ? '' : 'opacity-60'}`}
          >
            <ChannelIcon channel={item.channel} className="[&_svg]:size-5" />
          </span>
          <span className={`hidden text-sm sm:inline ${item.live ? 'font-medium' : 'text-muted-foreground'}`}>
            {item.label}
          </span>
        </motion.div>
      ))}

      <motion.div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
        style={{ left: pct(INBOX.x, W), top: pct(INBOX.y, H) }}
        initial={reduce ? false : { opacity: 0, scale: 0.8 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.7, delay: 0.5, ease: EASE_OUT }}
      >
        <span className="relative flex size-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_20px_40px_-12px_oklch(0.45_0.2_262/0.55)]">
          {reduce ? null : (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-2xl border-2 border-primary"
              animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
          <Inbox className="size-8" aria-hidden />
        </span>
        <span className="text-sm font-semibold">One inbox</span>
      </motion.div>
    </div>
  );
}
