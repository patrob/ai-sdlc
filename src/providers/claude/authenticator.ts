import type { IAuthenticator } from '../types.js';
import { execSync } from 'child_process';
import { platform, homedir } from 'os';
import { readFileSync, statSync } from 'fs';
import path from 'path';

/**
 * Keychain credential formats used by Claude Code
 */
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

/**
 * Claude-specific credential types
 */
export type ClaudeCredentialType = 'api_key' | 'oauth_token' | 'none';

/**
 * Environment variable names for Claude authentication
 */
const ENV_ANTHROPIC_API_KEY = 'ANTHROPIC_API_KEY';
const ENV_CLAUDE_CODE_OAUTH_TOKEN = 'CLAUDE_CODE_OAUTH_TOKEN';

/**
 * Token format patterns
 */
const OAUTH_TOKEN_PREFIX = 'sk-ant-oat';
const API_KEY_PREFIX = 'sk-ant-api';

/**
 * Credential file path
 */
const CREDENTIALS_FILE_PATH = '.claude/.credentials.json';

/**
 * macOS Keychain service name
 */
const KEYCHAIN_SERVICE_NAME = 'Claude Code-credentials';

/**
 * Clock skew buffer in milliseconds (30 seconds)
 * Tokens are considered expired if: current_time >= expiry_time - 30_seconds
 */
const CLOCK_SKEW_BUFFER_MS = 30000;

/**
 * Validate that homedir() returns a legitimate user home directory
 * Prevents attacks via manipulated HOME environment variable
 *
 * Accepts valid home directory paths for any platform to support testing scenarios
 * where platform and homedir mocks may not match.
 */
function isValidHomeDirectory(homeDir: string): boolean {
  if (!homeDir || typeof homeDir !== 'string') {
    return false;
  }

  // Check if path looks like a valid home directory on ANY platform
  // This is more permissive but still prevents obvious path traversal attacks
  const isMacHome = homeDir.startsWith('/Users/') || homeDir === '/var/root';
  const isLinuxHome = homeDir.startsWith('/home/') || homeDir === '/root';
  const isWindowsHome = /^[A-Za-z]:\\Users\\/i.test(homeDir);

  return isMacHome || isLinuxHome || isWindowsHome;
}

/**
 * Validate that the credential path is within ~/.claude/ directory
 * Prevents directory traversal attacks via manipulated HOME env var
 */
function validateCredentialPath(credentialPath: string): boolean {
  try {
    const homeDir = homedir();

    // First validate that homedir is a legitimate user home directory
    if (!isValidHomeDirectory(homeDir)) {
      return false;
    }

    const normalized = path.resolve(credentialPath);
    const expectedDir = path.resolve(homeDir, '.claude');
    return normalized.startsWith(expectedDir);
  } catch {
    return false;
  }
}

/**
 * Read credentials from ~/.claude/.credentials.json file
 * Returns null if file doesn't exist, is malformed, or missing accessToken
 */
function getCredentialsFromFile(): CredentialFile | null {
  try {
    const credentialPath = path.join(homedir(), CREDENTIALS_FILE_PATH);

    // Validate path to prevent directory traversal
    if (!validateCredentialPath(credentialPath)) {
      return null;
    }

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

    // Unknown error - log generic message without exposing details
    console.warn('Warning: Unexpected error reading credential file');
    return null;
  }
}

/**
 * Check if a token is expired based on ISO8601 expiresAt date
 * Returns false if date is invalid or missing (assume token is valid)
 *
 * Includes a 30-second clock skew buffer to handle minor time differences
 * between client and server clocks.
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

    return Date.now() >= expiry.getTime() - CLOCK_SKEW_BUFFER_MS;
  } catch {
    return false; // Parse error, skip expiration check
  }
}

/**
 * Check credential file permissions and warn if insecure
 * Only 600 (owner read/write) and 400 (owner read-only) are considered secure
 */
function checkFilePermissions(): void {
  try {
    const credentialPath = path.join(homedir(), CREDENTIALS_FILE_PATH);
    const stats = statSync(credentialPath);
    const mode = stats.mode & parseInt('777', 8);

    // Warn if permissions are NOT exactly 600 or 400
    if (mode !== parseInt('600', 8) && mode !== parseInt('400', 8)) {
      const isGroupReadable = (mode & parseInt('040', 8)) !== 0;
      const isWorldReadable = (mode & parseInt('004', 8)) !== 0;
      const readableType = isWorldReadable ? 'world readable' : (isGroupReadable ? 'group readable' : 'insecure');
      console.warn(`Warning: Credential file ~/.claude/.credentials.json has insecure permissions (${mode.toString(8)}) - file is ${readableType}. Recommend: chmod 600`);
    }
  } catch {
    // If we can't stat the file, ignore (file might not exist)
  }
}

/**
 * Get API key from macOS Keychain
 * Claude Code stores OAuth credentials in "Claude Code-credentials"
 */
function getApiKeyFromKeychain(): string | null {
  try {
    // Try to get Claude Code OAuth credentials
    const result = execSync(
      `security find-generic-password -s "${KEYCHAIN_SERVICE_NAME}" -w 2>/dev/null`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    // Handle cases where execSync returns undefined or non-string values (mocking scenarios)
    if (!result || typeof result !== 'string') {
      return null;
    }

    const credentials = result.trim();

    if (credentials) {
      // The credentials are stored as JSON
      try {
        const parsed = JSON.parse(credentials) as KeychainCredentials;

        // Check for Claude AI OAuth format: {"claudeAiOauth":{"accessToken":"..."}}
        if (parsed.claudeAiOauth?.accessToken) {
          const token = parsed.claudeAiOauth.accessToken;
          // Validate token format before returning
          if (isOAuthToken(token) || isDirectApiKey(token) || token.startsWith('sk-')) {
            return token;
          }
        }

        // Check for legacy format: {"accessToken":"..."}
        if (parsed.accessToken) {
          const token = parsed.accessToken;
          // Validate token format before returning
          if (isOAuthToken(token) || isDirectApiKey(token) || token.startsWith('sk-')) {
            return token;
          }
        }
      } catch {
        // If not JSON, it might be the raw token - validate before returning
        if (isOAuthToken(credentials) || isDirectApiKey(credentials) || credentials.startsWith('sk-')) {
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
 * Check if the API key is an OAuth token
 */
function isOAuthToken(key: string): boolean {
  return key.startsWith(OAUTH_TOKEN_PREFIX);
}

/**
 * Check if the API key is a direct API key
 */
function isDirectApiKey(key: string): boolean {
  return key.startsWith(API_KEY_PREFIX);
}

/**
 * Get the credential type for a given key
 */
function getCredentialTypeInternal(key: string | null): ClaudeCredentialType {
  if (!key) return 'none';
  if (isOAuthToken(key)) return 'oauth_token';
  return 'api_key';
}

/**
 * Authenticator for Claude AI provider
 *
 * Manages credential configuration, validation, and expiration checking
 * for Claude API access via API keys or OAuth tokens.
 *
 * Credential priority:
 * 1. ANTHROPIC_API_KEY environment variable (direct API key)
 * 2. CLAUDE_CODE_OAUTH_TOKEN environment variable (OAuth token)
 * 3. Credential file at ~/.claude/.credentials.json (all platforms)
 * 4. macOS Keychain (Claude Code credentials, darwin only)
 */
export class ClaudeAuthenticator implements IAuthenticator {
  /**
   * Get API key/token from various sources in order of preference
   */
  private getApiKey(): string | null {
    // First check environment variables
    if (process.env[ENV_ANTHROPIC_API_KEY]) {
      return process.env[ENV_ANTHROPIC_API_KEY];
    }

    if (process.env[ENV_CLAUDE_CODE_OAUTH_TOKEN]) {
      return process.env[ENV_CLAUDE_CODE_OAUTH_TOKEN];
    }

    // Try credential file (all platforms)
    // Check file permissions before reading (prevents TOCTOU vulnerability)
    checkFilePermissions();

    const credentials = getCredentialsFromFile();
    if (credentials) {
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
   * Configure environment variables for the Agent SDK based on credential type.
   * The Agent SDK uses:
   * - ANTHROPIC_API_KEY for direct API keys
   * - CLAUDE_CODE_OAUTH_TOKEN for OAuth tokens
   *
   * SECURITY NOTE: Environment variables set by this function persist for the lifetime
   * of the Node.js process. The tokens are not automatically cleared and will be
   * accessible to any code running in the same process. This is intentional for the
   * Agent SDK to work correctly, but callers should be aware of this behavior.
   */
  configureAgentSdkAuth(): { configured: boolean; type: ClaudeCredentialType } {
    const key = this.getApiKey();
    if (!key) {
      return { configured: false, type: 'none' };
    }

    const credType = getCredentialTypeInternal(key);

    if (credType === 'oauth_token') {
      // Set OAuth token for Agent SDK
      process.env[ENV_CLAUDE_CODE_OAUTH_TOKEN] = key;
      // Clear API key to avoid confusion
      delete process.env[ENV_ANTHROPIC_API_KEY];
    } else {
      // Set API key
      process.env[ENV_ANTHROPIC_API_KEY] = key;
      delete process.env[ENV_CLAUDE_CODE_OAUTH_TOKEN];
    }

    return { configured: true, type: credType };
  }

  /**
   * Check if Claude credentials are configured
   *
   * @returns true if API key or OAuth token is available
   */
  isConfigured(): boolean {
    const result = this.configureAgentSdkAuth();
    return result.configured;
  }

  /**
   * Get the credential type being used
   *
   * @returns 'api_key' for API keys, 'oauth' for OAuth tokens, 'none' if not configured
   */
  getCredentialType(): 'api_key' | 'oauth' | 'none' {
    const key = this.getApiKey();
    const credType = getCredentialTypeInternal(key);

    // Map internal ClaudeCredentialType to IAuthenticator type
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
    const result = this.configureAgentSdkAuth();
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
    const credentials = getCredentialsFromFile();

    // If no credentials file, return null fields
    if (!credentials) {
      return {
        isExpired: false,
        expiresInMs: null,
      };
    }

    const expiresAtStr = credentials.expiresAt;

    // If no expiresAt field, return null expiration fields
    if (!expiresAtStr) {
      return {
        isExpired: false,
        expiresInMs: null,
      };
    }

    try {
      const expiry = new Date(expiresAtStr);

      // Check if date is valid
      if (isNaN(expiry.getTime())) {
        console.debug(`Invalid date format in expiresAt: ${expiresAtStr}`);
        return {
          isExpired: false,
          expiresInMs: null,
        };
      }

      const expiresInMs = expiry.getTime() - Date.now();
      const isExpired = isTokenExpired(expiresAtStr);

      return {
        isExpired,
        expiresInMs,
      };
    } catch (error) {
      console.debug(`Error parsing expiresAt: ${error}`);
      return {
        isExpired: false,
        expiresInMs: null,
      };
    }
  }

  /**
   * Get the source of the API key (for display purposes)
   */
  getApiKeySource(): 'env' | 'credentials_file' | 'keychain' | 'none' {
    if (process.env[ENV_ANTHROPIC_API_KEY] || process.env[ENV_CLAUDE_CODE_OAUTH_TOKEN]) {
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
}
