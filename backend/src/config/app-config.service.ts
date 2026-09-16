import { Injectable } from '@nestjs/common';
import {
  allowedOrigins,
  env,
  isDevelopment,
  isMetaConfigured,
  isProduction,
  isTest,
  metaOAuthRedirectUri,
  type Env,
} from './env';

/**
 * Typed access to configuration for everything inside the container.
 *
 * The values come from `env.ts`, which validates the whole environment once at
 * import time and exits the process on a bad configuration — so a service that
 * injects this never has to handle a missing or malformed variable. Wrapping it
 * in a provider rather than importing the singleton directly is what makes a
 * service testable: a test overrides this provider instead of mutating
 * `process.env` and re-importing modules.
 */
@Injectable()
export class AppConfigService {
  readonly env: Env = env;

  get<K extends keyof Env>(key: K): Env[K] {
    return env[key];
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return env.NODE_ENV;
  }

  get port(): number {
    return env.PORT;
  }

  get host(): string {
    return env.HOST;
  }

  get isProduction(): boolean {
    return isProduction;
  }

  get isDevelopment(): boolean {
    return isDevelopment;
  }

  get isTest(): boolean {
    return isTest;
  }

  /** Origins allowed to call the API with credentials. */
  get allowedOrigins(): string[] {
    return allowedOrigins;
  }

  get redisUrl(): string | undefined {
    return env.REDIS_URL;
  }

  get frontendUrl(): string {
    return env.FRONTEND_URL;
  }

  get backendUrl(): string {
    return env.BACKEND_URL;
  }

  /** True only when every Meta credential the providers need is present. */
  get isMetaConfigured(): boolean {
    return isMetaConfigured;
  }

  get metaOAuthRedirectUri(): string {
    return metaOAuthRedirectUri;
  }

  get devToolsEnabled(): boolean {
    return env.ENABLE_DEV_TOOLS;
  }

  /** Defaults to "everywhere but production" unless explicitly overridden. */
  get apiDocsEnabled(): boolean {
    return env.ENABLE_API_DOCS ?? !isProduction;
  }

  get publicRegistrationEnabled(): boolean {
    return env.ALLOW_PUBLIC_REGISTRATION;
  }
}
