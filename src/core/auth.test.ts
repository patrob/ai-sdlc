import { describe, it, expect, beforeEach, vi } from 'vitest';
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
import { ProviderRegistry } from '../providers/registry.js';
import { ClaudeProvider } from '../providers/claude/index.js';

// Mock the provider registry
vi.mock('../providers/registry.js', () => ({
  ProviderRegistry: {
    getDefault: vi.fn(),
  },
}));

describe('auth (compatibility layer)', () => {
  let mockAuthenticator: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Clear environment variables
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

    // Create mock authenticator
    mockAuthenticator = {
      isConfigured: vi.fn(),
      getCredentialType: vi.fn(),
      configureAgentSdkAuth: vi.fn(),
      getTokenExpirationInfo: vi.fn(),
      getApiKeySource: vi.fn(),
    };

    // Mock provider registry to return our mock authenticator
    vi.mocked(ProviderRegistry.getDefault).mockReturnValue({
      getAuthenticator: () => mockAuthenticator,
    } as any);
  });

  describe('getApiKey', () => {
    it('should return API key from environment when configured', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key';
      mockAuthenticator.isConfigured.mockReturnValue(true);

      const result = getApiKey();

      expect(result).toBe('sk-ant-api-test-key');
    });

    it('should return OAuth token from environment when configured', () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat-test-token';
      mockAuthenticator.isConfigured.mockReturnValue(true);

      const result = getApiKey();

      expect(result).toBe('sk-ant-oat-test-token');
    });

    it('should return null when not configured', () => {
      mockAuthenticator.isConfigured.mockReturnValue(false);

      const result = getApiKey();

      expect(result).toBeNull();
    });
  });

  describe('getCredentialType', () => {
    it('should return "none" for null key', () => {
      const result = getCredentialType(null);
      expect(result).toBe('none');
    });

    it('should return "api_key" for API key credentials', () => {
      mockAuthenticator.getCredentialType.mockReturnValue('api_key');

      const result = getCredentialType('sk-ant-api-test');

      expect(result).toBe('api_key');
    });

    it('should return "oauth_token" for OAuth credentials', () => {
      mockAuthenticator.getCredentialType.mockReturnValue('oauth');

      const result = getCredentialType('sk-ant-oat-test');

      expect(result).toBe('oauth_token');
    });
  });

  describe('configureAgentSdkAuth', () => {
    it('should delegate to authenticator and return result', () => {
      mockAuthenticator.configureAgentSdkAuth.mockReturnValue({
        configured: true,
        type: 'api_key',
      });

      const result = configureAgentSdkAuth();

      expect(result).toEqual({
        configured: true,
        type: 'api_key',
      });
      expect(mockAuthenticator.configureAgentSdkAuth).toHaveBeenCalled();
    });

    it('should map oauth_token to oauth_token in result', () => {
      mockAuthenticator.configureAgentSdkAuth.mockReturnValue({
        configured: true,
        type: 'oauth_token',
      });

      const result = configureAgentSdkAuth();

      expect(result.type).toBe('oauth_token');
    });

    it('should handle authenticators without configureAgentSdkAuth method', () => {
      const simpleAuthenticator = {
        isConfigured: vi.fn().mockReturnValue(true),
        getCredentialType: vi.fn().mockReturnValue('api_key'),
      };

      vi.mocked(ProviderRegistry.getDefault).mockReturnValue({
        getAuthenticator: () => simpleAuthenticator,
      } as any);

      const result = configureAgentSdkAuth();

      expect(result.configured).toBe(true);
      expect(result.type).toBe('api_key');
    });
  });

  describe('getTokenExpirationInfo', () => {
    it('should delegate to authenticator when available', () => {
      const mockExpiration = {
        isExpired: false,
        expiresInMs: 3600000,
      };
      mockAuthenticator.getTokenExpirationInfo.mockReturnValue(mockExpiration);

      const result = getTokenExpirationInfo();

      expect(result.isExpired).toBe(false);
      expect(result.expiresInMs).toBe(3600000);
      expect(result.expiresAt).toBeNull();
      expect(result.source).toBeNull();
    });

    it('should return default values when authenticator lacks method', () => {
      mockAuthenticator.getTokenExpirationInfo = undefined;

      const result = getTokenExpirationInfo();

      expect(result).toEqual({
        isExpired: false,
        expiresAt: null,
        expiresInMs: null,
        source: null,
      });
    });
  });

  describe('hasApiKey', () => {
    it('should return true when configured', () => {
      mockAuthenticator.isConfigured.mockReturnValue(true);

      expect(hasApiKey()).toBe(true);
    });

    it('should return false when not configured', () => {
      mockAuthenticator.isConfigured.mockReturnValue(false);

      expect(hasApiKey()).toBe(false);
    });
  });

  describe('getApiKeySource', () => {
    it('should delegate to authenticator when method available', () => {
      mockAuthenticator.getApiKeySource.mockReturnValue('credentials_file');

      const result = getApiKeySource();

      expect(result).toBe('credentials_file');
      expect(mockAuthenticator.getApiKeySource).toHaveBeenCalled();
    });

    it('should return "env" when env var is set and method unavailable', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test';
      mockAuthenticator.getApiKeySource = undefined;

      const result = getApiKeySource();

      expect(result).toBe('env');
    });

    it('should return "none" when no credentials and method unavailable', () => {
      mockAuthenticator.getApiKeySource = undefined;

      const result = getApiKeySource();

      expect(result).toBe('none');
    });
  });

  describe('isTokenExpiringSoon', () => {
    it('should return false for undefined expiration', () => {
      expect(isTokenExpiringSoon(undefined)).toBe(false);
    });

    it('should return true when token expires within buffer', () => {
      const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // 2 minutes
      expect(isTokenExpiringSoon(expiresAt, 5 * 60 * 1000)).toBe(true);
    });

    it('should return false when token expires after buffer', () => {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
      expect(isTokenExpiringSoon(expiresAt, 5 * 60 * 1000)).toBe(false);
    });

    it('should return false for invalid date', () => {
      expect(isTokenExpiringSoon('invalid-date')).toBe(false);
    });

    it('should return false for already expired token', () => {
      const expiresAt = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      expect(isTokenExpiringSoon(expiresAt)).toBe(false);
    });
  });

  describe('isOAuthToken', () => {
    it('should return true for OAuth token format', () => {
      expect(isOAuthToken('sk-ant-oat-test-token')).toBe(true);
    });

    it('should return false for API key format', () => {
      expect(isOAuthToken('sk-ant-api-test-key')).toBe(false);
    });

    it('should return false for other formats', () => {
      expect(isOAuthToken('invalid-token')).toBe(false);
    });
  });

  describe('isDirectApiKey', () => {
    it('should return true for API key format', () => {
      expect(isDirectApiKey('sk-ant-api-test-key')).toBe(true);
    });

    it('should return false for OAuth token format', () => {
      expect(isDirectApiKey('sk-ant-oat-test-token')).toBe(false);
    });

    it('should return false for other formats', () => {
      expect(isDirectApiKey('invalid-key')).toBe(false);
    });
  });
});
