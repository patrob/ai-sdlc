import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Disable git commit/tag signing for child git processes spawned during
    // the coverage run (the coverage config also runs the integration tests,
    // which create temp git repos). Mirrors vitest.integration.config.ts so
    // signed-commit environments don't break the coverage run.
    env: {
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'commit.gpgsign',
      GIT_CONFIG_VALUE_0: 'false',
      GIT_CONFIG_KEY_1: 'tag.gpgsign',
      GIT_CONFIG_VALUE_1: 'false',
    },
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['tests/integration/fixtures/**', 'node_modules/**'],
    pool: 'forks',
    fileParallelism: true,
    // vitest 4: poolOptions.forks.minForks/maxForks were replaced by the
    // top-level maxWorkers option (minWorkers was removed)
    maxWorkers: 6,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'cobertura'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '*.config.ts',
      ],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 75,
        lines: 70,
      },
    },
  },
});
