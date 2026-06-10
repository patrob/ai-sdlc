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
 * Check status result for PR CI checks
 */
export type PRCheckConclusion = 'success' | 'failure' | 'pending' | 'neutral' | 'skipped' | 'cancelled' | 'timed_out' | 'action_required' | 'stale';

export interface PRCheckResult {
  name: string;
  status: 'completed' | 'in_progress' | 'queued' | 'waiting' | 'pending' | 'requested';
  conclusion: PRCheckConclusion | null;
}

export interface PRChecksStatus {
  checks: PRCheckResult[];
  allPassed: boolean;
  anyFailed: boolean;
  anyPending: boolean;
}

/**
 * Merge strategy type alias
 */
export type GhMergeStrategy = 'squash' | 'merge' | 'rebase';

/**
 * Parsed GitHub issue URL components.
 */
export interface ParsedGitHubIssueUrl {
  owner: string;
  repo: string;
  number: number;
}
