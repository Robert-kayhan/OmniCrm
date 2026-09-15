import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env, isDevelopment, isTest } from '../config/env';
import { logger } from '../config/logger';

/**
 * Prisma 7 is driver-adapter based: the query engine talks to Postgres through
 * `pg`, so pool tuning lives here rather than in the connection string.
 */
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: isTest ? 5 : 20,
  idleTimeoutMillis: 30_000,
  // Opening a socket through a virtualised Docker port proxy can take several
  // seconds cold, so tests get a longer grace period than production needs.
  connectionTimeoutMillis: isTest ? 30_000 : 10_000,
});

function createPrismaClient() {
  return new PrismaClient({
    adapter,
    // Acquiring a connection through a virtualised Docker port proxy can blow
    // past Prisma's 2s default maxWait, which surfaces as a spurious
    // "Unable to start a transaction in the given time" rather than a real
    // failure. Production keeps the tight defaults.
    ...(isTest ? { transactionOptions: { maxWait: 20_000, timeout: 30_000 } } : {}),
    log: isDevelopment
      ? [
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ]
      : [{ emit: 'event', level: 'error' }],
  });
}

type AppPrismaClient = ReturnType<typeof createPrismaClient>;

// tsx/vitest reload modules on change; without this a watch session would leak
// a new pool on every save.
const globalForPrisma = globalThis as unknown as { __omniCrmPrisma?: AppPrismaClient };

export const prisma: AppPrismaClient = globalForPrisma.__omniCrmPrisma ?? createPrismaClient();

if (!globalForPrisma.__omniCrmPrisma) {
  prisma.$on('error', (event) => {
    logger.error({ prisma: event }, 'Prisma error');
  });

  if (isDevelopment) {
    prisma.$on('warn', (event) => {
      logger.warn({ prisma: event }, 'Prisma warning');
    });
  }

  globalForPrisma.__omniCrmPrisma = prisma;
}

/** Transaction-scoped client. Repositories accept this so services can compose. */
export type PrismaTransaction = Parameters<Parameters<AppPrismaClient['$transaction']>[0]>[0];

/** Either the root client or an open transaction — the unit-of-work handle. */
export type Db = AppPrismaClient | PrismaTransaction;

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Database health check failed');
    return false;
  }
}
