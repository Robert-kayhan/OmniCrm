import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';
import { AppConfigService } from '../config/app-config.service';

/**
 * Redis is optional by design. Everything that uses it degrades to a single-node
 * fallback when REDIS_URL is unset, so a developer can run the API with nothing
 * but Postgres. Production config validation requires REDIS_URL.
 */
/** How long a graceful QUIT gets before the socket is torn down regardless. */
const QUIT_TIMEOUT_MS = 2_000;

const baseOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 200, 5_000),
};

/**
 * The shared command client additionally refuses to queue.
 *
 * Commands issued while the connection is down reject immediately instead of
 * waiting for a reconnect that may never come — which is the difference between
 * "Redis is unreachable" and "every request that touches Redis hangs": a health
 * probe that never answers, a rate-limit check that never returns. Each caller
 * of this client either falls back or reports the failure.
 *
 * The adapter pair below keeps the queue, because Socket.IO's Redis adapter
 * issues its PSUBSCRIBE the moment it is constructed — before the connection is
 * up — and would throw on an empty queue.
 */
const commandOptions: RedisOptions = { ...baseOptions, enableOfflineQueue: false };

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private connectFailed = false;
  /** Adapter connections, tracked so shutdown can close them too. */
  private readonly pairs: Redis[] = [];

  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.redisUrl) && !this.connectFailed;
  }

  /** Returns the shared command client, or null when Redis is not configured. */
  getClient(): Redis | null {
    const url = this.config.redisUrl;
    if (!url) return null;
    if (this.client) return this.client;

    this.client = new Redis(url, commandOptions);
    this.client.on('error', (error: Error) => {
      this.logger.error({ err: error }, 'Redis error');
    });
    this.client.on('ready', () => {
      this.connectFailed = false;
      this.logger.log('Redis connected');
    });
    return this.client;
  }

  /**
   * Socket.IO's Redis adapter needs two dedicated connections (one stays in
   * subscriber mode), so they cannot be the shared command client.
   */
  createPair(): { pubClient: Redis; subClient: Redis } | null {
    const url = this.config.redisUrl;
    if (!url) return null;

    const pubClient = new Redis(url, { ...baseOptions, lazyConnect: false });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (error: Error) =>
      this.logger.error({ err: error }, 'Redis pub client error'),
    );
    subClient.on('error', (error: Error) =>
      this.logger.error({ err: error }, 'Redis sub client error'),
    );
    this.pairs.push(pubClient, subClient);
    return { pubClient, subClient };
  }

  async onModuleInit(): Promise<void> {
    const redis = this.getClient();
    if (!redis) {
      this.logger.warn(
        'REDIS_URL is not set — rate limiting uses an in-process store and Socket.IO runs single-node',
      );
      return;
    }
    try {
      await redis.connect();
    } catch (error) {
      // A missing Redis must not stop the API from booting: the features that
      // use it each have a single-node fallback.
      this.connectFailed = true;
      this.logger.error({ err: error }, 'Redis connection failed — continuing without Redis');
    }
  }

  /**
   * Closes every connection this service opened.
   *
   * The two are treated differently on purpose. The shared command client gets
   * a graceful QUIT so an in-flight rate-limit or handoff write finishes, with
   * a timeout because a server that has already gone away will never answer.
   * The Socket.IO adapter pair is dropped outright: one of the two is in
   * subscriber mode and does not reliably answer QUIT, and its traffic is
   * fire-and-forget broadcast that has no value once the process is refusing
   * connections. Waiting on it would add seconds to every rolling deploy.
   */
  async onApplicationShutdown(): Promise<void> {
    const command = this.client;
    const pairs = [...this.pairs];
    this.client = null;
    this.pairs.length = 0;

    for (const client of pairs) client.disconnect();
    if (command) await this.closeGracefully(command);
  }

  private async closeGracefully(client: Redis): Promise<void> {
    try {
      await Promise.race([
        client.quit(),
        new Promise((resolve) => setTimeout(resolve, QUIT_TIMEOUT_MS).unref()),
      ]);
    } catch {
      // Already closing, or the server went away first. Either is fine.
    } finally {
      client.disconnect();
    }
  }

  async checkHealth(): Promise<'ok' | 'disabled' | 'error'> {
    const redis = this.getClient();
    if (!redis) return 'disabled';
    try {
      await redis.ping();
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
