import { spawnSync } from 'child_process';


/**
 * Check if the gh CLI is installed and authenticated.
 *
 * @returns true if gh is available and authenticated, false otherwise
 */
export async function isGhAvailable(): Promise<boolean> {
  // Check if gh is installed
  const versionResult = spawnSync('gh', ['--version'], {
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (versionResult.status !== 0 || versionResult.error) {
    return false;
  }

  // Check if gh is authenticated
  const authResult = spawnSync('gh', ['auth', 'status'], {
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // gh auth status returns 0 when authenticated
  return authResult.status === 0;
}

/**
 * Check if gh CLI is authenticated specifically.
 * Assumes gh is already installed.
 *
 * @returns true if authenticated, false otherwise
 */
export async function isGhAuthenticated(): Promise<boolean> {
  const authResult = spawnSync('gh', ['auth', 'status'], {
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return authResult.status === 0;
}

/**
 * Extract PR number from a GitHub PR URL.
 *
 * @param prUrl PR URL like https://github.com/owner/repo/pull/123
 * @returns PR number or null if URL is invalid
 */
export function extractPRNumber(prUrl: string): number | null {
  const match = prUrl.match(/\/pull\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Parse a GitHub issue URL into its components.
 *
 * Supports various formats:
 * - https://github.com/owner/repo/issues/123
 * - https://github.com/owner/repo/issues/123#issuecomment-456
 * - github.com/owner/repo/issues/123
 * - owner/repo#123
 *
 * @param url GitHub issue URL in various formats
 * @returns Parsed components or null if invalid
 */
export function parseGitHubIssueUrl(url: string): { owner: string; repo: string; number: number } | null {
  // Remove protocol and www
  const normalized = url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '');

  // Match: github.com/owner/repo/issues/123
  const fullMatch = normalized.match(
    /^github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/i
  );
  if (fullMatch) {
    return {
      owner: fullMatch[1],
      repo: fullMatch[2],
      number: parseInt(fullMatch[3], 10),
    };
  }

  // Match: owner/repo#123
  const shortMatch = url.match(/^([^\/]+)\/([^#]+)#(\d+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      number: parseInt(shortMatch[3], 10),
    };
  }

  return null;
}
