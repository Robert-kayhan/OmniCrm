'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/shell/sidebar';
import { FullPageSpinner } from '@/components/ui/spinner';
import { useAuth } from '@/lib/auth';

/**
 * The auth gate for everything inside the product.
 *
 * The check lives here rather than in a proxy/middleware because the durable
 * credential is an httpOnly cookie scoped to /api/auth on a different origin —
 * the Next server cannot see it, so only the browser can establish the session.
 * The cost is one render of a spinner; the benefit is a single place that
 * decides who is signed in.
 */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) return <FullPageSpinner label="Restoring your session" />;

  // Rendering nothing while the redirect runs, rather than the app shell with
  // no data in it.
  if (!user) return null;

  return (
    <div className="flex h-full min-h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
