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
});
