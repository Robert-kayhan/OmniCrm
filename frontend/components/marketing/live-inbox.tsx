'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { UserCheck } from 'lucide-react';
import { MessageBubble } from '@/components/inbox/message-bubble';
import { UserAvatar } from '@/components/ui/avatar';
import { ChannelIcon } from '@/components/ui/channel-icon';
import type { Message } from '@/lib/types';
import { EASE_OUT } from './motion';

/**
 * A scripted replay of one conversation, rendered with the inbox's own
 * `MessageBubble` so the page shows the real product UI rather than a drawing
 * of it. It plays only while on screen and shows the finished thread, without
 * movement, to visitors who prefer reduced motion.
 */

const AGENT = { id: 'agent', name: 'Aisha Nair', avatar: null, role: 'AGENT' as const };

function message(id: string, minute: number, fields: Partial<Message>): Message {
  const at = new Date(2026, 0, 1, 10, minute).toISOString();
  return {
    id,
    conversationId: 'demo',
    organizationId: 'demo',
    senderType: 'CUSTOMER',
    senderUserId: null,
    externalMessageId: null,
    messageType: 'TEXT',
    content: null,
    isInternal: false,
    status: 'READ',
    failureReason: null,
    deliveredAt: at,
    readAt: at,
    createdAt: at,
    updatedAt: at,
    sender: null,
    attachments: [],
    ...fields,
  };
}

type Step =
  | { kind: 'message'; message: Message; typingFirst?: boolean }
  | { kind: 'assign' };

const SCRIPT: Step[] = [
  { kind: 'message', message: message('m1', 41, { content: 'Hi! Is the linen tote back in stock?' }) },
  {
    kind: 'message',
    typingFirst: true,
    message: message('m2', 42, {
      senderType: 'AGENT',
      senderUserId: AGENT.id,
      sender: AGENT,
      content: 'It is, we restocked this morning. Want me to hold one for you?',
    }),
  },
  {
    kind: 'message',
    message: message('m3', 43, {
      senderType: 'AGENT',
      senderUserId: AGENT.id,
      sender: AGENT,
      isInternal: true,
      content: 'Asked about the tote last week too. Offer free shipping.',
    }),
  },
  { kind: 'message', message: message('m4', 44, { content: 'Yes please! Can it ship to Pune?' }) },
  { kind: 'assign' },
];

const STEP_MS = 1700;
const TYPING_MS = 1100;
const HOLD_MS = 3600;

export function LiveInbox() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  // Opens with the customer's first message already showing, so the card is never empty.
  const [shown, setShown] = useState(1);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (reduce || !inView) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (shown >= SCRIPT.length) {
      timers.push(setTimeout(() => setShown(1), HOLD_MS));
    } else {
      const next = SCRIPT[shown];
      const typingFirst = next.kind === 'message' && next.typingFirst;
      const wait = STEP_MS;
      if (typingFirst) {
        timers.push(setTimeout(() => setTyping(true), wait));
        timers.push(
          setTimeout(() => {
            setTyping(false);
            setShown((value) => value + 1);
          }, wait + TYPING_MS),
        );
      } else {
        timers.push(setTimeout(() => setShown((value) => value + 1), wait));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [shown, inView, reduce]);

  const visible = SCRIPT.slice(0, reduce ? SCRIPT.length : shown);
  const assigned = visible.some((step) => step.kind === 'assign');

  return (
    <div ref={ref} className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="relative">
          <UserAvatar name="Priya Kulkarni" className="size-9 text-xs" />
          <ChannelIcon channel="INSTAGRAM" withBackground className="absolute -right-1 -bottom-1 size-4 ring-2 ring-card" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">Priya Kulkarni</p>
          <p className="truncate text-xs text-muted-foreground">Instagram · @priya.makes</p>
        </div>
        <motion.span
          layout
          className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
          animate={{
            backgroundColor: assigned ? 'var(--primary)' : 'var(--background)',
            color: assigned ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
          }}
          transition={{ duration: 0.4 }}
        >
          <UserCheck className="size-3.5" aria-hidden />
          {assigned ? 'Sales team' : 'Unassigned'}
        </motion.span>
      </div>

      <div className="flex min-h-[320px] flex-1 flex-col justify-end gap-3 p-4" aria-live="off">
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((step, index) =>
            step.kind === 'message' ? (
              <motion.div
                key={step.message.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.25 } }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
              >
                <MessageBubble
                  message={step.message}
                  showAvatar={visible[index + 1]?.kind !== 'message' || (visible[index + 1] as { message: Message }).message.senderType !== step.message.senderType}
                />
              </motion.div>
            ) : (
              <motion.div
                key="assign"
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.25 } }}
                transition={{ duration: 0.45, ease: EASE_OUT }}
                className="flex justify-center"
              >
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  Aisha Nair assigned this to Sales
                </span>
              </motion.div>
            ),
          )}
          {typing ? (
            <motion.div
              key="typing"
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              className="flex items-center justify-end gap-2 pr-9 text-xs text-muted-foreground"
            >
              Aisha is typing
              <span className="flex gap-0.5">
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    className="size-1 rounded-full bg-muted-foreground"
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: dot * 0.12 }}
                  />
                ))}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
