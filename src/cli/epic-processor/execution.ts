/**
 * Story and phase execution
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { mergePullRequest, waitForChecks } from '../../agents/review.js';
import {
  DEFAULT_MERGE_CONFIG,
  getSdlcRoot,
} from '../../core/config.js';
import { isPRMerged, markPRMerged, parseStory } from '../../core/story.js';
import { StoryLogger } from '../../core/story-logger.js';
import { type GitWorktreeService } from '../../core/worktree.js';
import type { Config, PhaseExecutionResult, Story } from '../../types/index.js';
import {
  type DashboardState,
  markStoryFailed,
  markStorySkipped,
  updateStoryStatus,
} from '../progress-dashboard.js';

/**
 * Merge a story's PR after successful completion
 * Waits for CI checks to pass before merging
 */
export async function mergeStoryPR(
  storyId: string,
  worktreePath: string,
  config: Config,
  logger: StoryLogger
): Promise<{ success: boolean; error?: string }> {
  const mergeConfig = config.merge ?? DEFAULT_MERGE_CONFIG;

  if (!mergeConfig.enabled) {
    logger.log('DEBUG', 'PR merge is disabled in config');
    return { success: true };
  }

  // Load the story from the worktree to get pr_url
  const sdlcRoot = path.join(worktreePath, config.sdlcFolder);
  const storyPath = path.join(sdlcRoot, 'stories', storyId, 'story.md');

  if (!fs.existsSync(storyPath)) {
    logger.log('WARN', `Story file not found in worktree: ${storyPath}`);
    return { success: true }; // Not a failure - story might not have a PR
  }

  let story: Story;
  try {
    story = parseStory(storyPath);
  } catch (error) {
    logger.log('ERROR', `Failed to parse story: ${error}`);
    return { success: false, error: `Failed to parse story: ${error}` };
  }

  // Check if story has a PR URL
  const prUrl = story.frontmatter.pr_url;
  if (!prUrl) {
    logger.log('DEBUG', 'Story has no PR URL, skipping merge');
    return { success: true };
  }

  // Check if already merged
  if (isPRMerged(story)) {
    logger.log('DEBUG', 'PR already merged');
    return { success: true };
  }

  logger.log('INFO', `Waiting for CI checks on PR: ${prUrl}`);

  // Wait for CI checks to pass
  const checksResult = await waitForChecks(prUrl, worktreePath, {
    timeout: mergeConfig.checksTimeout,
    pollingInterval: mergeConfig.checksPollingInterval,
    requireAllChecksPassing: mergeConfig.requireAllChecksPassing,
  });

  if (!checksResult.allPassed) {
    if (checksResult.timedOut) {
      logger.log('WARN', `CI checks timed out after ${mergeConfig.checksTimeout}ms`);
      return { success: false, error: 'CI checks timed out - manual merge required' };
    }
    logger.log('ERROR', `CI checks failed: ${checksResult.error}`);
    return { success: false, error: checksResult.error || 'CI checks failed' };
  }

  logger.log('INFO', 'CI checks passed, merging PR');

  // Merge the PR
  const mergeResult = await mergePullRequest(prUrl, worktreePath, {
    strategy: mergeConfig.strategy,
    deleteBranchAfterMerge: mergeConfig.deleteBranchAfterMerge,
  });

  if (!mergeResult.success) {
    logger.log('ERROR', `PR merge failed: ${mergeResult.error}`);
    return { success: false, error: mergeResult.error || 'PR merge failed' };
  }

  logger.log('INFO', `PR merged successfully${mergeResult.mergeSha ? ` (SHA: ${mergeResult.mergeSha})` : ''}`);

  // Update story with merge metadata
  try {
    await markPRMerged(story, mergeResult.mergeSha);
    logger.log('DEBUG', 'Updated story with merge metadata');
  } catch (error) {
    // Log but don't fail - the merge succeeded
    logger.log('WARN', `Failed to update story with merge metadata: ${error}`);
  }

  return { success: true };
}

/**
 * Process a single story in an isolated worktree
 */
export async function processStoryInWorktree(
  story: Story,
  dashboard: DashboardState,
  worktreeService: GitWorktreeService,
  keepWorktrees: boolean,
  config: Config,
  failedDeps: Set<string>
): Promise<{ success: boolean; error?: string }> {
  const storyId = story.frontmatter.id;
  const slug = story.frontmatter.slug;

  // Defensive check: verify no dependencies have failed before starting
  // This catches race conditions where a dependency fails during parallel execution
  const deps = story.frontmatter.dependencies || [];
  const blockedByDep = deps.find(dep => failedDeps.has(dep));
  if (blockedByDep) {
    const reason = `Dependency failed: ${blockedByDep}`;
    markStorySkipped(dashboard, storyId, reason);
    return { success: false, error: reason };
  }

  updateStoryStatus(dashboard, storyId, 'in-progress');

  try {
    // Create worktree (or resume existing one)
    const worktreePath = worktreeService.create({
      storyId,
      slug,
      resumeIfExists: true,
    });

    // Verify worktree was created
    if (!fs.existsSync(worktreePath)) {
      const error = `Worktree creation failed: ${worktreePath} does not exist`;
      markStoryFailed(dashboard, storyId, error);
      return { success: false, error };
    }

    // Log to story-specific epic run log
    const sdlcRoot = getSdlcRoot();
    const logger = new StoryLogger(storyId, sdlcRoot);
    logger.log('INFO', `Starting story execution in worktree: ${worktreePath}`);

    // Spawn ai-sdlc run process in worktree
    // Use the same invocation method as the current process (handles global install, npx, or dev mode)
    // Use --no-worktree since we're already in an isolated worktree
    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      const proc = spawn(
        process.execPath,
        [process.argv[1], 'run', '--story', storyId, '--auto', '--no-worktree'],
        {
          cwd: worktreePath,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
        }
      );

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        // Log subprocess output for debugging
        if (stdout.trim()) {
          logger.log('DEBUG', `Subprocess stdout:\n${stdout}`);
        }
        if (stderr.trim()) {
          logger.log('DEBUG', `Subprocess stderr:\n${stderr}`);
        }

        if (code === 0) {
          logger.log('INFO', 'Story execution completed successfully');
          resolve({ success: true });
        } else {
          const error = `Process exited with code ${code}`;
          logger.log('ERROR', `Story execution failed: ${error}\n${stderr}`);
          resolve({ success: false, error });
        }
      });

      proc.on('error', (err) => {
        logger.log('ERROR', `Failed to spawn process: ${err.message}`);
        resolve({ success: false, error: err.message });
      });
    });

    // FIX: Post-subprocess state verification
    // Re-read story file and verify actual state matches expected completion state
    if (result.success) {
      try {
        const worktreeSdlcRoot = path.join(worktreePath, '.ai-sdlc');
        const storyPath = path.join(worktreeSdlcRoot, 'stories', storyId, 'story.md');
        if (fs.existsSync(storyPath)) {
          const verifiedStory = parseStory(storyPath);
          const storyStatus = verifiedStory.frontmatter.status;
          const reviewsComplete = verifiedStory.frontmatter.reviews_complete;
          const prUrl = verifiedStory.frontmatter.pr_url;

          // Story must be done with reviews_complete for success
          if (storyStatus !== 'done' || !reviewsComplete) {
            result.success = false;
            result.error = `Story not fully completed: status=${storyStatus}, reviews_complete=${reviewsComplete}, pr_url=${prUrl || 'missing'}`;
            logger.log('ERROR', `Post-verification failed: ${result.error}`);
          }
        }
      } catch (verifyError) {
        logger.log('WARN', `Failed to verify story state: ${verifyError}`);
        // Don't fail the story for verification errors - the subprocess exit code is still valid
      }
    }

    // If execution succeeded, attempt PR merge (if enabled)
    if (result.success && config.merge?.enabled) {
      const mergeResult = await mergeStoryPR(storyId, worktreePath, config, logger);
      if (!mergeResult.success) {
        // Merge failure is a story failure
        result.success = false;
        result.error = mergeResult.error || 'PR merge failed';
        logger.log('ERROR', `Story failed due to merge failure: ${result.error}`);
      }
    }

    // Cleanup worktree if not keeping
    if (!keepWorktrees) {
      try {
        // Use force cleanup after successful merge since branch may be deleted
        const forceCleanup = result.success && config.merge?.enabled && config.merge?.deleteBranchAfterMerge;
        worktreeService.remove(worktreePath, forceCleanup);
      } catch (cleanupError) {
        // Log but don't fail the story
        logger.log('WARN', `Failed to cleanup worktree: ${cleanupError}`);
      }
    }

    if (result.success) {
      updateStoryStatus(dashboard, storyId, 'completed');
    } else {
      markStoryFailed(dashboard, storyId, result.error || 'Unknown error');
    }

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    markStoryFailed(dashboard, storyId, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Execute a single phase with concurrency limit
 */
export async function executePhase(
  phase: Story[],
  phaseNumber: number,
  maxConcurrent: number,
  dashboard: DashboardState,
  worktreeService: GitWorktreeService,
  keepWorktrees: boolean,
  config: Config,
  failedDeps: Set<string>
): Promise<PhaseExecutionResult> {
  const result: PhaseExecutionResult = {
    phase: phaseNumber,
    succeeded: [],
    failed: [],
    skipped: [],
  };

  const queue = [...phase];
  const active = new Set<Promise<{ storyId: string; success: boolean; error?: string }>>();

  while (queue.length > 0 || active.size > 0) {
    // Fill up to maxConcurrent
    while (active.size < maxConcurrent && queue.length > 0) {
      const story = queue.shift()!;
      const promise = processStoryInWorktree(story, dashboard, worktreeService, keepWorktrees, config, failedDeps)
        .then(result => ({
          storyId: story.frontmatter.id,
          ...result,
        }));

      active.add(promise);

      // Remove from active when done
      promise.finally(() => active.delete(promise));
    }

    if (active.size > 0) {
      // Wait for at least one to complete
      const completed = await Promise.race(active);

      if (completed.success) {
        result.succeeded.push(completed.storyId);
      } else {
        result.failed.push(completed.storyId);
      }
    }
  }

  return result;
}
