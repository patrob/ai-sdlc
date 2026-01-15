import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { isCleanWorkingDirectory } from './git-utils.js';
import { WorktreeInfo } from '../types/index.js';

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
  WORKTREE_NOT_FOUND: 'Worktree not found',
  WORKTREE_HAS_CHANGES: 'Worktree has uncommitted changes. Use --force to remove.',
  LIST_FAILED: 'Failed to list worktrees',
  REMOVE_FAILED: 'Failed to remove worktree',
  INSTALL_FAILED: 'Failed to install dependencies',
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

    // Install dependencies in the new worktree
    this.installDependencies(worktreePath);

    return worktreePath;
  }

  /**
   * Install npm dependencies in a worktree
   * Detects the package manager (npm/yarn/pnpm) and runs the appropriate install command
   * @param worktreePath - Path to the worktree
   * @throws Error if installation fails
   */
  installDependencies(worktreePath: string): void {
    const packageJsonPath = path.join(worktreePath, 'package.json');

    // Skip if not a Node.js project
    if (!existsSync(packageJsonPath)) {
      return;
    }

    // Detect package manager from lock file
    let packageManager = 'npm'; // default
    for (const [lockFile, pm] of Object.entries(LOCK_FILE_TO_PM)) {
      if (existsSync(path.join(worktreePath, lockFile))) {
        packageManager = pm;
        break;
      }
    }

    // Run install command
    const result = spawnSync(packageManager, ['install'], {
      cwd: worktreePath,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000, // 2 minute timeout
    });

    if (result.status !== 0) {
      const stderr = result.stderr?.toString() || '';
      throw new Error(`${ERROR_MESSAGES.INSTALL_FAILED}: ${stderr}`);
    }
  }

  /**
   * List all ai-sdlc managed worktrees
   * @returns Array of WorktreeInfo objects for worktrees in the basePath
   */
  list(): WorktreeInfo[] {
    const result = spawnSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      throw new Error(`${ERROR_MESSAGES.LIST_FAILED}: ${result.stderr}`);
    }

    const output = result.stdout || '';
    const worktrees: WorktreeInfo[] = [];
    const blocks = output.trim().split('\n\n');

    for (const block of blocks) {
      if (!block.trim()) continue;

      const lines = block.split('\n');
      let worktreePath = '';
      let branch = '';

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          worktreePath = line.substring(9);
        } else if (line.startsWith('branch ')) {
          branch = line.substring(7).replace('refs/heads/', '');
        }
      }

      // Filter to only ai-sdlc managed worktrees
      if (worktreePath && worktreePath.startsWith(this.worktreeBasePath)) {
        const storyIdMatch = branch.match(/^ai-sdlc\/(S-\d+)-/);
        worktrees.push({
          path: worktreePath,
          branch,
          storyId: storyIdMatch ? storyIdMatch[1] : undefined,
          exists: existsSync(worktreePath),
        });
      }
    }

    return worktrees;
  }

  /**
   * Remove a git worktree
   * @param worktreePath - Absolute path to the worktree to remove
   * @throws Error if removal fails
   */
  remove(worktreePath: string): void {
    const result = spawnSync('git', ['worktree', 'remove', worktreePath], {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      const stderr = result.stderr?.toString() || '';
      if (stderr.includes('not a working tree')) {
        throw new Error(ERROR_MESSAGES.WORKTREE_NOT_FOUND);
      }
      if (stderr.includes('modified or untracked files')) {
        throw new Error(ERROR_MESSAGES.WORKTREE_HAS_CHANGES);
      }
      throw new Error(`${ERROR_MESSAGES.REMOVE_FAILED}: ${stderr}`);
    }
  }
}
