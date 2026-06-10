// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { execSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { existsSync, readFileSync, statSync } from 'fs';
import { homedir,platform } from 'os';
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
  describe('getTokenExpirationInfo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should return correct expiration info for valid token', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token',
        expiresAt: '2026-01-15T12:10:00Z' // 10 minutes from now
      }));

      const info = getTokenExpirationInfo();

      expect(info.isExpired).toBe(false);
      expect(info.expiresAt).toEqual(new Date('2026-01-15T12:10:00Z'));
      expect(info.expiresInMs).toBe(10 * 60 * 1000);
      expect(info.source).toBe(path.join('/home/testuser', '.claude', '.credentials.json'));
    });

    it('should detect expired tokens', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token',
        expiresAt: '2026-01-15T11:00:00Z' // 1 hour ago
      }));

      const info = getTokenExpirationInfo();

      expect(info.isExpired).toBe(true);
      expect(info.expiresAt).toEqual(new Date('2026-01-15T11:00:00Z'));
      expect(info.expiresInMs).toBe(-60 * 60 * 1000); // negative (already expired)
      expect(info.source).not.toBeNull();
    });

    it('should handle missing expiresAt field', () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token'
        // no expiresAt
      }));

      const info = getTokenExpirationInfo();

      expect(info.isExpired).toBe(false);
      expect(info.expiresAt).toBeNull();
      expect(info.expiresInMs).toBeNull();
      expect(info.source).toBe(path.join('/home/testuser', '.claude', '.credentials.json'));
    });

    it('should handle null expiresAt field', () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token',
        expiresAt: null
      }));

      const info = getTokenExpirationInfo();

      expect(info.isExpired).toBe(false);
      expect(info.expiresAt).toBeNull();
      expect(info.expiresInMs).toBeNull();
    });

    it('should handle malformed expiresAt date', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token',
        expiresAt: 'invalid-date-string'
      }));

      const info = getTokenExpirationInfo();

      expect(info.isExpired).toBe(false);
      expect(info.expiresAt).toBeNull();
      expect(info.expiresInMs).toBeNull();
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid date format')
      );
    });

    it('should handle credentials file not found', () => {
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(readFileSync).mockImplementation(() => { throw enoentError; });

      const info = getTokenExpirationInfo();

      expect(info.isExpired).toBe(false);
      expect(info.expiresAt).toBeNull();
      expect(info.expiresInMs).toBeNull();
      expect(info.source).toBeNull();
    });

    it('should include credential source path for debugging', () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token',
        expiresAt: '2026-12-31T23:59:59Z'
      }));

      const info = getTokenExpirationInfo();

      expect(info.source).toContain('.claude');
      expect(info.source).toContain('.credentials.json');
    });

    it('should calculate negative expiresInMs for expired tokens', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token',
        expiresAt: '2026-01-15T11:55:00Z' // 5 minutes ago
      }));

      const info = getTokenExpirationInfo();

      expect(info.expiresInMs).toBe(-5 * 60 * 1000);
      expect(info.isExpired).toBe(true);
    });

    it('should handle tokens expiring within clock skew buffer', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

      // Token expires in 15 seconds (within 30-second buffer)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-token',
        expiresAt: '2026-01-15T12:00:15Z'
      }));

      const info = getTokenExpirationInfo();

      // Should be considered expired due to 30-second clock skew buffer
      expect(info.isExpired).toBe(true);
      expect(info.expiresInMs).toBe(15 * 1000);
    });
  });
});
