import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { env } from './env';

/**
 * Configuration, available everywhere without an explicit import.
 *
 * `env.ts` owns validation — it parses the whole environment with a schema that
 * carries the defaults, the coercions and the production-only cross-checks, and
 * exits with a readable report rather than booting half-configured. That schema
 * stays in Zod: it is start-up configuration rather than request input, it has
 * to run before the DI container exists, and its transforms (CSV lists,
 * booleanish flags, blank-as-undefined) have no clean decorator equivalent.
 * Request DTOs use class-validator.
 *
 * Nest's own ConfigModule is registered on top so `ConfigService` works for
 * third-party modules that expect it, reading from the same validated object.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // The environment is already loaded and validated by env.ts; handing the
      // parsed result to Nest keeps one source of truth.
      load: [() => env],
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService, NestConfigModule],
})
export class AppConfigModule {}
