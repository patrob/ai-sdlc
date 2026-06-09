import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['tests/integration/fixtures/**', 'node_modules/**'],
    pool: 'forks',
    fileParallelism: true,
    // vitest 4: poolOptions.forks.minForks/maxForks were replaced by the
    // top-level maxWorkers option (minWorkers was removed)
    maxWorkers: 6,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '*.config.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
