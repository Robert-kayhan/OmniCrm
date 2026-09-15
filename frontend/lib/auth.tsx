'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, setAccessToken, setUnauthorizedHandler } from './api';
import type { CurrentUser } from './types';

/**
 * Session state for the whole app.
 *
 * The access token is never persisted. On load the provider trades the httpOnly
 * refresh cookie for a fresh one — so a reload restores the session without any
 * token having been readable by page scripts.
 */

interface AuthContextValue {
  user: CurrentUser | null;
  /** True until the initial refresh attempt has settled. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Access tokens are short-lived; renew a little before they expire. */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  /**
   * Called when the API says the session is gone for good.
   *
   * Re-registered whenever `user` changes so the handler closes over the
   * current value: the guard exists because a 401 during the initial restore is
   * expected, and redirecting on it would fight the redirect the layout is
   * already doing.
   */
  useEffect(() => {
    if (!user) {
      setUnauthorizedHandler(null);
      return;
    }
    setUnauthorizedHandler(() => {
      clearSession();
      router.replace('/login');
    });
    return () => setUnauthorizedHandler(null);
  }, [user, clearSession, router]);

  // Restore the session from the refresh cookie exactly once, on mount.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = await refreshSession();
      if (cancelled) return;

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const current = await api.auth.me();
        if (!cancelled) setUser(current);
      } catch {
        if (!cancelled) setAccessToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Renews the access token on a timer while the tab is open.
   *
   * Without this the token expires mid-session and the first action after the
   * gap pays a refresh round trip — or worse, a socket that authenticated with
   * the old token silently stops being reconnectable.
   */
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      void refreshSession();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [user]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api.auth.login(email, password);
      setAccessToken(session.accessToken);
      const current = await api.auth.me();
      setUser(current);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // A failed logout still clears the client: the refresh cookie is
      // cleared server-side on the next rejected refresh anyway, and leaving
      // the user staring at an inbox they can no longer use is worse.
    }
    clearSession();
    router.replace('/login');
  }, [clearSession, router]);

  const refreshUser = useCallback(async () => {
    const current = await api.auth.me();
    setUser(current);
  }, []);

  const permissions = useMemo(() => new Set(user?.permissions ?? []), [user]);

  const can = useCallback((permission: string) => permissions.has(permission), [permissions]);
  const canAny = useCallback(
    (...list: string[]) => list.some((permission) => permissions.has(permission)),
    [permissions],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, refreshUser, can, canAny }),
    [user, loading, login, logout, refreshUser, can, canAny],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Permission names, mirrored from the server's config/permissions.ts. */
export const PERMISSIONS = {
  ORG_READ: 'organization:read',
  ORG_UPDATE: 'organization:update',
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  TEAM_READ: 'team:read',
  TEAM_CREATE: 'team:create',
  TEAM_UPDATE: 'team:update',
  TEAM_DELETE: 'team:delete',
  INTEGRATION_READ: 'integration:read',
  INTEGRATION_MANAGE: 'integration:manage',
  CUSTOMER_READ: 'customer:read',
  CUSTOMER_CREATE: 'customer:create',
  CUSTOMER_UPDATE: 'customer:update',
  CUSTOMER_DELETE: 'customer:delete',
  CONVERSATION_READ: 'conversation:read',
  CONVERSATION_READ_ALL: 'conversation:read:all',
  CONVERSATION_CREATE: 'conversation:create',
  CONVERSATION_UPDATE: 'conversation:update',
  CONVERSATION_ASSIGN: 'conversation:assign',
  MESSAGE_READ: 'message:read',
  MESSAGE_SEND: 'message:send',
  TAG_READ: 'tag:read',
  TAG_MANAGE: 'tag:manage',
  NOTE_READ: 'note:read',
  NOTE_CREATE: 'note:create',
  NOTE_DELETE: 'note:delete',
  AUDIT_LOG_READ: 'auditLog:read',
  DEV_TOOLS: 'dev:tools',
} as const;
