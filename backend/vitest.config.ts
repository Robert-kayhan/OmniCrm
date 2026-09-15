import { defineConfig } from 'vitest/config';

/**
 * Two projects with different needs: unit tests are pure and run in parallel,
 * integration tests share one Postgres database and so run single-file to keep
 * truncation between tests deterministic.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Integration tests share one database, so files must not overlap.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/helpers/global-setup.ts'],
          setupFiles: ['tests/helpers/setup.ts'],
          hookTimeout: 60_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
