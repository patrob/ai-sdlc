import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['tests/integration/fixtures/**'],
    // Use forks instead of threads to support process.chdir() in tests
    pool: 'forks',
    // Enable file parallelism - each test file uses isolated fixture dirs
    fileParallelism: true,
    poolOptions: {
      forks: {
        // Use more workers for parallel integration tests
        minForks: 2,
        maxForks: 6,
      },
    },
  },
});
