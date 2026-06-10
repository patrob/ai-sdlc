import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

import { type CleanWorkingDirectoryOptions, isCleanWorkingDirectory } from '../git-utils.js';
import { type WorktreeResumeValidationResult, type WorktreeValidationResult } from './types.js';

/** Default patterns to exclude from working directory cleanliness checks */
const DEFAULT_EXCLUDE_PATTERNS = ['.ai-sdlc/**'];

/**
 * Error messages used by the worktree service
 */
const ERROR_MESSAGES = {
  UNCOMMITTED_CHANGES: 'Uncommitted changes exist. Commit or stash before using worktrees.',
  PATH_EXISTS: 'Worktree path already exists',
  CREATE_FAILED: 'Failed to create worktree',
  NO_BASE_BRANCH: 'Could not detect base branch (main or master)',
  NOT_GIT_REPO: 'Not a git repository',
  BRANCH_EXISTS: 'A branch with this name already exists',
  WORKTREE_NOT_FOUND: 'Worktree not found',
  WORKTREE_HAS_CHANGES: 'Worktree has uncommitted changes. Use --force to remove.',
  LIST_FAILED: 'Failed to list worktrees',
  REMOVE_FAILED: 'Failed to remove worktree',
  INSTALL_FAILED: 'Failed to install dependencies',
  BUILD_FAILED: 'Failed to build project',
} as const;

/**
 * Lock file to package manager mapping
 */
const LOCK_FILE_TO_PM: Record<string, string> = {
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
};

/**
 * Service for managing git worktrees for isolated story execution
 */
export class GitWorktreeService {
  constructor(
    private projectRoot: string,
    private worktreeBasePath: string
  ) {}

  /**
   * Generate the worktree path for a story
   * Format: {worktreeBasePath}/{storyId}-{slug}
   */
  getWorktreePath(storyId: string, slug: string): string {
    return path.join(this.worktreeBasePath, `${storyId}-${slug}`);
  }

  /**
   * Generate the branch name for a worktree
   * Format: ai-sdlc/{storyId}-{slug}
   */
  getBranchName(storyId: string, slug: string): string {
    return `ai-sdlc/${storyId}-${slug}`;
  }

  /**
   * Detect the base branch (main or master) for branching
   * @returns The detected base branch name
   * @throws Error if neither main nor master exists
   */
  detectBaseBranch(): string {
    // Check for 'main' first
    const mainResult = spawnSync('git', ['rev-parse', '--verify', 'main'], {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (mainResult.status === 0) {
      return 'main';
    }

    // Check for 'master' as fallback
    const masterResult = spawnSync('git', ['rev-parse', '--verify', 'master'], {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (masterResult.status === 0) {
      return 'master';
    }

    throw new Error(ERROR_MESSAGES.NO_BASE_BRANCH);
  }

  /**
   * Validate that a worktree can be created
   * Checks for uncommitted changes in the working directory
   * Note: Changes in .ai-sdlc/ directory are excluded since they're expected
   * during normal workflow (story file updates, etc.)
   */
  validateCanCreateWorktree(): WorktreeValidationResult {
    const cleanCheckOptions: CleanWorkingDirectoryOptions = {
      excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
    };

    if (!isCleanWorkingDirectory(this.projectRoot, cleanCheckOptions)) {
      return {
        valid: false,
        error: ERROR_MESSAGES.UNCOMMITTED_CHANGES,
      };
    }

    return { valid: true };
  }

  /**
   * Check if a worktree already exists at the given path
   */
  exists(worktreePath: string): boolean {
    return existsSync(worktreePath);
  }

  /**
   * Validate that a worktree can be resumed
   * Checks directory exists, branch exists, and story file is accessible
   * @param worktreePath - Path to the worktree to validate
   * @param branchName - Expected branch name
   * @returns Validation result with issues found
   */
  validateWorktreeForResume(worktreePath: string, branchName: string): WorktreeResumeValidationResult {
    const issues: string[] = [];
    let canResume = true;
    let requiresRecreation = false;

    // Check if directory exists
    if (!existsSync(worktreePath)) {
      issues.push('Worktree directory does not exist');
      requiresRecreation = true;
      canResume = false;
    }

    // Check if branch exists
    const branchResult = spawnSync('git', ['rev-parse', '--verify', branchName], {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (branchResult.status !== 0) {
      issues.push('Branch does not exist');
      requiresRecreation = true;
      canResume = false;
    }

    // Check if story file is accessible (only if directory exists)
    if (existsSync(worktreePath)) {
      const storyDirPath = path.join(worktreePath, '.ai-sdlc', 'stories');
      if (!existsSync(storyDirPath)) {
        issues.push('Story directory not accessible in worktree');
        canResume = false;
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      canResume,
      requiresRecreation,
    };
  }

  /**
   * Export error messages for use in other modules
   */
  static readonly ERROR_MESSAGES = ERROR_MESSAGES;

  /**
   * Export lock file to package manager mapping
   */
  static readonly LOCK_FILE_TO_PM = LOCK_FILE_TO_PM;
}
