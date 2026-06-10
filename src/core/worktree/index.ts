import { type WorktreeInfo } from '../../types/index.js';
import { buildProject, createWorktree, installDependencies } from './create.js';
import { findWorktreeByStoryId,listWorktrees } from './list.js';
import { getLastCompletedPhase, getNextPhase } from './phase.js';
import { deleteBranch, deleteRemoteBranch,removeWorktree } from './remove.js';
import { GitWorktreeService as BaseGitWorktreeService } from './service.js';
import { branchExistsOnRemote, checkBranchDivergence,getCommitCount, getWorktreeStatus, hasUnpushedCommits } from './status.js';
import { type BranchDivergence,type WorktreeOptions, type WorktreeResumeValidationResult, type WorktreeStatus, type WorktreeValidationResult } from './types.js';

/**
 * Extended GitWorktreeService with additional helper methods
 */
export class GitWorktreeService extends BaseGitWorktreeService {
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

    return createWorktree(
      options,
      this['projectRoot'],
      worktreePath,
      branchName,
      baseBranch,
      (path, branch) => this.validateWorktreeForResume(path, branch),
      (path) => this.exists(path)
    );
  }

  /**
   * Install npm dependencies in a worktree
   * @param worktreePath - Path to the worktree
   */
  installDependencies(worktreePath: string): void {
    installDependencies(worktreePath);
  }

  /**
   * Build the project in a worktree
   * @param worktreePath - Path to the worktree
   */
  buildProject(worktreePath: string): void {
    buildProject(worktreePath);
  }

  /**
   * List all ai-sdlc managed worktrees
   * @returns Array of WorktreeInfo objects for worktrees in the basePath
   */
  list(): WorktreeInfo[] {
    return listWorktrees(this['projectRoot'], this['worktreeBasePath']);
  }

  /**
   * Find a worktree by story ID
   * @param storyId - The story ID to search for (e.g., 'S-0029')
   * @returns The WorktreeInfo if found, undefined otherwise
   */
  findByStoryId(storyId: string): WorktreeInfo | undefined {
    return findWorktreeByStoryId(storyId, this['projectRoot'], this['worktreeBasePath']);
  }

  /**
   * Get detailed status information for a worktree
   * @param worktreeInfo - The worktree to get status for
   * @returns Detailed status including last commit and working directory state
   */
  getWorktreeStatus(worktreeInfo: WorktreeInfo): WorktreeStatus {
    return getWorktreeStatus(worktreeInfo);
  }

  /**
   * Check if worktree has unpushed commits
   * @param worktreePath - Path to the worktree
   * @returns Object with hasUnpushed flag and count of unpushed commits
   */
  hasUnpushedCommits(worktreePath: string): { hasUnpushed: boolean; count: number } {
    return hasUnpushedCommits(worktreePath);
  }

  /**
   * Check if a branch exists on the remote
   * @param branch - Branch name to check
   * @returns true if branch exists on remote, false otherwise
   */
  branchExistsOnRemote(branch: string): boolean {
    return branchExistsOnRemote(branch, this['projectRoot']);
  }

  /**
   * Get the total number of commits in a worktree
   * @param worktreePath - Path to the worktree
   * @returns Number of commits, or 0 on error
   */
  getCommitCount(worktreePath: string): number {
    return getCommitCount(worktreePath);
  }

  /**
   * Delete a local branch
   * @param branch - Branch name to delete
   * @param force - Whether to force delete (use -D instead of -d)
   * @throws Error if deletion fails (unless branch doesn't exist)
   */
  deleteBranch(branch: string, force: boolean = true): void {
    deleteBranch(branch, this['projectRoot'], force);
  }

  /**
   * Delete a remote branch
   * @param branch - Branch name to delete from remote
   * @throws Error if deletion fails (unless branch doesn't exist)
   */
  deleteRemoteBranch(branch: string): void {
    deleteRemoteBranch(branch, this['projectRoot']);
  }

  /**
   * Remove a git worktree
   * @param worktreePath - Absolute path to the worktree to remove
   * @param force - Whether to force remove (ignores uncommitted changes)
   * @throws Error if removal fails
   */
  remove(worktreePath: string, force: boolean = false): void {
    removeWorktree(worktreePath, this['projectRoot'], force);
  }

  /**
   * Check how much a branch has diverged from the base branch
   * @param branchName - Name of the branch to check
   * @param baseBranch - Base branch to compare against (default: main)
   * @returns Divergence information
   */
  checkBranchDivergence(branchName: string, baseBranch?: string): BranchDivergence {
    const base = baseBranch || this.detectBaseBranch();
    return checkBranchDivergence(branchName, this['projectRoot'], base);
  }
}

// Export types and functions
export type { BranchDivergence,WorktreeOptions, WorktreeResumeValidationResult, WorktreeStatus, WorktreeValidationResult };
export { getLastCompletedPhase, getNextPhase };
