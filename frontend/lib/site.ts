/**
 * Public-facing brand and SEO settings, kept in one place so a rename or a new
 * domain is a one-file change. Everything here is safe to ship to the browser.
 */

/** Canonical origin. Search engines index this, so set it in production. */
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export const site = {
  name: 'OmniCRM',
  url: siteUrl,
  tagline: 'Every customer conversation, in one inbox.',
  description:
    'OmniCRM is an omnichannel customer inbox for growing teams. Answer Facebook Messenger and Instagram Direct messages from one shared inbox, assign conversations, and see every customer’s full history.',
  keywords: [
    'omnichannel CRM',
    'shared inbox',
    'customer conversation software',
    'Facebook Messenger CRM',
    'Instagram DM inbox',
    'social media inbox',
    'customer support inbox',
    'team inbox for social media',
    'multichannel customer service',
  ],
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'hello@example.com',
} as const;

export const marketingNav = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
] as const;

/** Escapes `<` so a JSON-LD payload cannot close its own script tag. */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
