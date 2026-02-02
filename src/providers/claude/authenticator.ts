import type { IAuthenticator } from '../types.js';
import { configureAgentSdkAuth, getCredentialType, getApiKey, getTokenExpirationInfo, type CredentialType } from '../../core/auth.js';

/**
 * Authenticator for Claude AI provider
 *
 * Manages credential configuration, validation, and expiration checking
 * for Claude API access via API keys or OAuth tokens.
 */
export class ClaudeAuthenticator implements IAuthenticator {
  /**
   * Check if Claude credentials are configured
   *
   * @returns true if API key or OAuth token is available
   */
  isConfigured(): boolean {
    const result = configureAgentSdkAuth();
    return result.configured;
  }

  /**
   * Get the credential type being used
   *
   * @returns 'api_key' for API keys, 'oauth' for OAuth tokens, 'none' if not configured
   */
  getCredentialType(): 'api_key' | 'oauth' | 'none' {
    const key = getApiKey();
    const credType: CredentialType = getCredentialType(key);

    // Map internal CredentialType to IAuthenticator type
    if (credType === 'oauth_token') return 'oauth';
    if (credType === 'api_key') return 'api_key';
    return 'none';
  }

  /**
   * Configure Claude credentials
   *
   * This is a synchronous operation that checks for existing credentials.
   * For interactive credential setup, users should run `claude login` CLI command.
   */
  async configure(): Promise<void> {
    const result = configureAgentSdkAuth();
    if (!result.configured) {
      throw new Error(
        'Claude credentials not found. Set ANTHROPIC_API_KEY environment variable or run "claude login" to configure OAuth.'
      );
    }
  }

  /**
   * Validate that configured credentials are valid
   *
   * Currently performs basic validation (checks if credentials exist).
   * Does not make a test API call to verify credentials work.
   *
   * @returns true if credentials are configured, false otherwise
   */
  async validateCredentials(): Promise<boolean> {
    return this.isConfigured();
  }

  /**
   * Get token expiration information for OAuth tokens
   *
   * @returns Expiration info with isExpired flag and milliseconds until expiration
   */
  getTokenExpirationInfo(): { isExpired: boolean; expiresInMs: number | null } {
    const info = getTokenExpirationInfo();
    return {
      isExpired: info.isExpired,
      expiresInMs: info.expiresInMs,
    };
  }
}
