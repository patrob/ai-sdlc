import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { isCleanWorkingDirectory } from './git-utils.js';

/**
 * Options for creating a git worktree
 */
export interface WorktreeOptions {
  storyId: string;
  slug: string;
  baseBranch?: string;
}

/**
 * Result of worktree validation check
 */
export interface WorktreeValidationResult {
  valid: boolean;
  error?: string;
}

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
} as const;

/**
 * Service for managing git worktrees for isolated story execution
 */
export class GitWorktreeService {
  constructor(
    private projectRoot: string,
    private sdlcRoot: string
  ) {}

  /**
   * Generate the worktree path for a story
   * Format: {sdlcRoot}/worktrees/{storyId}-{slug}
   */
  getWorktreePath(storyId: string, slug: string): string {
    return path.join(this.sdlcRoot, 'worktrees', `${storyId}-${slug}`);
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
   */
  validateCanCreateWorktree(): WorktreeValidationResult {
    if (!isCleanWorkingDirectory(this.projectRoot)) {
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
   * Create a new git worktree for isolated story execution
   * @param options - Worktree creation options
   * @returns The path to the created worktree
   * @throws Error if worktree creation fails
   */
  create(options: WorktreeOptions): string {
    const worktreePath = this.getWorktreePath(options.storyId, options.slug);
    const branchName = this.getBranchName(options.storyId, options.slug);
    const baseBranch = options.baseBranch || this.detectBaseBranch();

    // Check if worktree path already exists
    if (this.exists(worktreePath)) {
      throw new Error(`${ERROR_MESSAGES.PATH_EXISTS}: ${worktreePath}`);
    }

    // Execute git worktree add command
    const result = spawnSync(
      'git',
      ['worktree', 'add', '-b', branchName, worktreePath, baseBranch],
      {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    // Handle errors
    if (result.status !== 0) {
      const stderr = result.stderr?.toString() || '';

      // Provide specific error messages for common failures
      if (stderr.includes('not a git repository')) {
        throw new Error(ERROR_MESSAGES.NOT_GIT_REPO);
      }
      if (stderr.includes('already exists')) {
        throw new Error(`${ERROR_MESSAGES.BRANCH_EXISTS}: ${branchName}`);
      }

      // Generic error with stderr details
      throw new Error(`${ERROR_MESSAGES.CREATE_FAILED}: ${stderr}`);
    }

    return worktreePath;
  }
}
