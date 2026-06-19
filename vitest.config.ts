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
      // 'cobertura' emits coverage/cobertura-coverage.xml so a standard
      // `vitest run --coverage` (this default config) produces the report
      // assessment tools look for, matching vitest.coverage.config.ts.
      reporter: ['text', 'json', 'html', 'cobertura'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '*.config.ts',
      ],
    },
  },
});
