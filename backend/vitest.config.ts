import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * SWC does the transform rather than Vitest's default esbuild.
 *
 * esbuild parses decorators but does not emit `design:paramtypes`, which is the
 * metadata Nest's container reads to resolve a constructor — without it every
 * injected dependency arrives as `undefined`. The plugin is attached to each
 * project rather than the root because Vitest projects do not inherit the root
 * plugin list.
 */
const swcPlugin = () =>
  swc.vite({
    module: { type: 'es6' },
    jsc: {
      target: 'es2022',
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
    },
  });

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
        plugins: [swcPlugin()],
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [swcPlugin()],
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
