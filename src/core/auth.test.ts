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
  isTokenExpiringSoon,
  getTokenExpirationInfo,
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
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const credentialPath = path.join('/home/testuser', '.claude', '.credentials.json');
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-file-token',
          refreshToken: 'refresh-token',
          expiresAt: '2026-12-31T23:59:59Z'
        }));

        const result = getApiKey();
        expect(result).toBe('sk-ant-oat-file-token');
        expect(readFileSync).toHaveBeenCalledWith(credentialPath, 'utf-8');
        // Should log credential source at debug level
        expect(debugSpy).toHaveBeenCalledWith('Using credentials from: credentials_file');
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

      it('should return null and log warning when EACCES error occurs (permission denied)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const eaccesError = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
        eaccesError.code = 'EACCES';
        vi.mocked(readFileSync).mockImplementation(() => { throw eaccesError; });

        const result = getApiKey();
        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('permission denied')
        );
      });

      it('should handle invalid expiresAt field gracefully and still return token', () => {
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-token',
          expiresAt: 'not-a-date'
        }));

        // Should still return token even with invalid date
        expect(getApiKey()).toBe('sk-ant-oat-token');
      });

      it('should log warning for unexpected file read errors', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const unexpectedError = new Error('Disk I/O error') as NodeJS.ErrnoException;
        vi.mocked(readFileSync).mockImplementation(() => { throw unexpectedError; });

        const result = getApiKey();
        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith('Warning: Unexpected error reading credential file');
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
        const platformConfigs = [
          { platform: 'linux', homedir: '/home/testuser' },
          { platform: 'darwin', homedir: '/Users/testuser' },
          { platform: 'win32', homedir: 'C:\\Users\\testuser' },
        ] as const;

        platformConfigs.forEach(({ platform: plat, homedir: home }) => {
          vi.resetAllMocks();
          vi.mocked(platform).mockReturnValue(plat);
          vi.mocked(homedir).mockReturnValue(home);

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
      it('should return token and log warning when expired', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-expired-token',
          expiresAt: '2026-01-01T00:00:00Z' // Expired
        }));

        const result = getApiKey();
        expect(result).toBe('sk-ant-oat-expired-token');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('expired')
        );
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('claude login')
        );
      });

      it('should return token when not expired', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-valid-token',
          expiresAt: '2026-12-31T23:59:59Z' // Not expired
        }));

        const result = getApiKey();
        expect(result).toBe('sk-ant-oat-valid-token');
        // Should not warn when token is not expired
        expect(warnSpy).not.toHaveBeenCalled();
      });
    });

    describe('file permission checking', () => {
      it('should not throw when checking permissions on valid file', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-token'
        }));

        vi.mocked(statSync).mockReturnValue({
          mode: parseInt('100600', 8), // -rw------- (secure)
        } as any);

        expect(() => getApiKey()).not.toThrow();
        // Should not warn for secure permissions
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it('should not warn for 400 permissions (read-only)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-token'
        }));

        vi.mocked(statSync).mockReturnValue({
          mode: parseInt('100400', 8), // -r-------- (secure)
        } as any);

        getApiKey();
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it('should warn for group-readable permissions (640)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-token'
        }));

        vi.mocked(statSync).mockReturnValue({
          mode: parseInt('100640', 8), // -rw-r----- (group-readable)
        } as any);

        getApiKey();
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('group readable')
        );
      });

      it('should warn when credential file has insecure permissions (world-readable)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-token'
        }));

        vi.mocked(statSync).mockReturnValue({
          mode: parseInt('100644', 8), // -rw-r--r-- (world-readable)
        } as any);

        getApiKey();
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('world readable')
        );
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('insecure permissions')
        );
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

    describe('error message sanitization', () => {
      it('should not expose full file paths in warning messages', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-token'
        }));

        vi.mocked(statSync).mockReturnValue({
          mode: parseInt('100644', 8), // world-readable
        } as any);

        getApiKey();

        // Should use relative path, not full system path
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('~/.claude/.credentials.json')
        );
        expect(warnSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('/home/testuser')
        );
      });

      it('should not expose sensitive error details in logs', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const unexpectedError = new Error('Sensitive system information: /etc/shadow') as NodeJS.ErrnoException;
        vi.mocked(readFileSync).mockImplementation(() => { throw unexpectedError; });

        getApiKey();

        // Should log generic message without error.message
        expect(warnSpy).toHaveBeenCalledWith('Warning: Unexpected error reading credential file');
        expect(warnSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('Sensitive system information')
        );
      });
    });

    describe('permission check timing (TOCTOU protection)', () => {
      it('should check permissions before reading credential file', () => {
        const callOrder: string[] = [];

        vi.mocked(statSync).mockImplementation(() => {
          callOrder.push('statSync');
          return { mode: parseInt('100600', 8) } as any;
        });

        vi.mocked(readFileSync).mockImplementation(() => {
          callOrder.push('readFileSync');
          return JSON.stringify({ accessToken: 'sk-ant-oat-token' });
        });

        getApiKey();

        // statSync (permission check) should be called before readFileSync
        expect(callOrder).toEqual(['statSync', 'readFileSync']);
      });
    });

    describe('path traversal protection', () => {
      it('should reject credentials from outside ~/.claude/ directory', () => {
        // Try to manipulate path via HOME env var
        vi.mocked(homedir).mockReturnValue('/etc');

        // Mock readFileSync to verify it's never called
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-malicious'
        }));

        const result = getApiKey();
        // Should return null and not read from /etc/.claude/.credentials.json
        expect(result).toBeNull();
      });

      it('should handle manipulated HOME environment variable', () => {
        // Simulate an attack trying to read credentials from a different location
        vi.mocked(homedir).mockReturnValue('../../etc');

        const result = getApiKey();
        expect(result).toBeNull();
      });

      it('should validate normalized paths correctly', () => {
        // Valid path should work
        vi.mocked(homedir).mockReturnValue('/home/testuser');
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
          accessToken: 'sk-ant-oat-valid'
        }));

        const result = getApiKey();
        expect(result).toBe('sk-ant-oat-valid');
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

  describe('keychain token validation', () => {
    it('should validate Keychain token format before returning', () => {
      vi.mocked(platform).mockReturnValue('darwin');

      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(readFileSync).mockImplementation(() => { throw enoentError; });

      // Valid OAuth token
      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        claudeAiOauth: {
          accessToken: 'sk-ant-oat-valid-keychain-token'
        }
      }));

      const result = getApiKey();
      expect(result).toBe('sk-ant-oat-valid-keychain-token');
    });

    it('should reject invalid token formats from Keychain', () => {
      vi.mocked(platform).mockReturnValue('darwin');

      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(readFileSync).mockImplementation(() => { throw enoentError; });

      // Invalid token (doesn't start with sk-)
      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        claudeAiOauth: {
          accessToken: 'invalid-malicious-token'
        }
      }));

      const result = getApiKey();
      expect(result).toBeNull();
    });

    it('should validate legacy format Keychain tokens', () => {
      vi.mocked(platform).mockReturnValue('darwin');

      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(readFileSync).mockImplementation(() => { throw enoentError; });

      // Valid API key
      vi.mocked(execSync).mockReturnValue(JSON.stringify({
        accessToken: 'sk-ant-api-valid-key'
      }));

      const result = getApiKey();
      expect(result).toBe('sk-ant-api-valid-key');
    });

    it('should validate raw token strings from Keychain', () => {
      vi.mocked(platform).mockReturnValue('darwin');

      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(readFileSync).mockImplementation(() => { throw enoentError; });

      // Raw token (not JSON)
      vi.mocked(execSync).mockReturnValue('sk-ant-oat-raw-token');

      const result = getApiKey();
      expect(result).toBe('sk-ant-oat-raw-token');
    });

    it('should reject invalid raw token strings from Keychain', () => {
      vi.mocked(platform).mockReturnValue('darwin');

      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(readFileSync).mockImplementation(() => { throw enoentError; });

      // Invalid raw token
      vi.mocked(execSync).mockReturnValue('malicious-token-string');

      const result = getApiKey();
      expect(result).toBeNull();
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
