import { spawnSync } from 'child_process';

/**
 * Represents a GitHub Issue as returned by the gh CLI JSON output.
 */
export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  projectItems?: Array<{
    project: { title: string };
    status?: { name: string };
    fieldValueByName?: Array<{ name: string; field: { name: string } }>;
  }>;
}

/**
 * Filter criteria for listing GitHub Issues.
 */
export interface IssueFilter {
  state?: 'open' | 'closed' | 'all';
  labels?: string[];
  assignee?: string;
  limit?: number;
}

/**
 * Custom error for when gh CLI is not installed.
 */
export class GhNotInstalledError extends Error {
  constructor() {
    super('GitHub CLI (gh) is not installed.\nInstall it from: https://cli.github.com/');
    this.name = 'GhNotInstalledError';
  }
}

/**
 * Custom error for when gh CLI is not authenticated.
 */
export class GhNotAuthenticatedError extends Error {
  constructor() {
    super('Not authenticated to GitHub.\nRun: gh auth login');
    this.name = 'GhNotAuthenticatedError';
  }
}

/**
 * Custom error for when a GitHub Issue is not found.
 */
export class GhIssueNotFoundError extends Error {
  constructor(owner: string, repo: string, number: number) {
    super(`Issue #${number} not found in ${owner}/${repo}`);
    this.name = 'GhIssueNotFoundError';
  }
}

/**
 * Custom error for when access to a repository is denied.
 */
export class GhNoAccessError extends Error {
  constructor(owner: string, repo: string) {
    super(`Cannot access ${owner}/${repo}. Check your permissions.`);
    this.name = 'GhNoAccessError';
  }
}

/**
 * Parsed GitHub issue URL components.
 */
export interface ParsedGitHubIssueUrl {
  owner: string;
  repo: string;
  number: number;
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
export function parseGitHubIssueUrl(url: string): ParsedGitHubIssueUrl | null {
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
 * Fetch a single GitHub Issue by number.
 *
 * @param owner Repository owner
 * @param repo Repository name
 * @param number Issue number
 * @returns GitHub Issue details
 * @throws {GhNotInstalledError} If gh CLI is not installed
 * @throws {GhNotAuthenticatedError} If gh CLI is not authenticated
 * @throws {GhIssueNotFoundError} If issue is not found
 * @throws {GhNoAccessError} If access to repo is denied
 */
export async function ghIssueView(
  owner: string,
  repo: string,
  number: number
): Promise<GitHubIssue> {
  const result = spawnSync(
    'gh',
    [
      'issue',
      'view',
      number.toString(),
      '-R',
      `${owner}/${repo}`,
      '--json',
      'number,title,body,state,labels,assignees,projectItems',
    ],
    {
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000, // 30 second timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB for large issue bodies
    }
  );

  // Handle errors
  if (result.error) {
    // @ts-expect-error - error.code is not in the type definition but exists at runtime
    if (result.error.code === 'ENOENT') {
      throw new GhNotInstalledError();
    }
    throw new Error(`Failed to execute gh command: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr || '';
    const stderrLower = stderr.toLowerCase();

    // Check for authentication errors
    if (
      stderrLower.includes('not logged in') ||
      stderrLower.includes('authentication') ||
      stderrLower.includes('gh auth login')
    ) {
      throw new GhNotAuthenticatedError();
    }

    // Check for not found errors
    if (stderrLower.includes('not found') || stderrLower.includes('could not resolve')) {
      throw new GhIssueNotFoundError(owner, repo, number);
    }

    // Check for permission errors
    if (stderrLower.includes('permission') || stderrLower.includes('403')) {
      throw new GhNoAccessError(owner, repo);
    }

    // Generic error
    throw new Error(`gh issue view failed: ${stderr}`);
  }

  // Parse JSON output
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Failed to parse gh CLI output: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * List GitHub Issues in a repository.
 *
 * @param owner Repository owner
 * @param repo Repository name
 * @param filter Optional filter criteria
 * @returns Array of GitHub Issues
 * @throws {GhNotInstalledError} If gh CLI is not installed
 * @throws {GhNotAuthenticatedError} If gh CLI is not authenticated
 * @throws {GhNoAccessError} If access to repo is denied
 */
export async function ghIssueList(
  owner: string,
  repo: string,
  filter?: IssueFilter
): Promise<GitHubIssue[]> {
  const args = [
    'issue',
    'list',
    '-R',
    `${owner}/${repo}`,
    '--json',
    'number,title,body,state,labels,assignees',
  ];

  // Add filter options
  if (filter?.state && filter.state !== 'all') {
    args.push('--state', filter.state);
  }

  if (filter?.labels && filter.labels.length > 0) {
    args.push('--label', filter.labels.join(','));
  }

  if (filter?.assignee) {
    args.push('--assignee', filter.assignee);
  }

  if (filter?.limit) {
    args.push('--limit', filter.limit.toString());
  }

  const result = spawnSync('gh', args, {
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000, // 30 second timeout
    maxBuffer: 10 * 1024 * 1024, // 10MB for large responses
  });

  // Handle errors
  if (result.error) {
    // @ts-expect-error - error.code is not in the type definition but exists at runtime
    if (result.error.code === 'ENOENT') {
      throw new GhNotInstalledError();
    }
    throw new Error(`Failed to execute gh command: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr || '';
    const stderrLower = stderr.toLowerCase();

    // Check for authentication errors
    if (
      stderrLower.includes('not logged in') ||
      stderrLower.includes('authentication') ||
      stderrLower.includes('gh auth login')
    ) {
      throw new GhNotAuthenticatedError();
    }

    // Check for permission errors
    if (stderrLower.includes('permission') || stderrLower.includes('403')) {
      throw new GhNoAccessError(owner, repo);
    }

    // Generic error
    throw new Error(`gh issue list failed: ${stderr}`);
  }

  // Parse JSON output
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Failed to parse gh CLI output: ${error instanceof Error ? error.message : String(error)}`);
  }
}
