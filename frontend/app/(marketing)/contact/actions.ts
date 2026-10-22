'use server';

import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name').max(120),
  email: z.email('Please enter a valid email address').max(254),
  company: z.string().trim().max(160).optional(),
  topic: z.enum(['demo', 'sales', 'support', 'partnership', 'other']),
  message: z.string().trim().min(10, 'Please tell us a little more (10+ characters)').max(5000),
});

export type ContactField = keyof z.infer<typeof contactSchema>;

export type ContactState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string; fieldErrors?: Partial<Record<ContactField, string>> };

/**
 * Validates an enquiry and forwards it as JSON to `CONTACT_WEBHOOK_URL`
 * (Slack, Zapier, Make, a CRM form endpoint...). That variable is server-only,
 * so the destination never reaches the browser.
 *
 * This is a public, unauthenticated action by design — it is a contact form.
 * The honeypot field below filters naive bots; put rate limiting at the edge
 * before relying on it in production.
 */
export async function submitContact(_prev: ContactState, formData: FormData): Promise<ContactState> {
  // Humans never see or fill the `website` field. Pretend success so a bot
  // gets no signal to adapt to.
  if (formData.get('website')) return { status: 'success' };

  const parsed = contactSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    company: formData.get('company') || undefined,
    topic: formData.get('topic'),
    message: formData.get('message'),
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<ContactField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as ContactField;
      fieldErrors[field] ??= issue.message;
    }
    return { status: 'error', message: 'Please check the highlighted fields.', fieldErrors };
  }

  const webhook = process.env.CONTACT_WEBHOOK_URL;
  if (!webhook) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[contact] CONTACT_WEBHOOK_URL is unset; enquiry not forwarded:', parsed.data);
      return { status: 'success' };
    }
    console.error('[contact] CONTACT_WEBHOOK_URL is unset; an enquiry was dropped');
    return { status: 'error', message: 'Our contact form is unavailable right now. Please email us instead.' };
  }

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...parsed.data, submittedAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Webhook answered ${response.status}`);
  } catch (error) {
    console.error('[contact] Failed to forward enquiry', error);
    return { status: 'error', message: 'We could not send your message. Please try again or email us.' };
  }

  return { status: 'success' };
}
