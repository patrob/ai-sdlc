import { spawnSync } from 'child_process';

import { GhNoAccessError,GhNotAuthenticatedError, GhNotInstalledError } from './errors.js';
import { ghIssueComment } from './issues.js';
import { type GhMergeStrategy,type GitHubPR, type PRCheckResult, type PRChecksStatus } from './types.js';

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

/**
 * Get CI check statuses for a PR.
 *
 * @param prNumber PR number
 * @param cwd Working directory (to determine repo context)
 * @returns Check status summary
 * @throws {GhNotInstalledError} If gh CLI is not installed
 */
export function ghPRChecks(prNumber: number, cwd?: string): PRChecksStatus {
  const args = [
    'pr',
    'checks',
    prNumber.toString(),
    '--json',
    'name,state,conclusion',
  ];

  const result = spawnSync('gh', args, {
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
    cwd,
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
    // No checks configured is not an error - treat as all passed
    if (stderr.toLowerCase().includes('no checks')) {
      return { checks: [], allPassed: true, anyFailed: false, anyPending: false };
    }
    throw new Error(`gh pr checks failed: ${stderr}`);
  }

  let checks: PRCheckResult[];
  try {
    checks = JSON.parse(result.stdout);
  } catch {
    return { checks: [], allPassed: true, anyFailed: false, anyPending: false };
  }

  const anyFailed = checks.some(c =>
    c.conclusion === 'failure' || c.conclusion === 'cancelled' || c.conclusion === 'timed_out'
  );
  const anyPending = checks.some(c =>
    c.status !== 'completed'
  );
  const allPassed = !anyFailed && !anyPending;

  return { checks, allPassed, anyFailed, anyPending };
}

/**
 * Merge a PR using gh CLI.
 *
 * @param prNumber PR number
 * @param strategy Merge strategy (squash, merge, rebase)
 * @param deleteBranch Whether to delete the branch after merge
 * @param cwd Working directory
 * @returns Merge SHA from stdout
 * @throws {GhNotInstalledError} If gh CLI is not installed
 */
export function ghPRMerge(
  prNumber: number,
  strategy: GhMergeStrategy = 'squash',
  deleteBranch: boolean = true,
  cwd?: string
): string {
  const args = [
    'pr',
    'merge',
    prNumber.toString(),
    `--${strategy}`,
    '--auto',
  ];

  if (deleteBranch) {
    args.push('--delete-branch');
  }

  const result = spawnSync('gh', args, {
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
    cwd,
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
    throw new Error(`gh pr merge failed: ${stderr}`);
  }

  return result.stdout.trim();
}
