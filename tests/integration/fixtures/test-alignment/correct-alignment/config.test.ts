import { describe, test, expect } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  // Correctly aligned test - uses await for async function
  test('loads config', async () => {
    const config = await loadConfig();
    expect(config.port).toBe(3000);
    expect(config.host).toBe('localhost');
    expect(config.database).toBe('postgres://localhost/myapp');
  });
});
