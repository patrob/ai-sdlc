import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeAuthenticator } from './authenticator.js';
import * as auth from '../../core/auth.js';

vi.mock('../../core/auth.js', () => ({
  configureAgentSdkAuth: vi.fn(),
  getApiKey: vi.fn(),
  getCredentialType: vi.fn(),
  getTokenExpirationInfo: vi.fn(),
}));

describe('ClaudeAuthenticator', () => {
  let authenticator: ClaudeAuthenticator;

  beforeEach(() => {
    authenticator = new ClaudeAuthenticator();
    vi.clearAllMocks();
  });

  describe('isConfigured', () => {
    it('should return true when credentials are configured', () => {
      vi.mocked(auth.configureAgentSdkAuth).mockReturnValue({ configured: true, type: 'api_key' });

      expect(authenticator.isConfigured()).toBe(true);
    });

    it('should return false when credentials are not configured', () => {
      vi.mocked(auth.configureAgentSdkAuth).mockReturnValue({ configured: false, type: 'none' });

      expect(authenticator.isConfigured()).toBe(false);
    });
  });

  describe('getCredentialType', () => {
    it('should return "api_key" for API key credentials', () => {
      vi.mocked(auth.getApiKey).mockReturnValue('sk-ant-api-test');
      vi.mocked(auth.getCredentialType).mockReturnValue('api_key');

      expect(authenticator.getCredentialType()).toBe('api_key');
    });

    it('should return "oauth" for OAuth token credentials', () => {
      vi.mocked(auth.getApiKey).mockReturnValue('sk-ant-oat-test');
      vi.mocked(auth.getCredentialType).mockReturnValue('oauth_token');

      expect(authenticator.getCredentialType()).toBe('oauth');
    });

    it('should return "none" when no credentials are configured', () => {
      vi.mocked(auth.getApiKey).mockReturnValue(null);
      vi.mocked(auth.getCredentialType).mockReturnValue('none');

      expect(authenticator.getCredentialType()).toBe('none');
    });
  });

  describe('configure', () => {
    it('should succeed when credentials are already configured', async () => {
      vi.mocked(auth.configureAgentSdkAuth).mockReturnValue({ configured: true, type: 'api_key' });

      await expect(authenticator.configure()).resolves.toBeUndefined();
    });

    it('should throw error when credentials are not configured', async () => {
      vi.mocked(auth.configureAgentSdkAuth).mockReturnValue({ configured: false, type: 'none' });

      await expect(authenticator.configure()).rejects.toThrow('Claude credentials not found');
    });
  });

  describe('validateCredentials', () => {
    it('should return true when credentials are configured', async () => {
      vi.mocked(auth.configureAgentSdkAuth).mockReturnValue({ configured: true, type: 'api_key' });

      const result = await authenticator.validateCredentials();
      expect(result).toBe(true);
    });

    it('should return false when credentials are not configured', async () => {
      vi.mocked(auth.configureAgentSdkAuth).mockReturnValue({ configured: false, type: 'none' });

      const result = await authenticator.validateCredentials();
      expect(result).toBe(false);
    });
  });

  describe('getTokenExpirationInfo', () => {
    it('should return expiration info for OAuth tokens', () => {
      const mockExpiration = {
        isExpired: false,
        expiresInMs: 3600000,
        expiresAt: new Date('2026-02-02T12:00:00Z'),
        source: '/path/to/credentials',
      };
      vi.mocked(auth.getTokenExpirationInfo).mockReturnValue(mockExpiration);

      const result = authenticator.getTokenExpirationInfo();

      expect(result).toEqual({
        isExpired: false,
        expiresInMs: 3600000,
      });
    });

    it('should return expired status when token is expired', () => {
      const mockExpiration = {
        isExpired: true,
        expiresInMs: -3600000,
        expiresAt: new Date('2026-02-01T11:00:00Z'),
        source: '/path/to/credentials',
      };
      vi.mocked(auth.getTokenExpirationInfo).mockReturnValue(mockExpiration);

      const result = authenticator.getTokenExpirationInfo();

      expect(result.isExpired).toBe(true);
      expect(result.expiresInMs).toBe(-3600000);
    });

    it('should handle null expiration info', () => {
      const mockExpiration = {
        isExpired: false,
        expiresInMs: null,
        expiresAt: null,
        source: null,
      };
      vi.mocked(auth.getTokenExpirationInfo).mockReturnValue(mockExpiration);

      const result = authenticator.getTokenExpirationInfo();

      expect(result).toEqual({
        isExpired: false,
        expiresInMs: null,
      });
    });
  });
});
