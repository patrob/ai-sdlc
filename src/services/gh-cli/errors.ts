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
