import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Reveal } from '@/components/marketing/motion';
import { Button } from '@/components/ui/button';

/** The closing band shared by the marketing pages. */
export function CallToAction({
  title = 'Stop switching apps to answer customers',
  body = 'A 20-minute walkthrough using your own Page and Instagram account.',
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <Reveal y={40} className="mx-auto max-w-7xl">
        <div className="relative isolate overflow-hidden rounded-3xl bg-primary px-8 py-16 text-primary-foreground md:px-14">
          {/* A slow sweep of light across the band; static under reduced motion. */}
          <div aria-hidden className="cta-sheen absolute inset-0 -z-10" />
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
              <p className="mt-3 max-w-[50ch] text-lg opacity-90">{body}</p>
            </div>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="group h-12 shrink-0 px-7 text-base transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <Link href="/contact">
                Book a demo
                <ArrowUpRight className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
