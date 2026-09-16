import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env, isDevelopment, isTest } from '../config/env';

/**
 * Prisma 7 is driver-adapter based: the query engine talks to Postgres through
 * `pg`, so pool tuning lives here rather than in the connection string.
 */
function createAdapter(): PrismaPg {
  return new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: isTest ? 5 : 20,
    idleTimeoutMillis: 30_000,
    // Opening a socket through a virtualised Docker port proxy can take several
    // seconds cold, so tests get a longer grace period than production needs.
    connectionTimeoutMillis: isTest ? 30_000 : 10_000,
  });
}

const clientOptions = () =>
  ({
    adapter: createAdapter(),
    // Acquiring a connection through a virtualised Docker port proxy can blow
    // past Prisma's 2s default maxWait, which surfaces as a spurious
    // "Unable to start a transaction in the given time" rather than a real
    // failure. Production keeps the tight defaults.
    ...(isTest ? { transactionOptions: { maxWait: 20_000, timeout: 30_000 } } : {}),
    log: isDevelopment
      ? ([
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ] as const)
      : ([{ emit: 'event', level: 'error' }] as const),
  }) satisfies ConstructorParameters<typeof PrismaClient>[0];

/**
 * The database handle every service injects.
 *
 * Extending PrismaClient rather than wrapping it keeps the full typed model API
 * (`this.prisma.conversation.findMany(...)`) available to callers, while
 * Nest's lifecycle hooks take over connecting and draining the pool — the
 * container now owns that, not a module-level singleton.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super(clientOptions());

    // The generated `PrismaClient` carries its log-event union as a type
    // parameter that is only inferred at `new PrismaClient(...)`. Subclassing
    // erases it back to the `never` default, which would make `$on('error')` a
    // type error, so the events are subscribed through a narrowed view of the
    // same instance. The levels here match `clientOptions().log` above.
    const events = this as unknown as PrismaClient<'warn' | 'error'>;

    events.$on('error', (event) => {
      this.logger.error({ prisma: event }, 'Prisma error');
    });

    if (isDevelopment) {
      events.$on('warn', (event) => {
        this.logger.warn({ prisma: event }, 'Prisma warning');
      });
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error({ err: error }, 'Database health check failed');
      return false;
    }
  }
}

/** Transaction-scoped client. Services accept this so they can compose. */
export type PrismaTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** Either the root client or an open transaction — the unit-of-work handle. */
export type Db = PrismaService | PrismaTransaction;
