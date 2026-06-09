import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['tests/integration/**/*.test.ts', 'node_modules/**'],
    // Use forks instead of threads to support process.chdir() in tests
    pool: 'forks',
    // Enable file parallelism for faster execution
    fileParallelism: true,
    // vitest 4: poolOptions.forks.minForks/maxForks were replaced by the
    // top-level maxWorkers option (minWorkers was removed)
    maxWorkers: 8,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '*.config.ts',
      ],
    },
  },
});
