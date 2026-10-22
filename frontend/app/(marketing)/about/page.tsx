import type { Metadata } from 'next';
import { AboutHeroVisual, ScrollText } from '@/components/marketing/about-visuals';
import { CallToAction } from '@/components/marketing/call-to-action';
import { Reveal, Stagger, StaggerItem, WordsRise } from '@/components/marketing/motion';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { jsonLd, site } from '@/lib/site';
import type { Channel } from '@/lib/types';

const description = `Why we built ${site.name}: one inbox for every customer conversation, so growing teams answer faster and never lose a thread between apps.`;

export const metadata: Metadata = {
  title: 'About us',
  description,
  alternates: { canonical: '/about' },
  openGraph: { url: '/about', title: `About ${site.name}`, description, images: '/opengraph-image' },
};

const PRINCIPLES = [
  {
    title: 'One customer, one conversation',
    body: 'A customer should never have to repeat themselves because they moved from Instagram to Messenger. Every channel lands on the same profile, with the same history.',
  },
  {
    title: 'Clear ownership beats more people',
    body: 'Most missed messages are not a staffing problem. They are a “who has this?” problem. Every conversation in the inbox has an owner, and every hand-off is recorded.',
  },
  {
    title: 'Trust is part of the product',
    body: 'Your customers’ messages are private. Workspaces are isolated, channel tokens are encrypted at rest, and permissions are checked on the server for every request.',
  },
  {
    title: 'Numbers you can act on',
    body: 'First-response time, time to close and agent activity, measured from what actually happened in the inbox rather than estimated.',
  },
];

const AVAILABLE: { channel: Channel; label: string; body: string }[] = [
  {
    channel: 'FACEBOOK',
    label: 'Facebook Messenger',
    body: 'Connect a Page with Facebook Login. Recent conversations import, new ones arrive live.',
  },
  {
    channel: 'INSTAGRAM',
    label: 'Instagram Direct',
    body: 'Any Instagram professional account linked to your Page, in the same inbox.',
  },
];

const PLANNED: { channel: Channel; label: string }[] = [
  { channel: 'WHATSAPP', label: 'WhatsApp Business' },
  { channel: 'EMAIL', label: 'Email' },
  { channel: 'WEBSITE', label: 'Website chat widget' },
];

export default function AboutPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: `About ${site.name}`,
    url: `${site.url}/about`,
    description,
    mainEntity: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
      email: site.contactEmail,
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />

      {/* Hero: statement on the left, a composition of real product views on the right. */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 md:pt-20 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:pb-28">
          <div>
            <p className="animate-rise text-sm font-medium text-primary">About {site.name}</p>
            <h1 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-[3.25rem]">
              <WordsRise text="Customers think in conversations, not channels" delay={0.05} />
            </h1>
            <p
              className="animate-rise mt-6 max-w-[50ch] text-lg leading-relaxed text-muted-foreground"
              style={{ '--delay': '500ms' } as React.CSSProperties}
            >
              So we built one inbox where every message, owner and customer detail lives together.
            </p>
          </div>

          <AboutHeroVisual />
        </div>
      </section>

      {/* Statement: words brighten as the reader scrolls through it. */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-36">
        <ScrollText
          text="Customers don’t care which app they used to reach you. They care that someone answered quickly, and remembered what they said last time."
          className="max-w-5xl text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl md:text-5xl"
        />
      </section>

      {/* Story: a narrow reading column, the way an essay is set. */}
      <section aria-labelledby="story-heading" className="border-y bg-muted/50">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-24 sm:px-6 md:py-28 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-20">
          <h2 id="story-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Why we built it
          </h2>
          <Reveal className="max-w-[62ch] space-y-6 text-lg leading-relaxed text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">
                More and more businesses sell and support through direct messages.
              </span>{' '}
              A stock question arrives on Instagram, a delivery query on Messenger, a follow-up by
              email. Each one lives in a different app, owned by whoever happened to be logged in.
            </p>
            <p>
              That works for a while. Then the volume grows, a second person starts helping, and
              messages begin to slip. Two people answer the same customer. Nobody answers another.
              The refund someone promised on Tuesday is forgotten by Friday.
            </p>
            <p>
              {site.name} puts all of those conversations into one shared inbox. Every message is
              linked to a single customer, every conversation has a clear owner, and the whole team
              sees changes the moment they happen.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Principles: full-width rows, title left and explanation right. */}
      <section aria-labelledby="principles-heading" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32">
        <h2
          id="principles-heading"
          className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl"
        >
          What we hold ourselves to
        </h2>
        <Stagger as="div" className="mt-14 border-t">
          {PRINCIPLES.map((principle) => (
            <StaggerItem
              as="div"
              key={principle.title}
              className="group relative grid gap-3 border-b py-9 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16"
            >
              <span
                aria-hidden
                className="absolute top-0 left-0 h-0.5 w-full origin-left scale-x-0 bg-primary transition-transform duration-500 ease-out group-hover:scale-x-100"
              />
              <h3 className="text-xl font-semibold tracking-tight transition-[color,translate] duration-300 group-hover:translate-x-1 group-hover:text-primary sm:text-2xl">
                {principle.title}
              </h3>
              <p className="max-w-[60ch] text-lg leading-relaxed text-muted-foreground">{principle.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Channels: what exists today versus what is planned, stated plainly. */}
      <section aria-labelledby="channels-heading" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 md:pb-32">
        <h2 id="channels-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Where we are today
        </h2>
        <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Reveal className="rounded-2xl border p-7 sm:p-9">
            <p className="text-sm font-medium text-muted-foreground">Available now</p>
            <ul className="mt-6 grid gap-8 sm:grid-cols-2">
              {AVAILABLE.map((item) => (
                <li key={item.channel}>
                  <span className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
                    <ChannelIcon channel={item.channel} className="[&_svg]:size-5" />
                    {item.label}
                  </span>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{item.body}</p>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1} className="rounded-2xl bg-muted/70 p-7 sm:p-9">
            <p className="text-sm font-medium text-muted-foreground">On the roadmap</p>
            <ul className="mt-6 space-y-4">
              {PLANNED.map((item) => (
                <li key={item.channel} className="flex items-center gap-3 text-lg font-medium">
                  <ChannelIcon channel={item.channel} className="[&_svg]:size-5" />
                  {item.label}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              Each one plugs into the same inbox, so your team’s workflow stays the same.
            </p>
          </Reveal>
        </div>
      </section>

      <CallToAction title="See it with your own messages" />
    </>
  );
}
