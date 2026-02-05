/**
 * Generic authentication utilities
 *
 * This module provides a thin abstraction layer over provider-specific authentication.
 * All Claude-specific authentication logic has been moved to ClaudeAuthenticator.
 */

import { ProviderRegistry } from '../providers/registry.js';

/**
 * Credential types supported by providers
 */
export type CredentialType = 'api_key' | 'oauth_token' | 'none';

/**
 * Token expiration information
 */
export interface TokenExpirationInfo {
  /** Whether the token is currently expired (with clock skew buffer) */
  isExpired: boolean;
  /** Expiration date (null if not available or invalid) */
  expiresAt: Date | null;
  /** Milliseconds until expiration (null if not available or invalid) */
  expiresInMs: number | null;
  /** Source file path for debugging (null if not from file) */
  source: string | null;
}

/**
 * Get API key from the active provider
 * @deprecated Use provider.getAuthenticator() directly
 */
export function getApiKey(): string | null {
  const provider = ProviderRegistry.getDefault();
  const authenticator = provider.getAuthenticator() as any;

  // ClaudeAuthenticator has a private getApiKey() method
  // For backward compatibility, we check if credentials are configured
  if (authenticator.isConfigured()) {
    // We can't access the private method, but we know the credential is set in env vars
    return process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN || null;
  }

  return null;
}

/**
 * Get the credential type for a given key
 * @deprecated Use provider.getAuthenticator().getCredentialType() directly
 */
export function getCredentialType(key: string | null): CredentialType {
  if (!key) return 'none';

  const provider = ProviderRegistry.getDefault();
  const authenticator = provider.getAuthenticator();

  // Delegate to the authenticator
  const credType = authenticator.getCredentialType();
  if (credType === 'oauth') return 'oauth_token';
  return credType === 'api_key' ? 'api_key' : 'none';
}

/**
 * Configure environment variables for the Agent SDK
 * @deprecated Use provider.getAuthenticator().configureAgentSdkAuth() directly
 */
export function configureAgentSdkAuth(): { configured: boolean; type: CredentialType } {
  const provider = ProviderRegistry.getDefault();
  const authenticator = provider.getAuthenticator() as any;

  // Call the Claude-specific method
  if (typeof authenticator.configureAgentSdkAuth === 'function') {
    const result = authenticator.configureAgentSdkAuth();
    return {
      configured: result.configured,
      type: result.type === 'oauth_token' ? 'oauth_token' : result.type,
    };
  }

  // Fallback: check if configured
  return {
    configured: authenticator.isConfigured(),
    type: authenticator.getCredentialType() === 'oauth' ? 'oauth_token' : 'api_key',
  };
}

/**
 * Get token expiration information
 * @deprecated Use provider.getAuthenticator().getTokenExpirationInfo() directly
 */
export function getTokenExpirationInfo(): TokenExpirationInfo {
  const provider = ProviderRegistry.getDefault();
  const authenticator = provider.getAuthenticator();

  // Check if the authenticator supports token expiration info
  if (authenticator.getTokenExpirationInfo) {
    const info = authenticator.getTokenExpirationInfo();
    return {
      isExpired: info.isExpired,
      expiresAt: null, // Provider interface doesn't include expiresAt
      expiresInMs: info.expiresInMs,
      source: null, // Provider interface doesn't include source
    };
  }

  // Fallback for providers that don't support expiration info
  return {
    isExpired: false,
    expiresAt: null,
    expiresInMs: null,
    source: null,
  };
}

/**
 * Check if API key is available
 * @deprecated Use provider.getAuthenticator().isConfigured() directly
 */
export function hasApiKey(): boolean {
  const provider = ProviderRegistry.getDefault();
  const authenticator = provider.getAuthenticator();
  return authenticator.isConfigured();
}

/**
 * Check if a token expires within the given buffer period
 * Returns false if date is invalid or missing
 *
 * @param expiresAt - ISO 8601 date string
 * @param bufferMs - Time buffer in milliseconds (default: 5 minutes)
 */
export function isTokenExpiringSoon(expiresAt: string | undefined, bufferMs: number = 5 * 60 * 1000): boolean {
  if (!expiresAt) {
    return false;
  }

  try {
    const expiry = new Date(expiresAt);
    if (isNaN(expiry.getTime())) {
      return false;
    }

    const expiresInMs = expiry.getTime() - Date.now();
    return expiresInMs > 0 && expiresInMs <= bufferMs;
  } catch {
    return false;
  }
}

/**
 * Get the source of the API key (for display purposes)
 * @deprecated Use ClaudeAuthenticator.getApiKeySource() directly
 */
export function getApiKeySource(): 'env' | 'credentials_file' | 'keychain' | 'none' {
  const provider = ProviderRegistry.getDefault();
  const authenticator = provider.getAuthenticator() as any;

  // ClaudeAuthenticator has getApiKeySource() method
  if (typeof authenticator.getApiKeySource === 'function') {
    return authenticator.getApiKeySource();
  }

  // Fallback: check env vars
  if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return 'env';
  }

  return 'none';
}

/**
 * Check if the API key is an OAuth token
 * @deprecated Use provider-specific logic
 */
export function isOAuthToken(key: string): boolean {
  return key.startsWith('sk-ant-oat');
}

/**
 * Check if the API key is a direct API key
 * @deprecated Use provider-specific logic
 */
export function isDirectApiKey(key: string): boolean {
  return key.startsWith('sk-ant-api');
}
