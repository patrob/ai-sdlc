import { describe, test, expect } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  // BUG: This test is misaligned - it expects sync behavior but loadConfig is now async
  // The test will fail because it's missing await
  test('loads config', () => {
    const config = loadConfig(); // Missing await!
    // @ts-expect-error - This will be a Promise, not AppConfig
    expect(config.port).toBe(3000);
  });
});
