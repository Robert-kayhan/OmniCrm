import { ipKeyGenerator, rateLimit, type Options, type Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env, isTest } from '../config/env';
import { getRedis } from '../database/redis';
import { logger } from '../config/logger';
import { TooManyRequestsError } from '../utils/errors';

/**
 * Redis-backed when REDIS_URL is set, so the limit is shared across API
 * instances. Falls back to express-rate-limit's in-process memory store, which
 * is only correct for a single node.
 */
function createStore(prefix: string): Store | undefined {
  const redis = getRedis();
  if (!redis) return undefined;
  return new RedisStore({
    prefix: `ratelimit:${prefix}:`,
    sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never>,
  });
}

interface LimiterOptions {
  prefix: string;
  windowMs: number;
  limit: number;
  message?: string;
  code?: string;
  /** Rate limit per authenticated user rather than per IP where possible. */
  perUser?: boolean;
}

function buildLimiter({ prefix, windowMs, limit, message, code, perUser }: LimiterOptions) {
  const options: Partial<Options> = {
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Disabled in tests so suites are not throttled by their own speed.
    skip: () => isTest,
    keyGenerator: (req) => {
      if (perUser && req.auth?.userId) return `user:${req.auth.userId}`;
      // ipKeyGenerator normalises IPv6 to a /56 block so a single client cannot
      // cycle through addresses in its own subnet to reset the counter.
      return ipKeyGenerator(req.ip ?? 'unknown');
    },
    handler: (_req, _res, next) => {
      next(new TooManyRequestsError(message ?? 'Too many requests, please slow down', code));
    },
  };

  const store = createStore(prefix);
  if (store) options.store = store;

  return rateLimit(options);
}

/** Baseline limit applied to the whole /api surface. */
export function globalRateLimiter() {
  return buildLimiter({
    prefix: 'global',
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
  });
}

/** Tight limit on credential endpoints to blunt password spraying. */
export function authRateLimiter() {
  return buildLimiter({
    prefix: 'auth',
    windowMs: 15 * 60_000,
    limit: env.AUTH_RATE_LIMIT_MAX,
    message: 'Too many authentication attempts. Try again in a few minutes.',
    code: 'AUTH_RATE_LIMITED',
  });
}

/** Outbound messages are billed by the provider, so they get their own budget. */
export function messageRateLimiter() {
  return buildLimiter({
    prefix: 'message',
    windowMs: 60_000,
    limit: 60,
    message: 'You are sending messages too quickly',
    code: 'MESSAGE_RATE_LIMITED',
    perUser: true,
  });
}

/**
 * Provider callbacks. Meta bursts hard after an outage and its traffic is
 * already authenticated by an HMAC, so the ceiling here is high — it exists to
 * bound an unauthenticated public write path, not to shape legitimate volume.
 */
export function webhookRateLimiter() {
  return buildLimiter({
    prefix: 'webhook',
    windowMs: 60_000,
    limit: 1_200,
    message: 'Webhook deliveries are arriving too quickly',
    code: 'WEBHOOK_RATE_LIMITED',
  });
}

export function logRateLimitMode(): void {
  logger.info(
    { store: getRedis() ? 'redis' : 'memory' },
    'Rate limiting initialised',
  );
}
