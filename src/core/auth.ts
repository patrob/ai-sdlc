import { execSync } from 'child_process';
import { platform, homedir } from 'os';
import { readFileSync, statSync } from 'fs';
import path from 'path';

interface KeychainCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
  };
  // Legacy format
  accessToken?: string;
}

/**
 * Credential file format used by Claude Code CLI
 * Located at ~/.claude/.credentials.json
 */
interface CredentialFile {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

export type CredentialType = 'api_key' | 'oauth_token' | 'none';

/**
 * Read credentials from ~/.claude/.credentials.json file
 * Returns null if file doesn't exist, is malformed, or missing accessToken
 */
function getCredentialsFromFile(): CredentialFile | null {
  try {
    const credentialPath = path.join(homedir(), '.claude', '.credentials.json');
    const content = readFileSync(credentialPath, 'utf-8');

    // Handle empty file
    if (!content || content.trim() === '') {
      return null;
    }

    const parsed = JSON.parse(content) as Partial<CredentialFile>;

    // Validate required accessToken field
    if (!parsed.accessToken) {
      return null;
    }

    return parsed as CredentialFile;
  } catch (error: any) {
    // File not found - expected case
    if (error.code === 'ENOENT') {
      return null;
    }

    // Permission denied - log warning
    if (error.code === 'EACCES') {
      console.warn('Warning: Cannot read credential file - permission denied');
      return null;
    }

    // JSON parse error - malformed file
    if (error instanceof SyntaxError) {
      return null;
    }

    // Unknown error - log and return null
    console.warn('Warning: Unexpected error reading credentials:', error.message);
    return null;
  }
}

/**
 * Check if a token is expired based on ISO8601 expiresAt date
 * Returns false if date is invalid or missing (assume token is valid)
 */
function isTokenExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) {
    return false; // No expiration date, assume valid
  }

  try {
    const expiry = new Date(expiresAt);
    // Check if date is valid (not NaN)
    if (isNaN(expiry.getTime())) {
      return false; // Invalid date, skip expiration check
    }

    return Date.now() >= expiry.getTime();
  } catch {
    return false; // Parse error, skip expiration check
  }
}

/**
 * Check credential file permissions and warn if insecure
 */
function checkFilePermissions(filePath: string): void {
  try {
    const stats = statSync(filePath);
    const mode = stats.mode & parseInt('777', 8);

    // Warn if file is world-readable or group-readable (permissions more permissive than 600)
    if (mode & parseInt('044', 8)) {
      console.warn(`Warning: Credential file ${filePath} has insecure permissions (${mode.toString(8)}). Recommend: chmod 600`);
    }
  } catch {
    // If we can't stat the file, ignore (file might not exist)
  }
}

/**
 * Get API key/token from various sources in order of preference:
 * 1. ANTHROPIC_API_KEY environment variable (direct API key)
 * 2. CLAUDE_CODE_OAUTH_TOKEN environment variable (OAuth token)
 * 3. Credential file at ~/.claude/.credentials.json (all platforms)
 * 4. macOS Keychain (Claude Code credentials, darwin only)
 */
export function getApiKey(): string | null {
  // First check environment variables
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }

  // Try credential file (all platforms)
  const credentials = getCredentialsFromFile();
  if (credentials) {
    const credentialPath = path.join(homedir(), '.claude', '.credentials.json');

    // Check file permissions
    checkFilePermissions(credentialPath);

    // Check if token is expired and warn
    if (isTokenExpired(credentials.expiresAt)) {
      console.warn('Warning: Credential file token is expired. Run "claude login" to refresh.');
    }

    console.debug('Using credentials from: credentials_file');
    return credentials.accessToken;
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
export function getApiKeySource(): 'env' | 'credentials_file' | 'keychain' | 'none' {
  if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return 'env';
  }

  const credentials = getCredentialsFromFile();
  if (credentials) {
    return 'credentials_file';
  }

  if (platform() === 'darwin') {
    const keychainKey = getApiKeyFromKeychain();
    if (keychainKey) {
      return 'keychain';
    }
  }

  return 'none';
}
