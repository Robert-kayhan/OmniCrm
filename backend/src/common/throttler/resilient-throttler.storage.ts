import { Logger } from '@nestjs/common';
import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

/**
 * Keeps rate limiting working when Redis does not.
 *
 * Redis is the shared counter, so a limit is enforced across API instances. If
 * it becomes unreachable the choice is between failing every request with a
 * 500, dropping rate limiting entirely, or falling back to a per-instance
 * counter. The last is what this does, and it matches what the codebase
 * promises elsewhere: without Redis the limit degrades to in-process, which is
 * weaker than a shared one but still bounds a single node.
 *
 * The fallback store is kept for the life of the process rather than rebuilt on
 * each failure, so counters survive a Redis blip instead of resetting with it.
 */
export class ResilientThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(ResilientThrottlerStorage.name);
  private readonly fallback = new ThrottlerStorageService();
  private degraded = false;

  constructor(private readonly primary: ThrottlerStorage) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const record = await this.primary.increment(key, ttl, limit, blockDuration, throttlerName);
      if (this.degraded) {
        this.degraded = false;
        this.logger.log('Redis is back; rate limits are shared across instances again');
      }
      return record;
    } catch (error) {
      if (!this.degraded) {
        this.degraded = true;
        this.logger.error(
          { err: error },
          'Rate limit store is unavailable; falling back to an in-process counter',
        );
      }
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}
