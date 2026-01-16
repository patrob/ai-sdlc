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
 * Validate that homedir() returns a legitimate user home directory
 * Prevents attacks via manipulated HOME environment variable
 */
function isValidHomeDirectory(homeDir: string): boolean {
  if (!homeDir || typeof homeDir !== 'string') {
    return false;
  }

  const plat = platform();

  if (plat === 'darwin') {
    // macOS: /Users/<username> or /var/root
    return homeDir.startsWith('/Users/') || homeDir === '/var/root';
  } else if (plat === 'win32') {
    // Windows: C:\Users\<username> (case-insensitive)
    return /^[A-Za-z]:\\Users\\/i.test(homeDir);
  } else {
    // Linux/Unix: /home/<username> or /root
    return homeDir.startsWith('/home/') || homeDir === '/root';
  }
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
    const credentialPath = path.join(homedir(), '.claude', '.credentials.json');

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
 * between client and server clocks. A token is considered expired if:
 * current_time >= expiry_time - 30_seconds
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

    // 30-second clock skew buffer (30000ms)
    const CLOCK_SKEW_BUFFER_MS = 30000;
    return Date.now() >= expiry.getTime() - CLOCK_SKEW_BUFFER_MS;
  } catch {
    return false; // Parse error, skip expiration check
  }
}

/**
 * Check if a token expires within the given buffer period
 * Returns false if date is invalid or missing
 *
 * @param expiresAt - ISO 8601 date string
 * @param bufferMs - Time buffer in milliseconds (default: 5 minutes)
 *
 * @example
 * // Check if token expires in next 5 minutes
 * isTokenExpiringSoon('2026-01-15T12:05:00Z') // true if current time is after 12:00:00
 *
 * // Check with custom buffer (10 minutes)
 * isTokenExpiringSoon('2026-01-15T12:10:00Z', 10 * 60 * 1000) // true if current time is after 12:00:00
 */
export function isTokenExpiringSoon(expiresAt: string | undefined, bufferMs: number = 5 * 60 * 1000): boolean {
  if (!expiresAt) {
    return false; // No expiration date, assume not expiring soon
  }

  try {
    const expiry = new Date(expiresAt);
    // Check if date is valid (not NaN)
    if (isNaN(expiry.getTime())) {
      return false; // Invalid date, skip check
    }

    const expiresInMs = expiry.getTime() - Date.now();
    return expiresInMs > 0 && expiresInMs <= bufferMs;
  } catch {
    return false; // Parse error, skip check
  }
}

/**
 * Get token expiration information from credentials file
 * Returns null fields if expiresAt is missing or unparseable
 *
 * @returns TokenExpirationInfo with expiration details
 *
 * @example
 * const info = getTokenExpirationInfo();
 * if (info.isExpired) {
 *   console.error('Token expired. Please run `claude login`');
 * } else if (info.expiresInMs && info.expiresInMs < 5 * 60 * 1000) {
 *   console.warn('Token expires soon');
 * }
 */
export function getTokenExpirationInfo(): TokenExpirationInfo {
  const credentials = getCredentialsFromFile();

  // If no credentials file, return null fields
  if (!credentials) {
    return {
      isExpired: false,
      expiresAt: null,
      expiresInMs: null,
      source: null,
    };
  }

  const credentialPath = path.join(homedir(), '.claude', '.credentials.json');
  const expiresAtStr = credentials.expiresAt;

  // If no expiresAt field, return null expiration fields
  if (!expiresAtStr) {
    return {
      isExpired: false,
      expiresAt: null,
      expiresInMs: null,
      source: credentialPath,
    };
  }

  try {
    const expiry = new Date(expiresAtStr);

    // Check if date is valid
    if (isNaN(expiry.getTime())) {
      console.debug(`Invalid date format in expiresAt: ${expiresAtStr}`);
      return {
        isExpired: false,
        expiresAt: null,
        expiresInMs: null,
        source: credentialPath,
      };
    }

    const expiresInMs = expiry.getTime() - Date.now();
    const isExpired = isTokenExpired(expiresAtStr);

    return {
      isExpired,
      expiresAt: expiry,
      expiresInMs,
      source: credentialPath,
    };
  } catch (error) {
    console.debug(`Error parsing expiresAt: ${error}`);
    return {
      isExpired: false,
      expiresAt: null,
      expiresInMs: null,
      source: credentialPath,
    };
  }
}

/**
 * Check credential file permissions and warn if insecure
 * Only 600 (owner read/write) and 400 (owner read-only) are considered secure
 */
function checkFilePermissions(): void {
  try {
    const credentialPath = path.join(homedir(), '.claude', '.credentials.json');
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
 *
 * SECURITY NOTE: Environment variables set by this function persist for the lifetime
 * of the Node.js process. The tokens are not automatically cleared and will be
 * accessible to any code running in the same process. This is intentional for the
 * Agent SDK to work correctly, but callers should be aware of this behavior.
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
