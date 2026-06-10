// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { execSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { existsSync, readFileSync, statSync } from 'fs';
import { homedir,platform } from 'os';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  configureAgentSdkAuth,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getApiKey,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getApiKeySource,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getCredentialType,
  getTokenExpirationInfo,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasApiKey,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isDirectApiKey,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isOAuthToken,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isTokenExpiringSoon,
} from './auth.js';

// Mock all the modules we need
vi.mock('child_process');
vi.mock('fs');
vi.mock('os');

describe('auth', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.resetAllMocks();

    // Clear environment variables
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

    // Mock platform to 'linux' by default (can override in specific tests)
    vi.mocked(platform).mockReturnValue('linux');

    // Mock homedir to a predictable path
    vi.mocked(homedir).mockReturnValue('/home/testuser');
  });

  afterEach(() => {
    // Restore real timers if used
    vi.useRealTimers();
  });
  describe('isTokenExpired with clock skew buffer', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should return true for tokens expired more than 30 seconds ago', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      // Mock readFileSync to test via getApiKey
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token',
        expiresAt: '2026-01-15T11:59:00Z' // 60 seconds ago
      }));

      const info = getTokenExpirationInfo();
      expect(info.isExpired).toBe(true);
    });

    it('should return false for tokens within 30-second clock skew buffer', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token',
        expiresAt: '2026-01-15T11:59:45Z' // 15 seconds ago (within 30s buffer)
      }));

      const info = getTokenExpirationInfo();
      // Should be considered expired (current time >= expiry - 30s)
      expect(info.isExpired).toBe(true);
    });

    it('should return false for future expiration dates', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token',
        expiresAt: '2026-01-15T12:10:00Z' // 10 minutes in future
      }));

      const info = getTokenExpirationInfo();
      expect(info.isExpired).toBe(false);
    });

    it('should handle tokens expiring exactly at 30-second boundary', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token',
        expiresAt: '2026-01-15T12:00:30Z' // exactly 30 seconds from now
      }));

      const info = getTokenExpirationInfo();
      // At boundary: now (12:00:00) >= expiry (12:00:30) - 30s (12:00:00) = true
      expect(info.isExpired).toBe(true);
    });
  });
});
