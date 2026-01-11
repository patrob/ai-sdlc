import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Use forks instead of threads to support process.chdir() in tests
    pool: 'forks',
  },
});
