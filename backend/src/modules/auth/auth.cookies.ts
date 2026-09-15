import type { CookieOptions, Response, Request } from 'express';
import { env, isProduction } from '../../config/env';

export const REFRESH_COOKIE_NAME = 'omni_refresh_token';

/**
 * Scoped to /api/auth so the refresh token is not attached to ordinary API
 * calls, which shrinks the surface for token theft via a chatty endpoint.
 */
function cookieOptions(maxAgeMs: number): CookieOptions {
  const secure = env.COOKIE_SECURE ?? isProduction;
  return {
    httpOnly: true,
    secure,
    // A cross-site frontend requires SameSite=None, which browsers only accept
    // together with Secure. Same-origin/localhost deployments keep Lax.
    sameSite: secure ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: maxAgeMs,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  res.cookie(REFRESH_COOKIE_NAME, token, cookieOptions(maxAge));
}

export function clearRefreshCookie(res: Response): void {
  const options = cookieOptions(0);
  delete options.maxAge;
  res.clearCookie(REFRESH_COOKIE_NAME, options);
}

export function readRefreshToken(req: Request, bodyToken?: string): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE_NAME] ?? bodyToken ?? null;
}
