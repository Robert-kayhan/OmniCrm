'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { UserCheck } from 'lucide-react';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { site } from '@/lib/site';
import { EASE_OUT } from './motion';
import { ProductShot } from './product-shot';

/**
 * The hero screenshot: it settles in from a slight tilt on load, then two
 * notification chips arrive to show what the inbox is doing for the team.
 */
export function HeroVisual() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  // Lifts gently as the visitor starts to scroll, so the page feels layered.
  const lift = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -40]);

  return (
    <div className="relative [perspective:1600px] lg:-mr-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]">
      <motion.div
        aria-hidden
        className="absolute -inset-x-6 -top-8 -bottom-10 -z-10 rounded-[2rem] bg-primary/[0.07] lg:rounded-r-none"
        initial={reduce ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: EASE_OUT }}
      />

      <motion.div
        style={{ y: lift }}
        initial={reduce ? false : { opacity: 0, rotateX: 14, y: 60 }}
        animate={{ opacity: 1, rotateX: 0, y: 0 }}
        transition={{ duration: 1.2, delay: 0.25, ease: EASE_OUT }}
        className="origin-bottom"
      >
        <ProductShot
          name="inbox"
          alt={`The ${site.name} inbox: a conversation list, an open Facebook thread with an internal note, and the customer’s profile`}
          width={2880}
          height={1800}
          priority
          sizes="(min-width: 1024px) 62vw, 100vw"
          className="overflow-hidden rounded-xl border bg-card shadow-[0_40px_80px_-32px_oklch(0.4_0.12_262/0.35)] lg:rounded-r-none lg:border-r-0"
          imageClassName="h-auto w-full"
        />
      </motion.div>

      <FloatingChip className="-top-5 left-4 sm:-left-6" delay={1.3} drift={-6}>
        <ChannelIcon channel="INSTAGRAM" withBackground className="size-7 [&_svg]:size-3.5" />
        <span>
          <span className="block text-xs text-muted-foreground">New message</span>
          <span className="block font-medium">Is the blue one in stock?</span>
        </span>
      </FloatingChip>

      <FloatingChip className="right-4 -bottom-6 lg:right-[18%]" delay={1.9} drift={6}>
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <UserCheck className="size-3.5" aria-hidden />
        </span>
        <span>
          <span className="block text-xs text-muted-foreground">Assigned</span>
          <span className="block font-medium">Sales team</span>
        </span>
      </FloatingChip>
    </div>
  );
}

function FloatingChip({
  children,
  className,
  delay,
  drift,
}: {
  children: React.ReactNode;
  className: string;
  delay: number;
  drift: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      className={`absolute z-10 hidden items-center gap-2.5 rounded-xl border bg-card/95 px-3.5 py-2.5 text-sm shadow-[0_16px_40px_-16px_oklch(0.3_0.08_262/0.35)] backdrop-blur sm:flex ${className}`}
      initial={reduce ? false : { opacity: 0, y: 16, scale: 0.92 }}
      animate={
        reduce
          ? { opacity: 1 }
          : { opacity: 1, scale: 1, y: [0, drift, 0] }
      }
      transition={
        reduce
          ? undefined
          : {
              opacity: { duration: 0.5, delay },
              scale: { duration: 0.6, delay, ease: EASE_OUT },
              y: { duration: 5, delay: delay + 0.6, repeat: Infinity, ease: 'easeInOut' },
            }
      }
    >
      {children}
    </motion.div>
  );
}
