'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { marketingNav, site } from '@/lib/site';
import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Inbox className="size-4" aria-hidden />
      </span>
      {site.name}
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // A signed-in visitor wants back into the product, not a sign-in form.
  const appLink = user ? { href: '/inbox', label: 'Open inbox' } : { href: '/login', label: 'Sign in' };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <BrandMark />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {marketingNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
                pathname === item.href && 'text-foreground font-medium',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href={appLink.href}>{appLink.label}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/contact">Book a demo</Link>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X /> : <Menu />}
        </Button>
      </div>

      {open ? (
        <nav id="mobile-nav" aria-label="Main" className="border-t px-4 py-3 md:hidden">
          <ul className="flex flex-col gap-1">
            {[...marketingNav, appLink].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm hover:bg-accent"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Button asChild className="mt-3 w-full">
            <Link href="/contact" onClick={() => setOpen(false)}>
              Book a demo
            </Link>
          </Button>
        </nav>
      ) : null}
    </header>
  );
}
