import { spawnSync } from 'child_process';

/**
 * Error messages
 */
const ERROR_MESSAGES = {
  WORKTREE_NOT_FOUND: 'Worktree not found',
  WORKTREE_HAS_CHANGES: 'Worktree has uncommitted changes. Use --force to remove.',
  REMOVE_FAILED: 'Failed to remove worktree',
} as const;

/**
 * Delete a local branch
 * @param branch - Branch name to delete
 * @param projectRoot - Path to project root
 * @param force - Whether to force delete (use -D instead of -d)
 * @throws Error if deletion fails (unless branch doesn't exist)
 */
export function deleteBranch(branch: string, projectRoot: string, force: boolean = true): void {
  const args = force ? ['branch', '-D', branch] : ['branch', '-d', branch];
  const result = spawnSync('git', args, {
    cwd: projectRoot,
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
 * @param projectRoot - Path to project root
 * @throws Error if deletion fails (unless branch doesn't exist)
 */
export function deleteRemoteBranch(branch: string, projectRoot: string): void {
  const result = spawnSync('git', ['push', 'origin', '--delete', branch], {
    cwd: projectRoot,
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
 * @param projectRoot - Path to project root
 * @param force - Whether to force remove (ignores uncommitted changes)
 * @throws Error if removal fails
 */
export function removeWorktree(worktreePath: string, projectRoot: string, force: boolean = false): void {
  const args = force
    ? ['worktree', 'remove', '--force', worktreePath]
    : ['worktree', 'remove', worktreePath];

  const result = spawnSync('git', args, {
    cwd: projectRoot,
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
