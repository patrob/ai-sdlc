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
});
