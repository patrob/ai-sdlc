import { spawnSync } from 'child_process';

import {
  GhIssueNotFoundError,
  GhNoAccessError,
  GhNotAuthenticatedError,
  GhNotInstalledError,
} from './errors.js';
import { type GitHubIssue, type IssueFilter } from './types.js';

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
