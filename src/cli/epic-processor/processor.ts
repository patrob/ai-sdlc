/**
 * Epic processor main function
 */

import fs from 'fs';
import path from 'path';

import {
  DEFAULT_MERGE_CONFIG,
  getSdlcRoot,
  loadConfig,
  validateWorktreeBasePath,
} from '../../core/config.js';
import { findStoriesByEpic } from '../../core/kanban.js';
import { isPRMerged, parseStory } from '../../core/story.js';
import { getThemedChalk } from '../../core/theme.js';
import { GitWorktreeService } from '../../core/worktree.js';
import type { EpicProcessingOptions } from '../../types/index.js';
import { groupStoriesByPhase, validateDependencies } from '../dependency-resolver.js';
import {
  advancePhase,
  createDashboard,
  markStorySkipped,
  startDashboardRenderer,
} from '../progress-dashboard.js';
import { discoverEpicStories, normalizeEpicId } from './discovery.js';
import { executePhase } from './execution.js';
import { formatExecutionPlan, generateEpicSummary, printEpicSummary } from './formatting.js';

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
  const phaseResults: any[] = [];

  try {
    // Execute phases sequentially
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];

      // Refresh done story IDs from disk - subprocesses may have marked stories as done
      const freshAllStories = findStoriesByEpic(sdlcRoot, normalized);
      const freshDoneIds = new Set(
        freshAllStories
          .filter(s => s.frontmatter.status === 'done')
          .map(s => s.frontmatter.id)
      );

      // Filter out stories from this phase that are now done (completed in previous phases)
      const stillActivePhase = phase.filter(s => !freshDoneIds.has(s.frontmatter.id));

      // Check if any stories in this phase should be skipped due to failed or unmerged dependencies
      const phaseToExecute = stillActivePhase.filter(story => {
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
            // Skip done stories (fresh from disk) and failed stories (handled above)
            if (freshDoneIds.has(depId) || failedStories.has(depId)) continue;

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
