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
/**
 * Create a new GitHub Issue.
 *
 * @param owner Repository owner
 * @param repo Repository name
 * @param title Issue title
 * @param body Issue body (markdown)
 * @param labels Optional labels to add
 * @returns Created issue
 * @throws {GhNotInstalledError} If gh CLI is not installed
 * @throws {GhNotAuthenticatedError} If gh CLI is not authenticated
 * @throws {GhNoAccessError} If access to repo is denied
 */
export async function ghIssueCreate(
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels?: string[]
): Promise<GitHubIssue> {
  const args = [
    'issue',
    'create',
    '-R',
    `${owner}/${repo}`,
    '--title',
    title,
    '--body',
    body,
  ];

  if (labels && labels.length > 0) {
    args.push('--label', labels.join(','));
  }

  const result = spawnSync('gh', args, {
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
  });

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

    if (
      stderrLower.includes('not logged in') ||
      stderrLower.includes('authentication') ||
      stderrLower.includes('gh auth login')
    ) {
      throw new GhNotAuthenticatedError();
    }

    if (stderrLower.includes('permission') || stderrLower.includes('403')) {
      throw new GhNoAccessError(owner, repo);
    }

    throw new Error(`gh issue create failed: ${stderr}`);
  }

  // gh issue create outputs URL like https://github.com/owner/repo/issues/123
  const issueUrl = result.stdout.trim();
  const match = issueUrl.match(/\/issues\/(\d+)$/);
  if (!match) {
    throw new Error(`Unexpected gh issue create output: ${result.stdout}`);
  }

  // Fetch the created issue to return full details
  const issueNumber = parseInt(match[1], 10);
  return ghIssueView(owner, repo, issueNumber);
}

/**
 * Add a comment to a GitHub Issue.
 *
 * @param owner Repository owner
 * @param repo Repository name
 * @param number Issue number
 * @param body Comment body (markdown)
 * @throws {GhNotInstalledError} If gh CLI is not installed
 * @throws {GhNotAuthenticatedError} If gh CLI is not authenticated
 * @throws {GhIssueNotFoundError} If issue is not found
 * @throws {GhNoAccessError} If access to repo is denied
 */
export async function ghIssueComment(
  owner: string,
  repo: string,
  number: number,
  body: string
): Promise<void> {
  const result = spawnSync(
    'gh',
    [
      'issue',
      'comment',
      number.toString(),
      '-R',
      `${owner}/${repo}`,
      '--body',
      body,
    ],
    {
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    }
  );

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

    if (
      stderrLower.includes('not logged in') ||
      stderrLower.includes('authentication') ||
      stderrLower.includes('gh auth login')
    ) {
      throw new GhNotAuthenticatedError();
    }

    if (stderrLower.includes('not found') || stderrLower.includes('could not resolve')) {
      throw new GhIssueNotFoundError(owner, repo, number);
    }

    if (stderrLower.includes('permission') || stderrLower.includes('403')) {
      throw new GhNoAccessError(owner, repo);
    }

    throw new Error(`gh issue comment failed: ${stderr}`);
  }
}

/**
 * Close or reopen a GitHub Issue.
 *
 * @param owner Repository owner
 * @param repo Repository name
 * @param number Issue number
 * @param state Target state ('open' or 'closed')
 * @throws {GhNotInstalledError} If gh CLI is not installed
 * @throws {GhNotAuthenticatedError} If gh CLI is not authenticated
 * @throws {GhIssueNotFoundError} If issue is not found
 * @throws {GhNoAccessError} If access to repo is denied
 */
export async function ghIssueStateChange(
  owner: string,
  repo: string,
  number: number,
  state: 'open' | 'closed'
): Promise<void> {
  const action = state === 'closed' ? 'close' : 'reopen';
  const result = spawnSync(
    'gh',
    ['issue', action, number.toString(), '-R', `${owner}/${repo}`],
    {
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    }
  );

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

    if (
      stderrLower.includes('not logged in') ||
      stderrLower.includes('authentication') ||
      stderrLower.includes('gh auth login')
    ) {
      throw new GhNotAuthenticatedError();
    }

    if (stderrLower.includes('not found') || stderrLower.includes('could not resolve')) {
      throw new GhIssueNotFoundError(owner, repo, number);
    }

    if (stderrLower.includes('permission') || stderrLower.includes('403')) {
      throw new GhNoAccessError(owner, repo);
    }

    throw new Error(`gh issue ${action} failed: ${stderr}`);
  }
}

/**
 * Represents a GitHub Pull Request as returned by the gh CLI JSON output.
 */
export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  url: string;
  headRefName: string;
  baseRefName: string;
}

/**
 * Create a Pull Request.
 *
 * @param owner Repository owner
 * @param repo Repository name
 * @param title PR title
 * @param body PR body (markdown)
 * @param head Head branch name
 * @param base Base branch name (default: main)
 * @param draft Whether to create as draft PR
 * @returns Created PR details
 * @throws {GhNotInstalledError} If gh CLI is not installed
 * @throws {GhNotAuthenticatedError} If gh CLI is not authenticated
 * @throws {GhNoAccessError} If access to repo is denied
 */
export async function ghPRCreate(
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string = 'main',
  draft: boolean = false
): Promise<GitHubPR> {
  const args = [
    'pr',
    'create',
    '-R',
    `${owner}/${repo}`,
    '--title',
    title,
    '--body',
    body,
    '--head',
    head,
    '--base',
    base,
  ];

  if (draft) {
    args.push('--draft');
  }

  const result = spawnSync('gh', args, {
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000, // 60 seconds for PR creation
    maxBuffer: 10 * 1024 * 1024,
  });

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

    if (
      stderrLower.includes('not logged in') ||
      stderrLower.includes('authentication') ||
      stderrLower.includes('gh auth login')
    ) {
      throw new GhNotAuthenticatedError();
    }

    if (stderrLower.includes('permission') || stderrLower.includes('403')) {
      throw new GhNoAccessError(owner, repo);
    }

    if (stderrLower.includes('pull request already exists')) {
      throw new Error(`A pull request for branch '${head}' already exists`);
    }

    throw new Error(`gh pr create failed: ${stderr}`);
  }

  // gh pr create outputs URL like https://github.com/owner/repo/pull/123
  const prUrl = result.stdout.trim();
  const match = prUrl.match(/\/pull\/(\d+)$/);
  if (!match) {
    throw new Error(`Unexpected gh pr create output: ${result.stdout}`);
  }

  const prNumber = parseInt(match[1], 10);
  return {
    number: prNumber,
    title,
    body,
    state: 'open',
    url: prUrl,
    headRefName: head,
    baseRefName: base,
  };
}

/**
 * Link an issue to a PR by adding a comment with closing keywords.
 *
 * @param owner Repository owner
 * @param repo Repository name
 * @param issueNumber Issue number to link
 * @param prUrl URL of the PR
 * @throws {GhNotInstalledError} If gh CLI is not installed
 * @throws {GhNotAuthenticatedError} If gh CLI is not authenticated
 * @throws {GhIssueNotFoundError} If issue is not found
 * @throws {GhNoAccessError} If access to repo is denied
 */
export async function ghLinkIssueToPR(
  owner: string,
  repo: string,
  issueNumber: number,
  prUrl: string
): Promise<void> {
  const body = `🔗 Linked to PR: ${prUrl}`;
  await ghIssueComment(owner, repo, issueNumber, body);
}

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
