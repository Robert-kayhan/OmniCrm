'use client';

import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { EASE_OUT } from './motion';
import { ProductShot } from './product-shot';

/**
 * Two real product views that drift apart at different speeds as the page
 * scrolls, which reads as depth without any decorative illustration.
 */
export function AboutHeroVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const backY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);
  const frontY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 50]);

  return (
    <div ref={ref} className="relative mx-auto h-[420px] w-full max-w-md sm:h-[480px] lg:max-w-none">
      <motion.div
        aria-hidden
        className="absolute inset-x-6 inset-y-4 -z-10 rounded-[2rem] bg-primary/[0.07]"
        initial={reduce ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: EASE_OUT }}
      />
      <motion.div
        className="absolute top-0 right-0 w-[78%]"
        style={{ y: backY }}
        initial={reduce ? false : { opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1.1, delay: 0.2, ease: EASE_OUT }}
      >
        <ProductShot
          name="thread"
          alt="A customer conversation with agent replies and an internal note"
          width={1000}
          height={980}
          priority
          sizes="(min-width: 1024px) 30vw, 80vw"
          className="overflow-hidden rounded-xl border bg-card shadow-[0_30px_60px_-28px_oklch(0.4_0.12_262/0.4)]"
          imageClassName="h-auto w-full"
        />
      </motion.div>
      <motion.div
        className="absolute bottom-0 left-0 h-[62%] w-[44%]"
        style={{ y: frontY }}
        initial={reduce ? false : { opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, delay: 0.45, ease: EASE_OUT }}
      >
        <ProductShot
          name="profile"
          alt="The customer profile shown beside each conversation"
          width={640}
          height={1000}
          sizes="(min-width: 1024px) 16vw, 45vw"
          className="h-full overflow-hidden rounded-xl border bg-card shadow-[0_30px_60px_-24px_oklch(0.4_0.12_262/0.45)]"
          imageClassName="h-auto w-full"
        />
      </motion.div>
    </div>
  );
}

/**
 * A statement whose words brighten one by one as it scrolls through the
 * viewport, so the reader's eye moves with the sentence.
 */
export function ScrollText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] });
  const words = text.split(' ');

  return (
    <p ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((word, index) => (
          <Word
            key={`${word}-${index}`}
            progress={scrollYProgress}
            range={[index / words.length, (index + 1) / words.length]}
            reduce={!!reduce}
          >
            {word}
          </Word>
        ))}
      </span>
    </p>
  );
}

function Word({
  children,
  progress,
  range,
  reduce,
}: {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
  reduce: boolean;
}) {
  const opacity = useTransform(progress, range, [0.18, 1]);
  return (
    <motion.span className="inline-block" style={{ opacity: reduce ? 1 : opacity }}>
      {children}&nbsp;
    </motion.span>
  );
}
