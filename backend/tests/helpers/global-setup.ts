import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

/**
 * Prepares the test database once per `vitest run`.
 *
 * Creates it if missing, then applies migrations — but only when the applied
 * set actually differs from `prisma/migrations`. Shelling out to the Prisma CLI
 * takes an advisory lock and several seconds of cold start, so skipping it on
 * the common path keeps the suite fast and avoids lock contention between runs.
 */
export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';

  const backendRoot = path.resolve(__dirname, '..', '..');
  // Read through the app's own loader so the URL cannot drift from runtime.
  const { env } = await import('../../src/config/env');
  const databaseUrl = new URL(env.DATABASE_URL);
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''));

  if (!databaseName.includes('test')) {
    throw new Error(
      `Refusing to run integration tests against "${databaseName}" - the test database name must contain "test".`,
    );
  }

  await ensureDatabaseExists(databaseUrl, databaseName);

  const expected = fs
    .readdirSync(path.join(backendRoot, 'prisma', 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (await migrationsAreCurrent(env.DATABASE_URL, expected)) return;

  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: backendRoot,
      env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
  } catch (error) {
    // execFileSync hides the CLI output on failure; surface it or debugging a
    // broken suite means guessing.
    const detail = error as { stdout?: string; stderr?: string };
    throw new Error(
      `prisma migrate deploy failed for the test database.\n${detail.stdout ?? ''}\n${detail.stderr ?? ''}`,
    );
  }
}

async function ensureDatabaseExists(databaseUrl: URL, databaseName: string): Promise<void> {
  const adminUrl = new URL(databaseUrl.toString());
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    if (existing.rowCount === 0) {
      // Identifiers cannot be parameterised; the name is validated above.
      await admin.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
    }
  } finally {
    await admin.end();
  }
}

async function migrationsAreCurrent(connectionString: string, expected: string[]): Promise<boolean> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const applied = await client.query<{ migration_name: string }>(
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name',
    );
    const names = applied.rows.map((row) => row.migration_name);
    return expected.length === names.length && expected.every((name, index) => name === names[index]);
  } catch {
    // No _prisma_migrations table yet: a fresh database needs the CLI.
    return false;
  } finally {
    await client.end();
  }
}
