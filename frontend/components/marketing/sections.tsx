'use client';

import { useId, useRef, useState } from 'react';
import {
  motion,
  useReducedMotion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT } from './motion';

/** A rule that draws itself from the left when it scrolls into view. */
export function DrawnRule({ className, delay = 0 }: { className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className={cn('block h-0.5 origin-left bg-foreground/85', className)}
      initial={reduce ? false : { scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, amount: 0.8 }}
      transition={{ duration: 0.9, delay, ease: EASE_OUT }}
    />
  );
}

/**
 * The "how it works" steps. A line fills as the section scrolls through the
 * viewport and each step lights up as the line reaches it, so progress is
 * something the visitor does rather than something they read.
 */
export function StepsTimeline({ steps }: { steps: { title: string; body: string }[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.55'] });
  const smoothed = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const complete = useMotionValue(1);
  // Reduced motion shows the finished state: line full, every step lit.
  const progress = reduce ? complete : smoothed;

  return (
    <ol ref={ref} className="relative mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
      {/* Track and fill: vertical on mobile, horizontal from md up. */}
      <span aria-hidden className="absolute top-3 bottom-3 left-[11px] w-px bg-border md:top-[11px] md:right-0 md:bottom-auto md:left-0 md:h-px md:w-auto" />
      <motion.span
        aria-hidden
        className="absolute top-3 bottom-3 left-[11px] w-0.5 -translate-x-1/2 origin-top rounded-full bg-primary md:hidden"
        style={{ scaleY: progress }}
      />
      <motion.span
        aria-hidden
        className="absolute top-[11px] right-0 left-0 hidden h-0.5 -translate-y-1/2 origin-left rounded-full bg-primary md:block"
        style={{ scaleX: progress }}
      />
      {steps.map((step, index) => (
        <Step key={step.title} step={step} index={index} count={steps.length} progress={progress} />
      ))}
    </ol>
  );
}

function Step({
  step,
  index,
  count,
  progress,
}: {
  step: { title: string; body: string };
  index: number;
  count: number;
  progress: MotionValue<number>;
}) {
  const at = index / count + 0.02;
  const lit = useTransform(progress, [at - 0.04, at], [0, 1]);
  const opacity = useTransform(lit, [0, 1], [0.45, 1]);
  const scale = useTransform(lit, [0, 1], [0.7, 1]);

  return (
    <li className="relative pl-12 md:pl-0">
      <span className="absolute top-0 left-0 flex size-6 items-center justify-center rounded-full border bg-background md:relative">
        <motion.span className="size-3 rounded-full bg-primary" style={{ scale, opacity }} />
      </span>
      <motion.div style={{ opacity }}>
        <h3 className="mt-0 text-2xl font-semibold tracking-tight md:mt-7">{step.title}</h3>
        <p className="mt-3 max-w-[36ch] leading-relaxed text-muted-foreground">{step.body}</p>
      </motion.div>
    </li>
  );
}

/**
 * FAQ accordion with animated height. Answers stay in the DOM while collapsed
 * (hidden from assistive tech with `inert`), so crawlers still read them.
 */
export function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();
  const baseId = useId();

  return (
    <div className="border-t">
      {items.map((item, index) => {
        const isOpen = open === index;
        const panelId = `${baseId}-panel-${index}`;
        return (
          <div key={item.q} className="border-b">
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : index)}
                className="group flex w-full items-start justify-between gap-6 py-6 text-left text-lg font-medium tracking-tight"
              >
                <span className="transition-colors group-hover:text-primary">{item.q}</span>
                <motion.span
                  aria-hidden
                  className={cn(
                    'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors',
                    isOpen && 'border-primary bg-primary text-primary-foreground',
                  )}
                  animate={{ rotate: isOpen ? 45 : 0 }}
                  transition={{ duration: reduce ? 0 : 0.35, ease: EASE_OUT }}
                >
                  <Plus className="size-4" />
                </motion.span>
              </button>
            </h3>
            <motion.div
              id={panelId}
              role="region"
              inert={!isOpen}
              initial={false}
              animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.45, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <p className="max-w-[65ch] pb-6 leading-relaxed text-muted-foreground">{item.a}</p>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
