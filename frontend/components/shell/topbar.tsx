'use client';

import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { LogOut, Moon, Sun, User as UserIcon, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Hint } from '@/components/ui/tooltip';
import { UserAvatar } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useSocket } from '@/lib/socket';
import { NotificationBell } from './notification-bell';

/** Shows whether live updates are actually flowing, rather than assuming they are. */
function ConnectionIndicator() {
  const { connected } = useSocket();

  return (
    <Hint
      label={
        connected
          ? 'Live — new messages arrive automatically'
          : 'Reconnecting — messages may be delayed'
      }
    >
      <span
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {connected ? (
          <Wifi className="size-4 text-success" />
        ) : (
          <WifiOff className="size-4 text-warning" />
        )}
        <span className="sr-only">{connected ? 'Connected' : 'Reconnecting'}</span>
      </span>
    </Hint>
  );
}

/**
 * Theme toggle.
 *
 * The active theme is only known on the client, so which icon to show is
 * decided by CSS against the `dark` class next-themes puts on <html> — both
 * icons are rendered and one is hidden. A `mounted` state flag would work too,
 * but it costs an extra render on every page load to avoid a mismatch that CSS
 * simply does not have.
 */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Hint label="Switch theme">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        aria-label="Switch between light and dark theme"
      >
        <Moon className="size-4 dark:hidden" />
        <Sun className="hidden size-4 dark:block" />
      </Button>
    </Hint>
  );
}

export function Topbar({ title, actions }: { title: React.ReactNode; actions?: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <div className="min-w-0 flex-1">
        {typeof title === 'string' ? (
          <h1 className="truncate text-sm font-semibold">{title}</h1>
        ) : (
          title
        )}
      </div>

      <div className="flex items-center gap-1">
        {actions}
        <ConnectionIndicator />
        <NotificationBell />
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ml-1 rounded-full transition-opacity hover:opacity-80"
              aria-label="Account menu"
            >
              <UserAvatar name={user?.name} src={user?.avatar} className="size-8" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium text-foreground">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              <p className="mt-1 text-xs capitalize text-muted-foreground">
                {user?.role.toLowerCase().replace('_', ' ')}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push('/settings/account')}>
              <UserIcon />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
