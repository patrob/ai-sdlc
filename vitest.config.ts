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
    poolOptions: {
      forks: {
        // Use more workers for parallel execution (up to CPU count)
        minForks: 4,
        maxForks: 8,
      },
    },
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
