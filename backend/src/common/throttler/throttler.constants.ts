/**
 * The named rate-limit budgets.
 *
 * `default` covers the whole /api surface. The others are deliberately separate
 * pools rather than a tighter version of the same one: a burst of provider
 * webhooks must not consume the budget that real agent traffic needs.
 */
export const THROTTLERS = {
  GLOBAL: 'default',
  /** Credential endpoints, to blunt password spraying. */
  AUTH: 'auth',
  /** Outbound messages are billed by the provider, so they get their own budget. */
  MESSAGE: 'message',
  /** Public provider callbacks. */
  WEBHOOK: 'webhook',
} as const;

export type ThrottlerName = (typeof THROTTLERS)[keyof typeof THROTTLERS];

/** Per-limiter response wording, so a 429 says which budget was exhausted. */
export const THROTTLER_MESSAGES: Record<string, { message: string; code: string }> = {
  [THROTTLERS.GLOBAL]: {
    message: 'Too many requests, please slow down',
    code: 'RATE_LIMITED',
  },
  [THROTTLERS.AUTH]: {
    message: 'Too many authentication attempts. Try again in a few minutes.',
    code: 'AUTH_RATE_LIMITED',
  },
  [THROTTLERS.MESSAGE]: {
    message: 'You are sending messages too quickly',
    code: 'MESSAGE_RATE_LIMITED',
  },
  [THROTTLERS.WEBHOOK]: {
    message: 'Webhook deliveries are arriving too quickly',
    code: 'WEBHOOK_RATE_LIMITED',
  },
};
