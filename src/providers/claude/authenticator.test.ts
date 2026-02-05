import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeAuthenticator } from './authenticator.js';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import * as os from 'os';

// Mock filesystem and OS modules
vi.mock('fs');
vi.mock('child_process');
vi.mock('os');

describe('ClaudeAuthenticator', () => {
  let authenticator: ClaudeAuthenticator;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    authenticator = new ClaudeAuthenticator();
    // Save original environment
    originalEnv = { ...process.env };
    // Clear auth-related env vars
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    vi.clearAllMocks();

    // Default mocks
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
    vi.mocked(os.platform).mockReturnValue('darwin');
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('isConfigured', () => {
    it('should return true when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';

      expect(authenticator.isConfigured()).toBe(true);
      expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-api-test-key');
    });

    it('should return true when CLAUDE_CODE_OAUTH_TOKEN is set', () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat-test-token';

      expect(authenticator.isConfigured()).toBe(true);
      expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('sk-ant-oat-test-token');
    });

    it('should return true when credential file exists', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          accessToken: 'sk-ant-oat-file-token',
          expiresAt: '2026-12-31T23:59:59Z',
        })
      );
      vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);

      expect(authenticator.isConfigured()).toBe(true);
    });

    it('should return true when keychain has credentials (macOS)', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { code: 'ENOENT' };
      });
      vi.mocked(childProcess.execSync).mockReturnValue(
        JSON.stringify({
          claudeAiOauth: {
            accessToken: 'sk-ant-oat-keychain-token',
          },
        })
      );

      expect(authenticator.isConfigured()).toBe(true);
    });

    it('should return false when no credentials are available', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { code: 'ENOENT' };
      });
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('Keychain access denied');
      });

      expect(authenticator.isConfigured()).toBe(false);
    });
  });

  describe('getCredentialType', () => {
    it('should return "api_key" for API key credentials', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';

      expect(authenticator.getCredentialType()).toBe('api_key');
    });

    it('should return "oauth" for OAuth token credentials', () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat-test-token';

      expect(authenticator.getCredentialType()).toBe('oauth');
    });

    it('should return "oauth" for OAuth token from credential file', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          accessToken: 'sk-ant-oat-file-token',
        })
      );
      vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);

      expect(authenticator.getCredentialType()).toBe('oauth');
    });

    it('should return "none" when no credentials are configured', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { code: 'ENOENT' };
      });

      expect(authenticator.getCredentialType()).toBe('none');
    });
  });

  describe('configure', () => {
    it('should succeed when credentials are already configured', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';

      await expect(authenticator.configure()).resolves.toBeUndefined();
    });

    it('should throw error when credentials are not configured', async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { code: 'ENOENT' };
      });

      await expect(authenticator.configure()).rejects.toThrow('Claude credentials not found');
    });
  });

  describe('validateCredentials', () => {
    it('should return true when credentials are configured', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';

      const result = await authenticator.validateCredentials();
      expect(result).toBe(true);
    });

    it('should return false when credentials are not configured', async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { code: 'ENOENT' };
      });

      const result = await authenticator.validateCredentials();
      expect(result).toBe(false);
    });
  });

  describe('getTokenExpirationInfo', () => {
    it('should return expiration info for OAuth tokens', () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          accessToken: 'sk-ant-oat-test-token',
          expiresAt: futureDate,
        })
      );
      vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);

      const result = authenticator.getTokenExpirationInfo();

      expect(result.isExpired).toBe(false);
      expect(result.expiresInMs).toBeGreaterThan(0);
    });

    it('should return expired status when token is expired', () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          accessToken: 'sk-ant-oat-test-token',
          expiresAt: pastDate,
        })
      );
      vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);

      const result = authenticator.getTokenExpirationInfo();

      expect(result.isExpired).toBe(true);
      expect(result.expiresInMs).toBeLessThan(0);
    });

    it('should handle null expiration info when no credential file', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { code: 'ENOENT' };
      });

      const result = authenticator.getTokenExpirationInfo();

      expect(result.isExpired).toBe(false);
      expect(result.expiresInMs).toBeNull();
    });

    it('should handle missing expiresAt field', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          accessToken: 'sk-ant-oat-test-token',
        })
      );
      vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);

      const result = authenticator.getTokenExpirationInfo();

      expect(result.isExpired).toBe(false);
      expect(result.expiresInMs).toBeNull();
    });

    it('should handle invalid date format', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          accessToken: 'sk-ant-oat-test-token',
          expiresAt: 'invalid-date',
        })
      );
      vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);

      const result = authenticator.getTokenExpirationInfo();

      expect(result.isExpired).toBe(false);
      expect(result.expiresInMs).toBeNull();
    });
  });

  describe('configureAgentSdkAuth', () => {
    it('should set ANTHROPIC_API_KEY for API key credentials', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';

      const result = authenticator.configureAgentSdkAuth();

      expect(result.configured).toBe(true);
      expect(result.type).toBe('api_key');
      expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-api-test-key');
      expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    });

    it('should set CLAUDE_CODE_OAUTH_TOKEN for OAuth credentials', () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat-test-token';

      const result = authenticator.configureAgentSdkAuth();

      expect(result.configured).toBe(true);
      expect(result.type).toBe('oauth_token');
      expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('sk-ant-oat-test-token');
      expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    });

    it('should return not configured when no credentials exist', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { code: 'ENOENT' };
      });

      const result = authenticator.configureAgentSdkAuth();

      expect(result.configured).toBe(false);
      expect(result.type).toBe('none');
    });
  });

  describe('credential priority', () => {
    it('should prefer ANTHROPIC_API_KEY over file and keychain', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-env-key';
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          accessToken: 'sk-ant-oat-file-token',
        })
      );
      vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);
      vi.mocked(childProcess.execSync).mockReturnValue('sk-ant-oat-keychain-token');

      const result = authenticator.configureAgentSdkAuth();

      expect(result.configured).toBe(true);
      expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-api-env-key');
    });

    it('should prefer CLAUDE_CODE_OAUTH_TOKEN over file and keychain', () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat-env-token';
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          accessToken: 'sk-ant-oat-file-token',
        })
      );
      vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);

      const result = authenticator.configureAgentSdkAuth();

      expect(result.configured).toBe(true);
      expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('sk-ant-oat-env-token');
    });

    it('should prefer credential file over keychain', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          accessToken: 'sk-ant-oat-file-token',
        })
      );
      vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);
      vi.mocked(childProcess.execSync).mockReturnValue('sk-ant-oat-keychain-token');

      authenticator.configureAgentSdkAuth();

      expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('sk-ant-oat-file-token');
    });
  });

  describe('getApiKeySource', () => {
    it('should return "env" when using environment variable', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';

      expect(authenticator.getApiKeySource()).toBe('env');
    });

    it('should return "credentials_file" when using credential file', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          accessToken: 'sk-ant-oat-file-token',
        })
      );
      vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);

      expect(authenticator.getApiKeySource()).toBe('credentials_file');
    });

    it('should return "keychain" when using macOS keychain', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { code: 'ENOENT' };
      });
      vi.mocked(childProcess.execSync).mockReturnValue(
        JSON.stringify({
          claudeAiOauth: {
            accessToken: 'sk-ant-oat-keychain-token',
          },
        })
      );

      expect(authenticator.getApiKeySource()).toBe('keychain');
    });

    it('should return "none" when no credentials available', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { code: 'ENOENT' };
      });
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('Keychain access denied');
      });

      expect(authenticator.getApiKeySource()).toBe('none');
    });
  });

  describe('edge cases', () => {
    it('should handle empty credential file', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('');

      expect(authenticator.isConfigured()).toBe(false);
    });

    it('should handle malformed JSON in credential file', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json }');

      expect(authenticator.isConfigured()).toBe(false);
    });

    it('should handle credential file without accessToken', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          refreshToken: 'some-refresh-token',
        })
      );

      expect(authenticator.isConfigured()).toBe(false);
    });

    it('should handle keychain access denial on macOS', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { code: 'ENOENT' };
      });
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('User denied access');
      });

      expect(authenticator.isConfigured()).toBe(false);
    });

    it('should not attempt keychain access on non-macOS platforms', () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw { code: 'ENOENT' };
      });

      expect(authenticator.isConfigured()).toBe(false);
      expect(childProcess.execSync).not.toHaveBeenCalled();
    });

    it('should warn about expired token when reading from file', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const pastDate = new Date(Date.now() - 3600000).toISOString();

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          accessToken: 'sk-ant-oat-test-token',
          expiresAt: pastDate,
        })
      );
      vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);

      authenticator.isConfigured();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('expired')
      );

      consoleSpy.mockRestore();
    });
  });
});
