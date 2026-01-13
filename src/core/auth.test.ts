import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';
import { platform, homedir } from 'os';
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import {
  getApiKey,
  getApiKeySource,
  isOAuthToken,
  isDirectApiKey,
  getCredentialType,
  hasApiKey,
  configureAgentSdkAuth,
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
    // Clean up environment variables
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

    // Restore real timers if used
    vi.useRealTimers();
  });

  describe('getApiKey', () => {
    describe('environment variable precedence', () => {
      it('should return ANTHROPIC_API_KEY when set', () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';
        expect(getApiKey()).toBe('sk-ant-api-test-key');
      });

      it('should return CLAUDE_CODE_OAUTH_TOKEN when set and ANTHROPIC_API_KEY is not', () => {
        process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat-test-token';
        expect(getApiKey()).toBe('sk-ant-oat-test-token');
      });

      it('should prefer ANTHROPIC_API_KEY over CLAUDE_CODE_OAUTH_TOKEN', () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';
        process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat-test-token';
        expect(getApiKey()).toBe('sk-ant-api-test-key');
      });
    });

    describe('credential file support', () => {
      it('should return token from credential file when env vars not set', () => {
        const credentialPath = path.join('/home/testuser', '.claude', '.credentials.json');
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-file-token',
          refreshToken: 'refresh-token',
          expiresAt: '2026-12-31T23:59:59Z'
        }));

        const result = getApiKey();
        expect(result).toBe('sk-ant-oat-file-token');
        expect(readFileSync).toHaveBeenCalledWith(credentialPath, 'utf-8');
      });

      it('should prefer env vars over credential file', () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-api-env-key';

        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-file-token'
        }));

        expect(getApiKey()).toBe('sk-ant-api-env-key');
        expect(readFileSync).not.toHaveBeenCalled();
      });

      it('should return token from credential file with only accessToken field', () => {
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-minimal-token'
        }));

        expect(getApiKey()).toBe('sk-ant-oat-minimal-token');
      });

      it('should return null when credential file does not exist (ENOENT)', () => {
        const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
        enoentError.code = 'ENOENT';
        vi.mocked(readFileSync).mockImplementation(() => { throw enoentError; });

        // Should not throw, just return null (will check Keychain on darwin)
        const result = getApiKey();
        expect(result).toBeNull();
      });

      it('should return null when credential file has malformed JSON', () => {
        vi.mocked(readFileSync).mockReturnValue('{ invalid json');

        const result = getApiKey();
        expect(result).toBeNull();
      });

      it('should return null when credential file is empty', () => {
        vi.mocked(readFileSync).mockReturnValue('');

        const result = getApiKey();
        expect(result).toBeNull();
      });

      it('should return null when credential file is missing accessToken field', () => {
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          refreshToken: 'refresh-token-only',
          expiresAt: '2026-12-31T23:59:59Z'
        }));

        const result = getApiKey();
        expect(result).toBeNull();
      });

      it('should return null when EACCES error occurs (permission denied)', () => {
        const eaccesError = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
        eaccesError.code = 'EACCES';
        vi.mocked(readFileSync).mockImplementation(() => { throw eaccesError; });

        const result = getApiKey();
        expect(result).toBeNull();
      });

      it('should handle invalid expiresAt field gracefully and still return token', () => {
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-token',
          expiresAt: 'not-a-date'
        }));

        // Should still return token even with invalid date
        expect(getApiKey()).toBe('sk-ant-oat-token');
      });
    });

    describe('platform-specific behavior', () => {
      it('should check credential file before Keychain on darwin', () => {
        vi.mocked(platform).mockReturnValue('darwin');
        vi.mocked(homedir).mockReturnValue('/Users/testuser');

        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-file-token'
        }));

        const result = getApiKey();
        expect(result).toBe('sk-ant-oat-file-token');
        expect(readFileSync).toHaveBeenCalled();
        expect(execSync).not.toHaveBeenCalled();
      });

      it('should fallback to Keychain on darwin when credential file returns null', () => {
        vi.mocked(platform).mockReturnValue('darwin');

        const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
        enoentError.code = 'ENOENT';
        vi.mocked(readFileSync).mockImplementation(() => { throw enoentError; });

        vi.mocked(execSync).mockReturnValue(JSON.stringify({
          claudeAiOauth: {
            accessToken: 'sk-ant-oat-keychain-token'
          }
        }));

        const result = getApiKey();
        expect(result).toBe('sk-ant-oat-keychain-token');
        expect(execSync).toHaveBeenCalled();
      });

      it('should check credential file on all platforms (linux, darwin, win32)', () => {
        const platforms = ['linux', 'darwin', 'win32'] as const;

        platforms.forEach((plat) => {
          vi.resetAllMocks();
          vi.mocked(platform).mockReturnValue(plat);
          vi.mocked(homedir).mockReturnValue('/home/testuser');

          vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
            accessToken: 'sk-ant-oat-token'
          }));

          const result = getApiKey();
          expect(result).toBe('sk-ant-oat-token');
          expect(readFileSync).toHaveBeenCalled();
        });
      });

      it('should not call Keychain on non-darwin platforms', () => {
        vi.mocked(platform).mockReturnValue('linux');

        const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
        enoentError.code = 'ENOENT';
        vi.mocked(readFileSync).mockImplementation(() => { throw enoentError; });

        const result = getApiKey();
        expect(result).toBeNull();
        expect(execSync).not.toHaveBeenCalled();
      });
    });

    describe('token expiration handling', () => {
      it('should return token even when expired (API will reject)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-expired-token',
          expiresAt: '2026-01-01T00:00:00Z' // Expired
        }));

        const result = getApiKey();
        expect(result).toBe('sk-ant-oat-expired-token');
      });

      it('should return token when not expired', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-valid-token',
          expiresAt: '2026-12-31T23:59:59Z' // Not expired
        }));

        const result = getApiKey();
        expect(result).toBe('sk-ant-oat-valid-token');
      });
    });

    describe('file permission checking', () => {
      it('should not throw when checking permissions on valid file', () => {
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-token'
        }));

        vi.mocked(statSync).mockReturnValue({
          mode: parseInt('100600', 8), // -rw------- (secure)
        } as any);

        expect(() => getApiKey()).not.toThrow();
      });

      it('should handle statSync errors gracefully', () => {
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-token'
        }));

        vi.mocked(statSync).mockImplementation(() => {
          throw new Error('stat failed');
        });

        // Should not throw, permission check should be graceful
        const result = getApiKey();
        expect(result).toBe('sk-ant-oat-token');
      });
    });
  });

  describe('getApiKeySource', () => {
    it('should return "env" when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';
      expect(getApiKeySource()).toBe('env');
    });

    it('should return "env" when CLAUDE_CODE_OAUTH_TOKEN is set', () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat-test-token';
      expect(getApiKeySource()).toBe('env');
    });

    it('should return "credentials_file" when token from credential file', () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-oat-file-token'
      }));

      expect(getApiKeySource()).toBe('credentials_file');
    });

    it('should return "keychain" when token from Keychain on darwin', () => {
      vi.mocked(platform).mockReturnValue('darwin');

      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(readFileSync).mockImplementation(() => { throw enoentError; });

      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        claudeAiOauth: {
          accessToken: 'sk-ant-oat-keychain-token'
        }
      }));

      expect(getApiKeySource()).toBe('keychain');
    });

    it('should return "none" when no credentials found', () => {
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(readFileSync).mockImplementation(() => { throw enoentError; });

      expect(getApiKeySource()).toBe('none');
    });
  });

  describe('existing functionality (backward compatibility)', () => {
    it('should identify OAuth tokens correctly', () => {
      expect(isOAuthToken('sk-ant-oat-test')).toBe(true);
      expect(isOAuthToken('sk-ant-api-test')).toBe(false);
    });

    it('should identify direct API keys correctly', () => {
      expect(isDirectApiKey('sk-ant-api-test')).toBe(true);
      expect(isDirectApiKey('sk-ant-oat-test')).toBe(false);
    });

    it('should get credential type correctly', () => {
      expect(getCredentialType('sk-ant-oat-test')).toBe('oauth_token');
      expect(getCredentialType('sk-ant-api-test')).toBe('api_key');
      expect(getCredentialType(null)).toBe('none');
    });

    it('should check if API key is available', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test';
      expect(hasApiKey()).toBe(true);

      delete process.env.ANTHROPIC_API_KEY;
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(readFileSync).mockImplementation(() => { throw enoentError; });
      expect(hasApiKey()).toBe(false);
    });

    it('should configure Agent SDK auth correctly for OAuth tokens', () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat-test';

      const result = configureAgentSdkAuth();
      expect(result.configured).toBe(true);
      expect(result.type).toBe('oauth_token');
      expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('sk-ant-oat-test');
      expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    });

    it('should configure Agent SDK auth correctly for API keys', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test';

      const result = configureAgentSdkAuth();
      expect(result.configured).toBe(true);
      expect(result.type).toBe('api_key');
      expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-api-test');
      expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    });
  });
});
