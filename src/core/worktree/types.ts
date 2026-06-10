/**
 * Options for creating a git worktree
 */
export interface WorktreeOptions {
  storyId: string;
  slug: string;
  baseBranch?: string;
  /**
   * If true, return existing worktree path instead of throwing when worktree exists
   * and can be resumed (directory exists, branch exists, story files accessible)
   */
  resumeIfExists?: boolean;
}

/**
 * Result of worktree validation check
 */
export interface WorktreeValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Result of worktree resume validation check
 */
export interface WorktreeResumeValidationResult {
  valid: boolean;
  issues: string[];
  canResume: boolean;
  requiresRecreation: boolean;
}

/**
 * Detailed status information for an existing worktree
 */
export interface WorktreeStatus {
  path: string;
  branch: string;
  storyId: string;
  exists: boolean;
  lastCommit?: {
    hash: string;
    message: string;
    timestamp: string;
  };
  workingDirectoryStatus: 'clean' | 'modified' | 'untracked' | 'mixed';
  modifiedFiles: string[];
  untrackedFiles: string[];
}

/**
 * Result of branch divergence check
 */
export interface BranchDivergence {
  ahead: number;
  behind: number;
  diverged: boolean;
}
