'use client';

import { useActionState, useState } from 'react';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { submitContact, type ContactField, type ContactState } from '@/app/(marketing)/contact/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const TOPICS = [
  { value: 'demo', label: 'Book a demo' },
  { value: 'sales', label: 'Pricing' },
  { value: 'support', label: 'Support' },
  { value: 'partnership', label: 'Partnerships' },
  { value: 'other', label: 'Something else' },
];

const initialState: ContactState = { status: 'idle' };

const fieldClass = 'h-11 rounded-lg bg-background px-3.5 text-[15px] shadow-none focus-visible:border-primary';

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitContact, initialState);
  const [topic, setTopic] = useState(TOPICS[0].value);
  const reduce = useReducedMotion();

  if (state.status === 'success') {
    return (
      <motion.div
        role="status"
        className="flex min-h-[480px] flex-col justify-center rounded-2xl border bg-card p-10 sm:p-12"
        initial={reduce ? false : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.span
          className="inline-flex w-fit"
          initial={reduce ? false : { scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.15 }}
        >
          <CheckCircle2 className="size-10 text-success" aria-hidden />
        </motion.span>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight">Thanks, your message is on its way</h2>
        <p className="mt-3 max-w-[40ch] text-muted-foreground">
          We usually reply within one business day. Keep an eye on your inbox, including spam, just
          in case.
        </p>
      </motion.div>
    );
  }

  const fieldError = (field: ContactField) =>
    state.status === 'error' ? state.fieldErrors?.[field] : undefined;

  return (
    <form action={formAction} className="rounded-2xl border bg-card p-6 shadow-sm sm:p-10" noValidate>
      <h2 className="text-xl font-semibold tracking-tight">Send us a message</h2>

      <fieldset className="mt-8">
        <legend className="text-sm font-medium">What can we help with?</legend>
        <LayoutGroup>
          <div className="mt-3 flex flex-wrap gap-2">
            {TOPICS.map((option) => {
              const selected = topic === option.value;
              return (
                <label key={option.value} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name="topic"
                    value={option.value}
                    checked={selected}
                    onChange={() => setTopic(option.value)}
                    className="peer sr-only"
                  />
                  {/* One highlight that slides between pills as the choice changes. */}
                  {selected ? (
                    <motion.span
                      layoutId="topic-highlight"
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-primary"
                      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  ) : null}
                  <span
                    className={cn(
                      'relative inline-flex h-9 items-center rounded-full border px-4 text-sm transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
                      selected ? 'border-primary text-primary-foreground' : 'bg-background hover:border-foreground/30',
                    )}
                  >
                    {option.label}
                  </span>
                </label>
              );
            })}
          </div>
        </LayoutGroup>
      </fieldset>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <Field id="name" label="Full name" error={fieldError('name')}>
          <Input id="name" name="name" autoComplete="name" required className={fieldClass} aria-invalid={!!fieldError('name')} />
        </Field>
        <Field id="email" label="Work email" error={fieldError('email')}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            className={fieldClass}
            aria-invalid={!!fieldError('email')}
          />
        </Field>
      </div>

      <div className="mt-6">
        <Field id="company" label="Company" hint="Optional" error={fieldError('company')}>
          <Input id="company" name="company" autoComplete="organization" className={fieldClass} />
        </Field>
      </div>

      <div className="mt-6">
        <Field id="message" label="Message" error={fieldError('message')}>
          <Textarea
            id="message"
            name="message"
            rows={5}
            required
            className="min-h-36 rounded-lg bg-background px-3.5 py-3 text-[15px] shadow-none focus-visible:border-primary"
            placeholder="How many people answer messages, and which channels do you use?"
            aria-invalid={!!fieldError('message')}
          />
        </Field>
      </div>

      {/* Honeypot: hidden from people and assistive tech, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="mt-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">We only use your details to reply to you.</p>
        <Button type="submit" size="lg" className="h-11 px-6 active:scale-[0.98]" disabled={pending}>
          {pending ? <Spinner /> : null}
          {pending ? 'Sending' : 'Send message'}
          {pending ? null : <ArrowRight />}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      <div className={cn(error && '[&_input]:border-destructive [&_textarea]:border-destructive')}>{children}</div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
