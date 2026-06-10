import { spawnSync } from 'child_process';
import { existsSync } from 'fs';

import { type WorktreeInfo } from '../../types/index.js';

/**
 * List all ai-sdlc managed worktrees
 * @param projectRoot - Path to project root
 * @param worktreeBasePath - Base path for worktrees
 * @returns Array of WorktreeInfo objects for worktrees in the basePath
 * @throws Error if listing fails
 */
export function listWorktrees(projectRoot: string, worktreeBasePath: string): WorktreeInfo[] {
  const result = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: projectRoot,
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(`Failed to list worktrees: ${result.stderr}`);
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
    if (worktreePath && worktreePath.startsWith(worktreeBasePath)) {
      // Try to extract story ID from branch name first, then fall back to directory name
      const storyIdMatch = branch.match(/^ai-sdlc\/(S-\d+)-/);
      const dirName = worktreePath.split('/').pop() || '';
      const dirStoryIdMatch = dirName.match(/^(S-\d+)-/);
      worktrees.push({
        path: worktreePath,
        branch,
        storyId: storyIdMatch?.[1] ?? dirStoryIdMatch?.[1] ?? undefined,
        exists: existsSync(worktreePath),
      });
    }
  }

  return worktrees;
}

/**
 * Find a worktree by story ID
 * @param storyId - The story ID to search for (e.g., 'S-0029')
 * @param projectRoot - Path to project root
 * @param worktreeBasePath - Base path for worktrees
 * @returns The WorktreeInfo if found, undefined otherwise
 */
export function findWorktreeByStoryId(storyId: string, projectRoot: string, worktreeBasePath: string): WorktreeInfo | undefined {
  const worktrees = listWorktrees(projectRoot, worktreeBasePath);
  return worktrees.find(w => w.storyId === storyId);
}
