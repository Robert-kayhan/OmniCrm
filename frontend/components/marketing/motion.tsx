'use client';

import { useRef } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
  type Variants,
} from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Motion primitives for the marketing pages.
 *
 * Every one of them collapses to a static render under `prefers-reduced-motion`,
 * and none of them hide content from crawlers: the markup is always rendered,
 * only its transform and opacity are animated.
 */

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.8, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
};

/** A list whose items enter one after another. Pair with `StaggerItem`. */
export function Stagger({
  children,
  className,
  as = 'ul',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'ul' | 'ol' | 'div' | 'dl';
}) {
  const reduce = useReducedMotion();
  const Component = motion[as];
  return (
    <Component
      className={className}
      variants={staggerParent}
      initial={reduce ? false : 'hidden'}
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
    >
      {children}
    </Component>
  );
}

export function StaggerItem({
  children,
  className,
  as = 'li',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'li' | 'div';
}) {
  const Component = motion[as];
  return (
    <Component className={className} variants={staggerChild}>
      {children}
    </Component>
  );
}

/** Splits a headline into words that rise in sequence on first paint. */
export function WordsRise({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const words = text.split(' ');
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((word, index) => (
          <span key={`${word}-${index}`} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
            <motion.span
              className="inline-block"
              initial={reduce ? false : { y: '105%' }}
              animate={{ y: 0 }}
              transition={{ duration: 0.9, delay: delay + index * 0.06, ease: EASE_OUT }}
            >
              {word}
              {index < words.length - 1 ? ' ' : ''}
            </motion.span>
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * A surface with a soft highlight that follows the pointer. Motion values keep
 * the pointer tracking outside React's render cycle.
 */
export function SpotlightCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const background = useMotionTemplate`radial-gradient(420px circle at ${x}px ${y}px, color-mix(in oklch, var(--primary) 12%, transparent), transparent 70%)`;

  return (
    <div
      className={cn('group relative overflow-hidden', className)}
      onPointerMove={(event) => {
        if (reduce) return;
        const rect = event.currentTarget.getBoundingClientRect();
        x.set(event.clientX - rect.left);
        y.set(event.clientY - rect.top);
      }}
      onPointerLeave={() => {
        x.set(-400);
        y.set(-400);
      }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background }}
      />
      <div className="relative z-[1] flex h-full flex-col">{children}</div>
    </div>
  );
}

/** Scroll progress of an element through the viewport, 0 → 1. */
export function useSectionProgress(offset: ['start end' | 'start 0.8' | 'start center', 'end start' | 'end center' | 'end 0.6']) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset });
  return { ref, progress: scrollYProgress };
}

/** Moves an element vertically at a different speed from the page. */
export function Parallax({
  children,
  progress,
  distance,
  className,
}: {
  children: React.ReactNode;
  progress: MotionValue<number>;
  distance: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const y = useTransform(progress, [0, 1], [0, reduce ? 0 : distance]);
  return (
    <motion.div className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}
