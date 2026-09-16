import { Module, type ExecutionContext } from '@nestjs/common';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AppConfigService } from '../../config/app-config.service';
import { RedisService } from '../../database/redis.service';
import { ResilientThrottlerStorage } from './resilient-throttler.storage';
import { THROTTLERS } from './throttler.constants';

/**
 * Makes a named budget apply only where a route asks for it.
 *
 * Every configured throttler is otherwise evaluated on every request, which
 * would mean the ten-attempts-per-fifteen-minutes credential budget silently
 * capping ordinary API traffic. `@Throttle({ auth: {} })` writes the library's
 * limit metadata for that name — with an undefined value, which is why this
 * checks for the key's presence rather than reading it.
 */
function optInOnly(name: string) {
  return (context: ExecutionContext): boolean => {
    const key = THROTTLER_LIMIT + name;
    return !(
      Reflect.hasMetadata(key, context.getHandler()) ||
      Reflect.hasMetadata(key, context.getClass())
    );
  };
}

/**
 * Rate limiting for the whole API.
 *
 * Redis-backed when REDIS_URL is set, so a limit is shared across API
 * instances; otherwise it falls back to the in-process store, which is only
 * correct for a single node. Production config validation requires REDIS_URL,
 * so the fallback is a development convenience rather than a deployment mode.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService, RedisService],
      useFactory: (config: AppConfigService, redis: RedisService) => {
        const client = redis.getClient();

        return {
          // Disabled in tests so suites are not throttled by their own speed.
          skipIf: () => config.isTest,
          ...(client
            ? {
                storage: new ResilientThrottlerStorage(
                  new ThrottlerStorageRedisService(client),
                ),
              }
            : {}),
          throttlers: [
            {
              // The baseline applied to every route.
              name: THROTTLERS.GLOBAL,
              ttl: config.get('RATE_LIMIT_WINDOW_MS'),
              limit: config.get('RATE_LIMIT_MAX'),
            },
            {
              // Credential endpoints, to blunt password spraying.
              name: THROTTLERS.AUTH,
              ttl: seconds(15 * 60),
              limit: config.get('AUTH_RATE_LIMIT_MAX'),
              skipIf: optInOnly(THROTTLERS.AUTH),
            },
            {
              // Outbound messages are billed by the provider.
              name: THROTTLERS.MESSAGE,
              ttl: seconds(60),
              limit: 60,
              skipIf: optInOnly(THROTTLERS.MESSAGE),
            },
            {
              // Meta bursts hard after an outage and its traffic is already
              // authenticated by an HMAC, so the ceiling here is high — it
              // exists to bound an unauthenticated public write path, not to
              // shape legitimate volume.
              name: THROTTLERS.WEBHOOK,
              ttl: seconds(60),
              limit: 1_200,
              skipIf: optInOnly(THROTTLERS.WEBHOOK),
            },
          ],
        };
      },
    }),
  ],
  exports: [ThrottlerModule],
})
export class AppThrottlerModule {}
