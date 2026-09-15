import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Omnichannel CRM',
  description: 'Every customer conversation, from every channel, in one inbox.',
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
