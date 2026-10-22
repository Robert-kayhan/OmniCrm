import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { site } from '@/lib/site';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  // Resolves relative canonical and Open Graph URLs against the real domain.
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} | Omnichannel customer inbox`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  keywords: [...site.keywords],
  applicationName: site.name,
  openGraph: {
    type: 'website',
    siteName: site.name,
    locale: 'en_US',
    url: '/',
    title: `${site.name} | Omnichannel customer inbox`,
    description: site.description,
  },
  twitter: {
    card: 'summary_large_image',
    images: '/opengraph-image',
    title: `${site.name} | Omnichannel customer inbox`,
    description: site.description,
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      // `suppressHydrationWarning` is required by next-themes: it writes the
      // theme class onto <html> before React hydrates, so the server markup and
      // the first client render legitimately differ by that one attribute.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
