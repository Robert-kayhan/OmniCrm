import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Layers, Lock, RefreshCw, ShieldCheck, Users, Zap } from 'lucide-react';
import { CallToAction } from '@/components/marketing/call-to-action';
import { ChannelFlow } from '@/components/marketing/channel-flow';
import { HeroVisual } from '@/components/marketing/hero-visual';
import { LiveInbox } from '@/components/marketing/live-inbox';
import { Reveal, SpotlightCard, Stagger, StaggerItem, WordsRise } from '@/components/marketing/motion';
import { ProductShot } from '@/components/marketing/product-shot';
import { DrawnRule, FaqAccordion, StepsTimeline } from '@/components/marketing/sections';
import { Button } from '@/components/ui/button';
import { jsonLd, site } from '@/lib/site';

export const metadata: Metadata = {
  // The root layout's default title is the home page title; only the
  // canonical needs setting here.
  alternates: { canonical: '/' },
};

const PROBLEMS = [
  {
    title: 'Messages slip through the cracks',
    body: 'A DM sits unread in one app while the whole team is busy in another. The customer gives up and buys elsewhere.',
  },
  {
    title: 'Two people reply, or nobody does',
    body: 'Without clear ownership, customers get duplicate answers or silence, and nobody can say who dropped it.',
  },
  {
    title: 'Context lives in one person’s head',
    body: 'The order number, the refund you promised, last month’s complaint. When that person is off, it is gone.',
  },
  {
    title: 'You can’t see how fast you respond',
    body: 'Response time decides who wins the sale. Most small teams have no idea what theirs is.',
  },
];

const REASONS = [
  {
    icon: ShieldCheck,
    title: 'Connected the official way',
    body: 'Pages connect through Facebook Login and Meta’s own APIs. No scraping, no browser extensions, no shared passwords.',
  },
  {
    icon: RefreshCw,
    title: 'Business Suite replies stay in sync',
    body: 'If a colleague answers from Meta Business Suite on their phone, that reply still appears in the conversation.',
  },
  {
    icon: Zap,
    title: 'Live for the whole team',
    body: 'New messages, typing and hand-offs show up instantly for everyone, without refreshing.',
  },
  {
    icon: Lock,
    title: 'Your data stays yours',
    body: 'Every workspace is isolated from every other, and channel access tokens are encrypted at rest.',
  },
  {
    icon: Users,
    title: 'Roles that match your team',
    body: 'Admins, managers and agents each see what they should, checked on the server for every request.',
  },
  {
    icon: Layers,
    title: 'New channels, same workflow',
    body: 'WhatsApp, email and website chat will arrive in the same inbox, so nobody has to learn a new tool.',
  },
];

const STEPS = [
  {
    title: 'Connect',
    body: 'Sign in with Facebook and pick the Pages and Instagram accounts to bring in. Recent conversations import automatically.',
  },
  {
    title: 'Invite',
    body: 'Add your agents and managers, group them into teams, and decide who handles what.',
  },
  {
    title: 'Reply',
    body: 'Answer from one inbox. Each reply goes out on the channel the customer wrote on.',
  },
];

const FAQS = [
  {
    q: 'What is an omnichannel CRM?',
    a: `It is one system that collects customer conversations from several channels, such as Facebook Messenger, Instagram and email, and links them to a single customer record. ${site.name} gives your team one shared inbox instead of a tab for every app.`,
  },
  {
    q: 'Which channels can I connect?',
    a: 'Facebook Messenger and Instagram Direct are available today. WhatsApp, email and a website chat widget are on the roadmap.',
  },
  {
    q: 'Do I need a developer to set it up?',
    a: 'No. You connect your Facebook Page and Instagram account by signing in with Facebook, then pick which inboxes to bring in.',
  },
  {
    q: 'Can several people work in the same inbox?',
    a: 'Yes. Conversations can be assigned to a person or a team, and everyone sees new messages and replies in real time, so nobody answers twice.',
  },
  {
    q: 'Will customers notice anything different?',
    a: 'No. They keep messaging your Page or Instagram account as usual, and your replies arrive in the same Messenger or Instagram thread.',
  },
  {
    q: 'Is my customer data secure?',
    a: 'Each organization’s data is isolated, channel access tokens are encrypted at rest, and permissions are enforced on the server for every request.',
  },
];

export default function HomePage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: site.name,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: site.description,
        url: site.url,
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQS.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <Hero />
      <Channels />
      <Problems />
      <Solution />
      <WhyUs />
      <HowItWorks />
      <Faq />
      <CallToAction />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-4 pt-14 pb-20 sm:px-6 md:pt-20 lg:grid-cols-[minmax(0,11fr)_minmax(0,13fr)] lg:gap-10 lg:pb-28">
        <div className="max-w-xl">
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-[3.25rem]">
            <WordsRise text="One inbox for every customer message" />
          </h1>
          <p
            className="animate-rise mt-6 max-w-[46ch] text-lg leading-relaxed text-muted-foreground"
            style={{ '--delay': '450ms' } as React.CSSProperties}
          >
            Answer Messenger and Instagram DMs together, route them to the right teammate, and keep
            every customer’s history in one place.
          </p>
          <div
            className="animate-rise mt-9 flex flex-col gap-3 sm:flex-row"
            style={{ '--delay': '560ms' } as React.CSSProperties}
          >
            <Button asChild size="lg" className="group h-11 px-6 active:scale-[0.98]">
              <Link href="/contact">
                Book a demo
                <ArrowRight className="transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="h-11 px-5 active:scale-[0.98]">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

function Channels() {
  return (
    <section aria-labelledby="channels-heading" className="border-y bg-muted/40">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 md:py-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Reveal>
          <h2 id="channels-heading" className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            Every channel flows into one place
          </h2>
          <p className="mt-5 max-w-[44ch] text-lg leading-relaxed text-muted-foreground">
            Messenger and Instagram work today. WhatsApp, email and website chat are next, and they
            land in the same inbox.
          </p>
          <dl className="mt-8 flex gap-8 text-sm">
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-0.5 w-6 rounded bg-primary" />
              <dt className="sr-only">Solid line</dt>
              <dd>Available now</dd>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span aria-hidden className="h-0 w-6 border-t-2 border-dashed border-border" />
              <dt className="sr-only">Dashed line</dt>
              <dd>On the roadmap</dd>
            </div>
          </dl>
        </Reveal>
        <ChannelFlow />
      </div>
    </section>
  );
}

function Problems() {
  return (
    <section aria-labelledby="problems-heading" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-sm font-medium text-primary">The problem</p>
          <h2
            id="problems-heading"
            className="mt-4 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl"
          >
            Your customers are in five apps. So is your team.
          </h2>
          <p className="mt-5 max-w-[42ch] leading-relaxed text-muted-foreground">
            Selling and supporting over DMs works, right up until the messages outgrow the person
            holding the phone.
          </p>
        </Reveal>

        <Stagger className="grid gap-x-10 gap-y-14 sm:grid-cols-2">
          {PROBLEMS.map((problem, index) => (
            <StaggerItem key={problem.title}>
              <DrawnRule delay={index * 0.08} />
              <h3 className="mt-6 text-lg font-semibold tracking-tight">{problem.title}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{problem.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function Solution() {
  return (
    <section aria-labelledby="solution-heading" className="bg-muted/50">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32">
        <Reveal>
          <h2
            id="solution-heading"
            className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl"
          >
            See it, own it, answer it. All from one screen.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Reveal className="md:col-span-2 md:row-span-2">
            <SpotlightCard className="h-full rounded-2xl border bg-background">
              <div className="p-7 pb-0 sm:p-9 sm:pb-0">
                <h3 className="text-xl font-semibold tracking-tight">A shared inbox that updates itself</h3>
                <p className="mt-2 max-w-[52ch] leading-relaxed text-muted-foreground">
                  Replies, internal notes and hand-offs appear for everyone the moment they happen.
                  This is the real inbox, replaying one conversation.
                </p>
              </div>
              <div className="flex-1 p-7 sm:p-9">
                <LiveInbox />
              </div>
            </SpotlightCard>
          </Reveal>

          <Reveal delay={0.08}>
            <SpotlightCard className="h-full rounded-2xl bg-primary text-primary-foreground">
              <div className="flex h-full flex-col justify-between p-7 sm:p-8">
                <h3 className="text-xl font-semibold tracking-tight">Every conversation has an owner</h3>
                <p className="mt-10 leading-relaxed opacity-90">
                  Assign to a person or a team. Every hand-off is recorded, so “who has this?” always
                  has an answer.
                </p>
              </div>
            </SpotlightCard>
          </Reveal>

          <Reveal delay={0.16}>
            <SpotlightCard className="h-full rounded-2xl border bg-background">
              <div className="p-7 pb-0 sm:p-8 sm:pb-0">
                <h3 className="text-xl font-semibold tracking-tight">The full customer, not just the chat</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  Contact details, tags and history beside every thread.
                </p>
              </div>
              <div className="relative mt-6 ml-7 h-52 overflow-hidden rounded-tl-xl border-t border-l sm:ml-8">
                <ProductShot
                  name="profile"
                  alt="A customer profile with email, phone, company and tags"
                  width={640}
                  height={1000}
                  sizes="(min-width: 768px) 30vw, 100vw"
                  imageClassName="h-auto w-full transition-transform duration-700 ease-out group-hover:-translate-y-6"
                />
                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
              </div>
            </SpotlightCard>
          </Reveal>

          <Reveal>
            <SpotlightCard className="h-full rounded-2xl border bg-background">
              <div className="p-7 sm:p-8">
                <h3 className="text-xl font-semibold tracking-tight">Notes only your team sees</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  Leave context inside the thread, like a promised refund or a courier delay.
                  Customers never see it.
                </p>
              </div>
            </SpotlightCard>
          </Reveal>

          <Reveal delay={0.08} className="md:col-span-2">
            <SpotlightCard className="h-full rounded-2xl border border-primary/25 bg-primary/[0.06]">
              <div className="flex h-full flex-col justify-between gap-8 p-7 sm:p-8 md:flex-row md:items-end">
                <div>
                  <h3 className="text-xl font-semibold tracking-tight">Know your response times</h3>
                  <p className="mt-2 max-w-[48ch] leading-relaxed text-muted-foreground">
                    Track volume, first-response time, resolution time and each agent’s activity
                    across every channel.
                  </p>
                </div>
                <Stagger className="flex flex-wrap gap-2 text-sm">
                  {['First response', 'Time to close', 'Agent activity'].map((metric) => (
                    <StaggerItem key={metric} className="rounded-full border bg-background px-3 py-1">
                      {metric}
                    </StaggerItem>
                  ))}
                </Stagger>
              </div>
            </SpotlightCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function WhyUs() {
  return (
    <section aria-labelledby="why-heading" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32">
      <Reveal>
        <p className="text-sm font-medium text-primary">Why {site.name}</p>
        <h2
          id="why-heading"
          className="mt-4 max-w-3xl text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl"
        >
          Made for small teams that sell and support in the DMs
        </h2>
      </Reveal>

      <Stagger as="div" className="mt-16 grid gap-x-12 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        {REASONS.map(({ icon: Icon, title, body }) => (
          <StaggerItem as="div" key={title} className="group">
            <span className="flex size-11 items-center justify-center rounded-xl border bg-background text-primary transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="size-5" aria-hidden />
            </span>
            <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">{body}</p>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-20 border-y bg-muted/50">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-28">
        <Reveal>
          <h2 id="how-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Live in an afternoon
          </h2>
        </Reveal>
        <StepsTimeline steps={STEPS} />
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section aria-labelledby="faq-heading" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-20">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <h2 id="faq-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Questions, answered
          </h2>
          <p className="mt-4 text-muted-foreground">
            Something else on your mind?{' '}
            <Link href="/contact" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
              Ask us directly
            </Link>
            .
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <FaqAccordion items={FAQS} />
        </Reveal>
      </div>
    </section>
  );
}
