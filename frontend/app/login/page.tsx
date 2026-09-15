'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const DEMO_ACCOUNTS = [
  { email: 'admin@demo.test', role: 'Super admin' },
  { email: 'manager@demo.test', role: 'Manager' },
  { email: 'rahul@demo.test', role: 'Agent' },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, user, loading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A signed-in user who navigates here directly goes straight to the inbox.
  useEffect(() => {
    if (!loading && user) router.replace('/inbox');
  }, [loading, user, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email.trim(), password);
      router.replace('/inbox');
    } catch (caught) {
      if (caught instanceof ApiError) {
        // The API deliberately does not say which half was wrong, and neither
        // does this: distinguishing them confirms that an address exists.
        setError(
          caught.code === 'AUTH_RATE_LIMITED'
            ? caught.message
            : 'Those credentials were not accepted. Check the address and password.',
        );
      } else {
        setError('Could not reach the API. Is the backend running on port 4000?');
      }
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Inbox className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Omnichannel CRM</h1>
            <p className="text-sm text-muted-foreground">
              Every conversation, from every channel, in one inbox.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border bg-card p-6 shadow-xs"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Spinner /> : null}
            {submitting ? 'Signing in' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-6 rounded-lg border border-dashed p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Demo accounts — password{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">Password123!</code>
          </p>
          <ul className="space-y-1">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword('Password123!');
                  }}
                  className="flex w-full items-center justify-between rounded px-1 py-0.5 text-xs transition-colors hover:bg-accent"
                >
                  <span className="font-mono">{account.email}</span>
                  <span className="text-muted-foreground">{account.role}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
