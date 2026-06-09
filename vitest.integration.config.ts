import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Force git to skip commit/tag signing for all child git processes spawned
    // during the integration run (via execSync/spawnSync). Some environments
    // enforce commit signing globally (e.g. commit.gpgsign=true with an ssh
    // signing program) which causes `git commit` to fail inside the temp repos
    // these tests create. GIT_CONFIG_* env vars are inherited by child git
    // processes and override the global config. There is no host GIT_CONFIG_*
    // variable, so GIT_CONFIG_COUNT=2 is safe to set here.
    env: {
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'commit.gpgsign',
      GIT_CONFIG_VALUE_0: 'false',
      GIT_CONFIG_KEY_1: 'tag.gpgsign',
      GIT_CONFIG_VALUE_1: 'false',
    },
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['tests/integration/fixtures/**'],
    // Use forks instead of threads to support process.chdir() in tests
    pool: 'forks',
    // Enable file parallelism - each test file uses isolated fixture dirs
    fileParallelism: true,
    // vitest 4: poolOptions.forks.minForks/maxForks were replaced by the
    // top-level maxWorkers option (minWorkers was removed)
    maxWorkers: 6,
  },
});
