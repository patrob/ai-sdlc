import path from 'path';
import { spawn } from 'child_process';
import { Story, EpicProcessingOptions, EpicSummary, PhaseExecutionResult, Config } from '../types/index.js';
import { getSdlcRoot, loadConfig, validateWorktreeBasePath, DEFAULT_MERGE_CONFIG } from '../core/config.js';
import { findStoriesByEpic } from '../core/kanban.js';
import { GitWorktreeService } from '../core/worktree.js';
import { getThemedChalk } from '../core/theme.js';
import { groupStoriesByPhase, validateDependencies } from './dependency-resolver.js';
import {
  createDashboard,
  updateStoryStatus,
  markStorySkipped,
  markStoryFailed,
  advancePhase,
  startDashboardRenderer,
  DashboardState,
} from './progress-dashboard.js';
import { StoryLogger } from '../core/story-logger.js';
import { parseStory, isPRMerged, markPRMerged } from '../core/story.js';
import { waitForChecks, mergePullRequest } from '../agents/review.js';
import fs from 'fs';

/**
 * Normalize epic ID by stripping 'epic-' prefix if present
 * Both 'epic-foo' and 'foo' become 'foo'
 */
export function normalizeEpicId(epicId: string): string {
  return epicId.startsWith('epic-') ? epicId.slice(5) : epicId;
}

/**
 * Discover stories for an epic with normalized ID
 * Filters out stories that are already done
 */
export function discoverEpicStories(sdlcRoot: string, epicId: string): Story[] {
  const normalized = normalizeEpicId(epicId);
  const stories = findStoriesByEpic(sdlcRoot, normalized);

  // Filter out stories that are already done
  const activeStories = stories.filter(story => story.frontmatter.status !== 'done');

  // Sort by priority (ascending) then created date (ascending)
  return activeStories.sort((a, b) => {
    if (a.frontmatter.priority !== b.frontmatter.priority) {
      return a.frontmatter.priority - b.frontmatter.priority;
    }
    return a.frontmatter.created.localeCompare(b.frontmatter.created);
  });
}

/**
 * Format execution plan for display
 */
function formatExecutionPlan(epicId: string, phases: Story[][]): string {
  const lines: string[] = [];
  const totalStories = phases.reduce((sum, phase) => sum + phase.length, 0);

  lines.push(`\nFound ${totalStories} stories for epic: ${epicId}\n`);

  phases.forEach((phase, index) => {
    const phaseNum = index + 1;
    const storyCount = phase.length;
    const parallelNote = storyCount > 1 ? ', parallel' : '';

    lines.push(`Phase ${phaseNum} (${storyCount} ${storyCount === 1 ? 'story' : 'stories'}${parallelNote}):`);

    phase.forEach(story => {
      const deps = story.frontmatter.dependencies || [];
      const depsStr = deps.length > 0 ? ` (depends: ${deps.join(', ')})` : '';
      lines.push(`  • ${story.frontmatter.id}: ${story.frontmatter.title}${depsStr}`);
    });

    lines.push('');
  });

  // Estimate time (rough: 15-30 min per story, parallelized)
  const estimatedMinutes = phases.length * 15; // Very rough estimate
  lines.push(`Estimated time: ${estimatedMinutes}-${estimatedMinutes * 2} minutes`);

  return lines.join('\n');
}

/**
 * Merge a story's PR after successful completion
 * Waits for CI checks to pass before merging
 */
async function mergeStoryPR(
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
async function processStoryInWorktree(
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
async function executePhase(
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

/**
 * Generate final epic summary
 */
function generateEpicSummary(
  epicId: string,
  phases: Story[][],
  phaseResults: PhaseExecutionResult[],
  failedStories: Map<string, string>,
  skippedStories: Map<string, string>,
  startTime: number
): EpicSummary {
  const totalStories = phases.reduce((sum, phase) => sum + phase.length, 0);
  const completed = phaseResults.reduce((sum, r) => sum + r.succeeded.length, 0);
  const failed = Array.from(failedStories.keys()).length;
  const skipped = Array.from(skippedStories.keys()).length;

  return {
    epicId,
    totalStories,
    completed,
    failed,
    skipped,
    duration: Date.now() - startTime,
    failedStories: Array.from(failedStories.entries()).map(([storyId, error]) => ({
      storyId,
      error,
    })),
    skippedStories: Array.from(skippedStories.entries()).map(([storyId, reason]) => ({
      storyId,
      reason,
    })),
  };
}

/**
 * Print epic summary to console
 */
function printEpicSummary(summary: EpicSummary, chalk: any): void {
  console.log('\n' + chalk.bold('═══ Epic Summary ═══'));
  console.log(`\nEpic: ${chalk.bold(summary.epicId)}`);
  console.log('');

  if (summary.completed > 0) {
    console.log(chalk.success(`✓ Completed: ${summary.completed} ${summary.completed === 1 ? 'story' : 'stories'}`));
  }

  if (summary.failed > 0) {
    console.log(chalk.error(`✗ Failed: ${summary.failed} ${summary.failed === 1 ? 'story' : 'stories'}`));
    summary.failedStories.forEach(({ storyId, error }) => {
      console.log(chalk.error(`  • ${storyId}: ${error}`));
    });
  }

  if (summary.skipped > 0) {
    console.log(chalk.warning(`⊘ Skipped: ${summary.skipped} ${summary.skipped === 1 ? 'story' : 'stories'} (dependencies failed)`));
    summary.skippedStories.forEach(({ storyId, reason }) => {
      console.log(chalk.dim(`  • ${storyId}: ${reason}`));
    });
  }

  const durationSeconds = Math.floor(summary.duration / 1000);
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  console.log('');
  console.log(`Duration: ${minutes}m ${seconds}s`);
  console.log('');
}

/**
 * Main epic processing function
 */
export async function processEpic(options: EpicProcessingOptions): Promise<number> {
  const config = loadConfig();
  const c = getThemedChalk(config);
  const sdlcRoot = getSdlcRoot();
  const projectRoot = process.cwd();

  // Validate worktrees enabled
  if (!config.worktree?.enabled) {
    console.log(c.error('Error: Epic processing requires worktrees to be enabled'));
    console.log(c.dim('Set "worktree.enabled": true in .ai-sdlc.json'));
    return 1;
  }

  // Get effective configuration
  const maxConcurrent = options.maxConcurrent ?? config.epic?.maxConcurrent ?? 3;
  const keepWorktrees = options.keepWorktrees ?? config.epic?.keepWorktrees ?? false;
  const continueOnFailure = config.epic?.continueOnFailure ?? true;

  // Apply CLI overrides for merge config
  if (options.merge !== undefined) {
    config.merge = config.merge ?? { ...DEFAULT_MERGE_CONFIG };
    config.merge.enabled = options.merge;
  }
  if (options.mergeStrategy !== undefined) {
    config.merge = config.merge ?? { ...DEFAULT_MERGE_CONFIG };
    config.merge.strategy = options.mergeStrategy;
  }

  // Validate maxConcurrent
  if (maxConcurrent < 1) {
    console.log(c.error('Error: --max-concurrent must be >= 1'));
    return 1;
  }

  // Discover stories (active only - done stories are filtered out)
  console.log(c.info(`Discovering stories for epic: ${options.epicId}`));
  const stories = discoverEpicStories(sdlcRoot, options.epicId);

  // Also get done story IDs to treat as pre-satisfied dependencies
  const normalized = normalizeEpicId(options.epicId);
  const allEpicStories = findStoriesByEpic(sdlcRoot, normalized);
  const doneStoryIds = new Set(
    allEpicStories
      .filter(s => s.frontmatter.status === 'done')
      .map(s => s.frontmatter.id)
  );

  if (stories.length === 0) {
    if (doneStoryIds.size > 0) {
      console.log(c.success(`All ${doneStoryIds.size} stories in epic are already done!`));
    } else {
      console.log(c.warning(`No stories found for epic: ${options.epicId}`));
    }
    return 0; // Not an error
  }

  // Validate dependencies (done stories count as satisfied)
  const validation = validateDependencies(stories, doneStoryIds);
  if (!validation.valid) {
    console.log(c.error('Error: Invalid dependencies detected:'));
    validation.errors.forEach(error => console.log(c.error(`  • ${error}`)));
    return 1;
  }

  // Group into phases (done stories count as already completed)
  const phases = groupStoriesByPhase(stories, doneStoryIds);

  // Display execution plan
  console.log(formatExecutionPlan(options.epicId, phases));

  // Dry run - stop here
  if (options.dryRun) {
    console.log(c.info('\nDry run complete - no stories executed'));
    return 0;
  }

  // Confirm execution (unless --force)
  if (!options.force) {
    console.log(c.warning('\nContinue? [Y/n] '));
    // For now, assume yes in automated context
    // TODO: Add actual prompt in interactive mode
  }

  // Initialize worktree service with resolved basePath
  let resolvedBasePath: string;
  try {
    resolvedBasePath = validateWorktreeBasePath(config.worktree.basePath, projectRoot);
  } catch (error) {
    console.log(c.error(`Configuration Error: ${error instanceof Error ? error.message : String(error)}`));
    return 1;
  }
  const worktreeService = new GitWorktreeService(projectRoot, resolvedBasePath);

  // Create dashboard
  const dashboard = createDashboard(options.epicId, phases);
  const stopRenderer = startDashboardRenderer(dashboard);

  const startTime = Date.now();
  const failedStories = new Map<string, string>();
  const skippedStories = new Map<string, string>();
  const phaseResults: PhaseExecutionResult[] = [];

  try {
    // Execute phases sequentially
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];

      // Check if any stories in this phase should be skipped due to failed or unmerged dependencies
      const phaseToExecute = phase.filter(story => {
        const deps = story.frontmatter.dependencies || [];

        // Check for failed or skipped dependencies (skipped stories also block downstream)
        const hasBlockedDep = deps.some(dep => failedStories.has(dep) || skippedStories.has(dep));
        if (hasBlockedDep) {
          const blockedDep = deps.find(dep => failedStories.has(dep) || skippedStories.has(dep))!;
          const reason = `Dependency blocked: ${blockedDep}`;
          markStorySkipped(dashboard, story.frontmatter.id, reason);
          skippedStories.set(story.frontmatter.id, reason);
          return false;
        }

        // If merge is enabled, check for unmerged dependencies
        // A dependency is unmerged if it has a pr_url but pr_merged !== true
        if (config.merge?.enabled) {
          for (const depId of deps) {
            // Skip done stories (already validated) and failed stories (handled above)
            if (doneStoryIds.has(depId) || failedStories.has(depId)) continue;

            // Check if this dependency story has been completed in this run
            const depCompleted = phaseResults.some(pr => pr.succeeded.includes(depId));
            if (!depCompleted) continue;

            // Try to load the dependency story to check merge status
            try {
              const depStoryPath = path.join(sdlcRoot, 'stories', depId, 'story.md');
              if (fs.existsSync(depStoryPath)) {
                const depStory = parseStory(depStoryPath);
                if (depStory.frontmatter.pr_url && !isPRMerged(depStory)) {
                  const reason = `Waiting for dependency merge: ${depId}`;
                  markStorySkipped(dashboard, story.frontmatter.id, reason);
                  skippedStories.set(story.frontmatter.id, reason);
                  return false;
                }
              }
            } catch {
              // If we can't read the story, skip this check
            }
          }
        }

        return true;
      });

      // Skip phase if all stories are blocked
      if (phaseToExecute.length === 0) {
        continue;
      }

      // Create set of failed dependencies for defensive checks
      // Include both failed and skipped stories as they both block downstream
      const failedDeps = new Set([...failedStories.keys(), ...skippedStories.keys()]);

      // Execute phase
      const result = await executePhase(
        phaseToExecute,
        i + 1,
        maxConcurrent,
        dashboard,
        worktreeService,
        keepWorktrees,
        config,
        failedDeps
      );

      phaseResults.push(result);

      // Track failed stories
      result.failed.forEach(storyId => {
        failedStories.set(storyId, 'Execution failed');
      });

      // Stop on failure if not continuing
      if (!continueOnFailure && result.failed.length > 0) {
        console.log(c.error('\nStopping due to failure (continueOnFailure = false)'));
        break;
      }

      advancePhase(dashboard);
    }
  } finally {
    stopRenderer();
  }

  // Generate and print summary
  const summary = generateEpicSummary(
    options.epicId,
    phases,
    phaseResults,
    failedStories,
    skippedStories,
    startTime
  );

  printEpicSummary(summary, c);

  // Return exit code
  return summary.failed > 0 ? 1 : 0;
}
