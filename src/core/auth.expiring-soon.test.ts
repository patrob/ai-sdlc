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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getTokenExpirationInfo,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasApiKey,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isDirectApiKey,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isOAuthToken,
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
  describe('isTokenExpiringSoon', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should return true when token expires within default buffer (5 minutes)', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      // Token expires in 3 minutes
      const expiresAt = '2026-01-15T12:03:00Z';
      expect(isTokenExpiringSoon(expiresAt)).toBe(true);
    });

    it('should return false when token expires outside default buffer', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      // Token expires in 10 minutes
      const expiresAt = '2026-01-15T12:10:00Z';
      expect(isTokenExpiringSoon(expiresAt)).toBe(false);
    });

    it('should respect custom buffer values', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      // Token expires in 7 minutes
      const expiresAt = '2026-01-15T12:07:00Z';

      // With 5-minute buffer: false (7 > 5)
      expect(isTokenExpiringSoon(expiresAt, 5 * 60 * 1000)).toBe(false);

      // With 10-minute buffer: true (7 < 10)
      expect(isTokenExpiringSoon(expiresAt, 10 * 60 * 1000)).toBe(true);
    });

    it('should return false for tokens that already expired', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      // Token expired 1 minute ago
      const expiresAt = '2026-01-15T11:59:00Z';
      expect(isTokenExpiringSoon(expiresAt)).toBe(false);
    });

    it('should return false when expiresAt is undefined', () => {
      expect(isTokenExpiringSoon(undefined)).toBe(false);
    });

    it('should return false for malformed dates', () => {
      expect(isTokenExpiringSoon('invalid-date')).toBe(false);
      expect(isTokenExpiringSoon('not-a-timestamp')).toBe(false);
    });

    it('should handle tokens expiring exactly at buffer boundary', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      // Token expires in exactly 5 minutes
      const expiresAt = '2026-01-15T12:05:00Z';
      expect(isTokenExpiringSoon(expiresAt, 5 * 60 * 1000)).toBe(true);
    });
  });
});
