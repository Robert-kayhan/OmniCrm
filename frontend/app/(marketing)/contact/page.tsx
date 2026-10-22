import type { Metadata } from 'next';
import { Mail } from 'lucide-react';
import { ContactForm } from '@/components/marketing/contact-form';
import { ContactSteps } from '@/components/marketing/contact-steps';
import { WordsRise } from '@/components/marketing/motion';
import { jsonLd, site } from '@/lib/site';

const description = `Contact the ${site.name} team to book a demo, ask about pricing or get help connecting Facebook Messenger and Instagram to your shared inbox.`;

export const metadata: Metadata = {
  title: 'Contact us',
  description,
  alternates: { canonical: '/contact' },
  openGraph: { url: '/contact', title: `Contact ${site.name}`, description, images: '/opengraph-image' },
};

const NEXT_STEPS = [
  {
    title: 'We read it and reply',
    body: 'A real person answers, usually within one business day.',
  },
  {
    title: 'A short walkthrough',
    body: 'Twenty minutes, using your own Page and Instagram account if you like.',
  },
  {
    title: 'Help getting connected',
    body: 'We stay with you until your messages are flowing into the inbox.',
  },
];

export default function ContactPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: `Contact ${site.name}`,
    url: `${site.url}/contact`,
    description,
    mainEntity: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
      contactPoint: {
        '@type': 'ContactPoint',
        email: site.contactEmail,
        contactType: 'customer support',
        availableLanguage: ['English'],
      },
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />

      <section className="mx-auto grid max-w-7xl gap-14 px-4 pt-14 pb-24 sm:px-6 md:pt-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:pb-32">
        <div className="lg:pt-6">
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl">
            <WordsRise text="Tell us how your team handles messages" />
          </h1>
          <p
            className="animate-rise mt-6 max-w-[44ch] text-lg leading-relaxed text-muted-foreground"
            style={{ '--delay': '400ms' } as React.CSSProperties}
          >
            A demo, a pricing question or a hand connecting your channels. Send a note and we will
            take it from there.
          </p>

          <ContactSteps steps={NEXT_STEPS} />

          <div
            className="animate-rise mt-12 flex items-center gap-3 border-t pt-8"
            style={{ '--delay': '1300ms' } as React.CSSProperties}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail className="size-[18px]" aria-hidden />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Prefer email?</p>
              <a
                href={`mailto:${site.contactEmail}`}
                className="font-medium underline-offset-4 hover:text-primary hover:underline"
              >
                {site.contactEmail}
              </a>
            </div>
          </div>
        </div>

        <div
          className="animate-rise relative self-start"
          style={{ '--delay': '250ms' } as React.CSSProperties}
        >
          <div
            aria-hidden
            className="absolute -inset-4 -z-10 rounded-[2rem] bg-primary/[0.07] sm:-inset-6"
          />
          <ContactForm />
        </div>
      </section>
    </>
  );
}
