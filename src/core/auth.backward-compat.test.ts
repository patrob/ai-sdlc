import { readFileSync } from 'fs';
import { homedir,platform } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  configureAgentSdkAuth,
  getCredentialType,
  hasApiKey,
  isDirectApiKey,
  isOAuthToken,
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
