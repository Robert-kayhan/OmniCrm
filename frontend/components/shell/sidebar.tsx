'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Inbox,
  Plug,
  ScrollText,
  Settings,
  Tags,
  Users,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PERMISSIONS, useAuth } from '@/lib/auth';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hidden entirely when the user lacks this permission. */
  permission?: string;
  /** Marks the item active for nested routes too. */
  matchPrefix?: boolean;
}

const PRIMARY: NavItem[] = [
  { href: '/inbox', label: 'Inbox', icon: Inbox, matchPrefix: true },
  {
    href: '/customers',
    label: 'Customers',
    icon: Users,
    permission: PERMISSIONS.CUSTOMER_READ,
    matchPrefix: true,
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: BarChart3,
    permission: PERMISSIONS.CONVERSATION_READ_ALL,
  },
];

const SETTINGS: NavItem[] = [
  {
    href: '/settings/integrations',
    label: 'Integrations',
    icon: Plug,
    permission: PERMISSIONS.INTEGRATION_READ,
  },
  { href: '/settings/team', label: 'Team', icon: UsersRound, permission: PERMISSIONS.USER_READ },
  { href: '/settings/tags', label: 'Tags', icon: Tags, permission: PERMISSIONS.TAG_READ },
  {
    href: '/settings/audit',
    label: 'Audit log',
    icon: ScrollText,
    permission: PERMISSIONS.AUDIT_LOG_READ,
  },
];

function NavLink({ item, badge }: { item: NavItem; badge?: number }) {
  const pathname = usePathname();
  const active = item.matchPrefix
    ? pathname === item.href || pathname.startsWith(`${item.href}/`)
    : pathname === item.href;

  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {badge && badge > 0 ? (
        <Badge variant="default" className="px-1.5 tabular-nums">
          {badge > 99 ? '99+' : badge}
        </Badge>
      ) : null}
    </Link>
  );
}

export function Sidebar() {
  const { user, can } = useAuth();

  // The unread badge is pushed by the socket via cache invalidation, so this
  // query rarely refetches on its own.
  const { data: stats } = useQuery({
    queryKey: queryKeys.conversations.stats,
    queryFn: () => api.conversations.stats(),
    enabled: Boolean(user),
  });

  const visible = (items: NavItem[]) =>
    items.filter((item) => !item.permission || can(item.permission));

  const settingsItems = visible(SETTINGS);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2.5 border-b px-4">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Inbox className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            {user?.organization.name ?? 'Omni CRM'}
          </p>
          <p className="truncate text-xs text-muted-foreground">Omnichannel CRM</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-3">
        <div className="space-y-1">
          {visible(PRIMARY).map((item) => (
            <NavLink
              key={item.href}
              item={item}
              badge={item.href === '/inbox' ? stats?.unread : undefined}
            />
          ))}
        </div>

        {settingsItems.length > 0 ? (
          <div className="space-y-1">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Settings
            </p>
            {settingsItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        ) : null}
      </nav>

      <div className="border-t p-3">
        <Link
          href="/settings/account"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          <Settings className="size-3.5" />
          Account settings
        </Link>
      </div>
    </aside>
  );
}
