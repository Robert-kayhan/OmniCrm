import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';

/**
 * The public, indexable pages. Server-rendered and outside the auth gate in
 * `(app)/layout.tsx`, so search engines see the full content on first load.
 */
export default function MarketingLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
