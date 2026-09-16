import { Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfigService } from '../../config/app-config.service';

export const REFRESH_COOKIE_NAME = 'omni_refresh_token';

@Injectable()
export class AuthCookieService {
  constructor(private readonly config: AppConfigService) {}

  /**
   * Scoped to /api/auth so the refresh token is not attached to ordinary API
   * calls, which shrinks the surface for token theft via a chatty endpoint.
   */
  private options(maxAgeMs: number): CookieOptions {
    const secure = this.config.get('COOKIE_SECURE') ?? this.config.isProduction;
    const domain = this.config.get('COOKIE_DOMAIN');
    return {
      httpOnly: true,
      secure,
      // A cross-site frontend requires SameSite=None, which browsers only accept
      // together with Secure. Same-origin/localhost deployments keep Lax.
      sameSite: secure ? 'none' : 'lax',
      path: '/api/auth',
      maxAge: maxAgeMs,
      ...(domain ? { domain } : {}),
    };
  }

  set(response: Response, token: string, expiresAt: Date): void {
    const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
    response.cookie(REFRESH_COOKIE_NAME, token, this.options(maxAge));
  }

  clear(response: Response): void {
    const options = this.options(0);
    delete options.maxAge;
    response.clearCookie(REFRESH_COOKIE_NAME, options);
  }

  read(request: Request, bodyToken?: string): string | null {
    const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[REFRESH_COOKIE_NAME] ?? bodyToken ?? null;
  }
}
