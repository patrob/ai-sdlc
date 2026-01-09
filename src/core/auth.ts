import { execSync } from 'child_process';
import { platform } from 'os';

interface KeychainCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
  };
  // Legacy format
  accessToken?: string;
}

export type CredentialType = 'api_key' | 'oauth_token' | 'none';

/**
 * Get API key/token from various sources in order of preference:
 * 1. ANTHROPIC_API_KEY environment variable (direct API key)
 * 2. CLAUDE_CODE_OAUTH_TOKEN environment variable (OAuth token)
 * 3. macOS Keychain (Claude Code credentials)
 */
export function getApiKey(): string | null {
  // First check environment variables
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }

  // Try macOS Keychain
  if (platform() === 'darwin') {
    const keychainKey = getApiKeyFromKeychain();
    if (keychainKey) {
      return keychainKey;
    }
  }

  return null;
}

/**
 * Check if the API key is an OAuth token
 */
export function isOAuthToken(key: string): boolean {
  return key.startsWith('sk-ant-oat');
}

/**
 * Check if the API key is a direct API key
 */
export function isDirectApiKey(key: string): boolean {
  return key.startsWith('sk-ant-api');
}

/**
 * Get the credential type for a given key
 */
export function getCredentialType(key: string | null): CredentialType {
  if (!key) return 'none';
  if (isOAuthToken(key)) return 'oauth_token';
  return 'api_key';
}

/**
 * Configure environment variables for the Agent SDK based on credential type.
 * The Agent SDK uses:
 * - ANTHROPIC_API_KEY for direct API keys
 * - CLAUDE_CODE_OAUTH_TOKEN for OAuth tokens
 */
export function configureAgentSdkAuth(): { configured: boolean; type: CredentialType } {
  const key = getApiKey();
  if (!key) {
    return { configured: false, type: 'none' };
  }

  const credType = getCredentialType(key);

  if (credType === 'oauth_token') {
    // Set OAuth token for Agent SDK
    process.env.CLAUDE_CODE_OAUTH_TOKEN = key;
    // Clear API key to avoid confusion
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    // Set API key
    process.env.ANTHROPIC_API_KEY = key;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }

  return { configured: true, type: credType };
}

/**
 * Get API key from macOS Keychain
 * Claude Code stores OAuth credentials in "Claude Code-credentials"
 */
function getApiKeyFromKeychain(): string | null {
  try {
    // Try to get Claude Code OAuth credentials
    const credentials = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (credentials) {
      // The credentials are stored as JSON
      try {
        const parsed = JSON.parse(credentials) as KeychainCredentials;

        // Check for Claude AI OAuth format: {"claudeAiOauth":{"accessToken":"..."}}
        if (parsed.claudeAiOauth?.accessToken) {
          return parsed.claudeAiOauth.accessToken;
        }

        // Check for legacy format: {"accessToken":"..."}
        if (parsed.accessToken) {
          return parsed.accessToken;
        }
      } catch {
        // If not JSON, it might be the raw token
        if (credentials.startsWith('sk-') || credentials.length > 20) {
          return credentials;
        }
      }
    }
  } catch {
    // Keychain access failed - that's okay, we'll fall back
  }

  return null;
}

/**
 * Check if API key is available from any source
 */
export function hasApiKey(): boolean {
  return getApiKey() !== null;
}

/**
 * Get the source of the API key (for display purposes)
 */
export function getApiKeySource(): 'env' | 'keychain' | 'none' {
  if (process.env.ANTHROPIC_API_KEY) {
    return 'env';
  }

  if (platform() === 'darwin') {
    const keychainKey = getApiKeyFromKeychain();
    if (keychainKey) {
      return 'keychain';
    }
  }

  return 'none';
}
