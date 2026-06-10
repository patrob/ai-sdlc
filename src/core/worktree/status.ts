import { spawnSync } from 'child_process';

import { type WorktreeInfo } from '../../types/index.js';
import { type BranchDivergence,type WorktreeStatus } from './types.js';

/**
 * Get detailed status information for a worktree
 * @param worktreeInfo - The worktree to get status for
 * @returns Detailed status including last commit and working directory state
 */
export function getWorktreeStatus(worktreeInfo: WorktreeInfo): WorktreeStatus {
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
export function hasUnpushedCommits(worktreePath: string): { hasUnpushed: boolean; count: number } {
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
 * @param projectRoot - Path to project root
 * @returns true if branch exists on remote, false otherwise
 */
export function branchExistsOnRemote(branch: string, projectRoot: string): boolean {
  const result = spawnSync('git', ['ls-remote', '--heads', 'origin', branch], {
    cwd: projectRoot,
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
export function getCommitCount(worktreePath: string): number {
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
 * Check how much a branch has diverged from the base branch
 * @param branchName - Name of the branch to check
 * @param projectRoot - Path to project root
 * @param baseBranch - Base branch to compare against
 * @returns Divergence information
 */
export function checkBranchDivergence(branchName: string, projectRoot: string, baseBranch: string): BranchDivergence {
  // Get commit counts: ahead and behind
  const result = spawnSync(
    'git',
    ['rev-list', '--left-right', '--count', `${baseBranch}...${branchName}`],
    {
      cwd: projectRoot,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  if (result.status !== 0) {
    // If command fails, assume no divergence
    return { ahead: 0, behind: 0, diverged: false };
  }

  const output = result.stdout?.trim() || '0\t0';
  const [behind, ahead] = output.split(/\s+/).map(s => parseInt(s, 10));

  return {
    ahead: ahead || 0,
    behind: behind || 0,
    diverged: (ahead || 0) > 0 || (behind || 0) > 0,
  };
}
