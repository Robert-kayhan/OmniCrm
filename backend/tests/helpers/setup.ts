import { afterAll, beforeAll, beforeEach } from 'vitest';
import { closeTestApp, db, initTestApp } from './app';

beforeAll(async () => {
  await initTestApp();
});

/**
 * Resets the database between tests.
 *
 * `DELETE`, not `TRUNCATE`: truncating rewrites the relfilenode of every table
 * and fsyncs each one, which on a virtualised Docker volume costs tens of
 * seconds per test and serialises the whole suite behind an ACCESS EXCLUSIVE
 * lock. Deleting touches only the rows that exist, and these tables hold a
 * handful each.
 *
 * Deleting organizations cascades to users, teams, integrations, customers,
 * conversations, messages, tags, notes, notifications and audit logs — every
 * tenant-scoped table. `webhook_events` survives an integration delete by
 * design (`onDelete: SetNull`), so it is cleared explicitly.
 */
beforeEach(async () => {
  // Deliberately not wrapped in $transaction. Nothing else touches the database
  // during cleanup, so atomicity buys nothing — and opening an interactive
  // transaction adds a connection-acquisition wait that fails intermittently
  // when the Docker port proxy is slow.
  await db().$executeRawUnsafe('DELETE FROM "public"."webhook_events"');
  await db().$executeRawUnsafe('DELETE FROM "public"."organizations"');
});

afterAll(async () => {
  // Closing the application runs the shutdown hooks, which disconnect Prisma
  // and Redis — so the suite does not leave a pool open behind it.
  await closeTestApp();
});
