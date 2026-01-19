import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { isCleanWorkingDirectory, CleanWorkingDirectoryOptions } from './git-utils.js';
import { WorktreeInfo } from '../types/index.js';

/** Default patterns to exclude from working directory cleanliness checks */
const DEFAULT_EXCLUDE_PATTERNS = ['.ai-sdlc/**'];

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
   * Find a worktree by story ID
   * @param storyId - The story ID to search for (e.g., 'S-0029')
   * @returns The WorktreeInfo if found, undefined otherwise
   */
  findByStoryId(storyId: string): WorktreeInfo | undefined {
    const worktrees = this.list();
    return worktrees.find(w => w.storyId === storyId);
  }

  /**
   * Get detailed status information for a worktree
   * @param worktreeInfo - The worktree to get status for
   * @returns Detailed status including last commit and working directory state
   */
  getWorktreeStatus(worktreeInfo: WorktreeInfo): WorktreeStatus {
    const status: WorktreeStatus = {
      path: worktreeInfo.path,
      branch: worktreeInfo.branch,
      storyId: worktreeInfo.storyId || 'unknown',
      exists: worktreeInfo.exists,
      workingDirectoryStatus: 'clean',
      modifiedFiles: [],
      untrackedFiles: [],
    };

    if (!worktreeInfo.exists) {
      return status;
    }

    const lastCommitResult = spawnSync(
      'git',
      ['log', '-1', '--format=%H%n%s%n%ci'],
      {
        cwd: worktreeInfo.path,
        encoding: 'utf-8',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    if (lastCommitResult.status === 0 && lastCommitResult.stdout) {
      const [hash, message, timestamp] = lastCommitResult.stdout.trim().split('\n');
      if (hash && message && timestamp) {
        status.lastCommit = { hash, message, timestamp };
      }
    }

    const gitStatusResult = spawnSync('git', ['status', '--porcelain'], {
      cwd: worktreeInfo.path,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (gitStatusResult.status === 0 && gitStatusResult.stdout) {
      const lines = gitStatusResult.stdout.split('\n').filter(l => l.length >= 3);
      for (const line of lines) {
        const statusCode = line.substring(0, 2);
        const filePath = line.substring(3).trim();

        if (statusCode === '??' || statusCode === '!!') {
          status.untrackedFiles.push(filePath);
        } else {
          status.modifiedFiles.push(filePath);
        }
      }

      if (status.modifiedFiles.length > 0 && status.untrackedFiles.length > 0) {
        status.workingDirectoryStatus = 'mixed';
      } else if (status.modifiedFiles.length > 0) {
        status.workingDirectoryStatus = 'modified';
      } else if (status.untrackedFiles.length > 0) {
        status.workingDirectoryStatus = 'untracked';
      }
    }

    return status;
  }

  /**
   * Check if worktree has unpushed commits
   * @param worktreePath - Path to the worktree
   * @returns Object with hasUnpushed flag and count of unpushed commits
   */
  hasUnpushedCommits(worktreePath: string): { hasUnpushed: boolean; count: number } {
    const result = spawnSync('git', ['rev-list', '@{u}..HEAD', '--count'], {
      cwd: worktreePath,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // If no upstream branch exists (128) or command fails, assume no unpushed commits
    if (result.status !== 0) {
      return { hasUnpushed: false, count: 0 };
    }

    const count = parseInt(result.stdout.trim(), 10);
    return { hasUnpushed: count > 0, count: isNaN(count) ? 0 : count };
  }

  /**
   * Check if a branch exists on the remote
   * @param branch - Branch name to check
   * @returns true if branch exists on remote, false otherwise
   */
  branchExistsOnRemote(branch: string): boolean {
    const result = spawnSync('git', ['ls-remote', '--heads', 'origin', branch], {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // If command fails or no output, branch doesn't exist
    if (result.status !== 0 || !result.stdout) {
      return false;
    }

    // If output is not empty, branch exists
    return result.stdout.trim().length > 0;
  }

  /**
   * Get the total number of commits in a worktree
   * @param worktreePath - Path to the worktree
   * @returns Number of commits, or 0 on error
   */
  getCommitCount(worktreePath: string): number {
    const result = spawnSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: worktreePath,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      return 0;
    }

    const count = parseInt(result.stdout.trim(), 10);
    return isNaN(count) ? 0 : count;
  }

  /**
   * Delete a local branch
   * @param branch - Branch name to delete
   * @param force - Whether to force delete (use -D instead of -d)
   * @throws Error if deletion fails (unless branch doesn't exist)
   */
  deleteBranch(branch: string, force: boolean = true): void {
    const args = force ? ['branch', '-D', branch] : ['branch', '-d', branch];
    const result = spawnSync('git', args, {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      const stderr = result.stderr?.toString() || '';
      // Don't throw if branch doesn't exist (idempotent operation)
      if (stderr.includes('not found')) {
        return;
      }
      throw new Error(`Failed to delete branch ${branch}: ${stderr}`);
    }
  }

  /**
   * Delete a remote branch
   * @param branch - Branch name to delete from remote
   * @throws Error if deletion fails (unless branch doesn't exist)
   */
  deleteRemoteBranch(branch: string): void {
    const result = spawnSync('git', ['push', 'origin', '--delete', branch], {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      const stderr = result.stderr?.toString() || '';
      // Don't throw if remote branch doesn't exist (idempotent operation)
      if (stderr.includes('remote ref does not exist')) {
        return;
      }
      throw new Error(`Failed to delete remote branch ${branch}: ${stderr}`);
    }
  }

  /**
   * Remove a git worktree
   * @param worktreePath - Absolute path to the worktree to remove
   * @param force - Whether to force remove (ignores uncommitted changes)
   * @throws Error if removal fails
   */
  remove(worktreePath: string, force: boolean = false): void {
    const args = force
      ? ['worktree', 'remove', '--force', worktreePath]
      : ['worktree', 'remove', worktreePath];

    const result = spawnSync('git', args, {
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
