'use client';

import { motion, useReducedMotion } from 'motion/react';
import { EASE_OUT } from './motion';

/** The "what happens next" list: the rail draws down, each step lands on it. */
export function ContactSteps({ steps }: { steps: { title: string; body: string }[] }) {
  const reduce = useReducedMotion();

  return (
    <ol className="relative mt-12 space-y-8 pl-7">
      <motion.span
        aria-hidden
        className="absolute top-1 bottom-1 left-0 w-px origin-top bg-border"
        initial={reduce ? false : { scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 1.1, delay: 0.5, ease: EASE_OUT }}
      />
      {steps.map((step, index) => (
        <motion.li
          key={step.title}
          className="relative"
          initial={reduce ? false : { opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.7 + index * 0.18, ease: EASE_OUT }}
        >
          <motion.span
            aria-hidden
            className="absolute top-1.5 -left-[33px] size-[11px] rounded-full border-2 border-background bg-primary ring-1 ring-primary/40"
            initial={reduce ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.75 + index * 0.18 }}
          />
          <h2 className="font-semibold tracking-tight">{step.title}</h2>
          <p className="mt-1 text-muted-foreground">{step.body}</p>
        </motion.li>
      ))}
    </ol>
  );
}
