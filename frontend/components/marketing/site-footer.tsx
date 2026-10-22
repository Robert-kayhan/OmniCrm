import Link from 'next/link';
import { BrandMark } from '@/components/marketing/site-header';
import { marketingNav, site } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-3">
          <BrandMark />
          <p className="max-w-sm text-sm text-muted-foreground">{site.tagline}</p>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold">Company</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {marketingNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-foreground">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold">Get in touch</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <a href={`mailto:${site.contactEmail}`} className="hover:text-foreground">
                {site.contactEmail}
              </a>
            </li>
            <li>
              <Link href="/login" className="hover:text-foreground">
                Sign in
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t">
        <p className="mx-auto max-w-7xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} {site.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
