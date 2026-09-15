import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load the env file from the backend root regardless of the process CWD.
// A test run reads `.env.test` so it can never point at the development
// database, and falls back to `.env` for anything that file leaves unset.
const backendRoot = path.resolve(__dirname, '..', '..');
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: path.join(backendRoot, '.env.test'), quiet: true });
}
dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  });

const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );

/**
 * Treats an empty string as an absent value.
 *
 * Docker compose renders an unset `${VAR:-}` as `VAR=""` rather than omitting
 * it, so an optional-but-validated variable would otherwise fail its format
 * check on a perfectly normal deployment.
 */
function blankAsUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // --- Data stores -------------------------------------------------------
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
      message: 'DATABASE_URL must be a postgres:// or postgresql:// connection string',
    }),
  /**
   * Optional. Without Redis the API still runs: rate limiting falls back to an
   * in-process store and Socket.IO runs single-node. Both are fine for local
   * development and unacceptable for multi-instance production.
   */
  REDIS_URL: z.string().optional(),

  // --- Auth --------------------------------------------------------------
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  /** 32 bytes, hex encoded. Encrypts integration access tokens at rest. */
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),

  // --- HTTP --------------------------------------------------------------
  FRONTEND_URL: z.url().default('http://localhost:3000'),
  BACKEND_URL: z.url().default('http://localhost:4000'),
  /** Extra allowed origins beyond FRONTEND_URL, comma separated. */
  CORS_ORIGINS: csv.default([]),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: booleanish.optional(),
  /** Number of reverse proxies in front of the API; feeds Express `trust proxy`. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  // --- Feature flags -----------------------------------------------------
  /** Enables /api/dev/* fixtures. Refused outright when NODE_ENV=production. */
  ENABLE_DEV_TOOLS: booleanish.default(false),
  /** When false, POST /api/auth/register is closed and users arrive by invite. */
  ALLOW_PUBLIC_REGISTRATION: booleanish.default(true),

  // --- Meta / Facebook ---------------------------------------------------
  // All optional: the API boots without them and the Facebook provider reports
  // a precise configuration error the moment it is actually used.
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_PAGE_ID: z.string().optional(),
  META_PAGE_ACCESS_TOKEN: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default('v21.0'),
  META_GRAPH_API_BASE_URL: z.url().default('https://graph.facebook.com'),

  // Where Meta sends the browser back after the operator approves the app.
  // Must match a "Valid OAuth Redirect URI" in the Meta app dashboard exactly,
  // including the scheme and any trailing path. Defaults to this API's own
  // callback so a single-host deployment needs no extra configuration.
  //
  // `blankAsUndefined` matters for docker compose, which passes unset variables
  // through as empty strings — `z.url()` would reject `""` and the API would
  // refuse to boot rather than fall back to the default below.
  META_OAUTH_REDIRECT_URI: blankAsUndefined(z.url()),

  // Permissions requested during Facebook Login, covering both Meta inboxes.
  //
  //   pages_show_list            lists the Pages the operator admins
  //   pages_messaging            sends and receives on Messenger
  //   pages_read_engagement      reads Page content and conversation history
  //   pages_manage_metadata      subscribes the Page to this app's webhook —
  //                              without it a connect succeeds but no message
  //                              ever arrives, on either channel
  //   instagram_basic            reads the Instagram account linked to a Page
  //   instagram_manage_messages  sends and receives on Instagram Direct
  //
  // Instagram needs the pages_* scopes too: its credential is the Page token,
  // and its webhook subscription is the Page's.
  META_OAUTH_SCOPES: z
    .string()
    .default(
      'pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata,instagram_basic,instagram_manage_messages,business_management',
    ),
});

export type Env = z.infer<typeof envSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // Fail loudly at startup rather than at the first request that needs the value.
    process.stderr.write(
      `\nInvalid environment configuration:\n${formatIssues(parsed.error)}\n\n` +
        `Copy .env.example to .env and fill in the missing values.\n` +
        `Generate secrets with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\n\n`,
    );
    process.exit(1);
  }

  const value = parsed.data;

  if (value.NODE_ENV === 'production') {
    const productionErrors: string[] = [];
    if (value.ENABLE_DEV_TOOLS) {
      productionErrors.push('ENABLE_DEV_TOOLS must be false when NODE_ENV=production');
    }
    if (value.JWT_SECRET === value.JWT_REFRESH_SECRET) {
      productionErrors.push('JWT_SECRET and JWT_REFRESH_SECRET must differ');
    }
    if (!value.REDIS_URL) {
      productionErrors.push('REDIS_URL is required when NODE_ENV=production');
    }
    if (productionErrors.length > 0) {
      process.stderr.write(
        `\nInvalid production configuration:\n${productionErrors.map((e) => `  • ${e}`).join('\n')}\n\n`,
      );
      process.exit(1);
    }
  }

  return value;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';

/** Origins allowed to call the API with credentials. */
export const allowedOrigins: string[] = Array.from(
  new Set([env.FRONTEND_URL, ...env.CORS_ORIGINS].filter(Boolean)),
);

/** True only when every Meta credential the Facebook provider needs is present. */
export const isMetaConfigured = Boolean(
  env.META_APP_ID && env.META_APP_SECRET && env.META_WEBHOOK_VERIFY_TOKEN,
);

/**
 * The OAuth redirect Meta will call.
 *
 * Derived from BACKEND_URL when unset so the common single-host deployment
 * works with no extra variable, while a split-host or tunnelled setup can
 * override it to the public URL Meta can actually reach.
 */
export const metaOAuthRedirectUri =
  env.META_OAUTH_REDIRECT_URI ?? `${env.BACKEND_URL}/api/integrations/facebook/oauth/callback`;
