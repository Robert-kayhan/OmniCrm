import Redis, { type RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Redis is optional by design. Everything that uses it degrades to a single-node
 * fallback when REDIS_URL is unset, so a developer can run the API with nothing
 * but Postgres. Production config validation requires REDIS_URL.
 */
const baseOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 200, 5_000),
};

let client: Redis | null = null;
let connectFailed = false;

export function isRedisEnabled(): boolean {
  return Boolean(env.REDIS_URL) && !connectFailed;
}

/** Returns the shared client, or null when Redis is not configured. */
export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (client) return client;

  client = new Redis(env.REDIS_URL, baseOptions);
  client.on('error', (error: Error) => {
    logger.error({ err: error }, 'Redis error');
  });
  client.on('ready', () => {
    connectFailed = false;
    logger.info('Redis connected');
  });
  return client;
}

/**
 * Socket.IO's Redis adapter needs two dedicated connections (one stays in
 * subscriber mode), so they cannot be the shared command client.
 */
export function createRedisPair(): { pubClient: Redis; subClient: Redis } | null {
  if (!env.REDIS_URL) return null;
  const pubClient = new Redis(env.REDIS_URL, { ...baseOptions, lazyConnect: false });
  const subClient = pubClient.duplicate();
  pubClient.on('error', (error: Error) => logger.error({ err: error }, 'Redis pub client error'));
  subClient.on('error', (error: Error) => logger.error({ err: error }, 'Redis sub client error'));
  return { pubClient, subClient };
}

export async function connectRedis(): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    logger.warn(
      'REDIS_URL is not set — rate limiting uses an in-process store and Socket.IO runs single-node',
    );
    return;
  }
  try {
    await redis.connect();
  } catch (error) {
    connectFailed = true;
    logger.error({ err: error }, 'Redis connection failed — continuing without Redis');
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  client = null;
}

export async function checkRedisHealth(): Promise<'ok' | 'disabled' | 'error'> {
  const redis = getRedis();
  if (!redis) return 'disabled';
  try {
    await redis.ping();
    return 'ok';
  } catch {
    return 'error';
  }
}
