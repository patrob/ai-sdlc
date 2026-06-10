import path from 'path';
import * as readline from 'readline';
import { spawnSync } from 'child_process';
import { getSdlcRoot, loadConfig, DEFAULT_WORKTREE_CONFIG, validateWorktreeBasePath, saveConfig } from '../../core/config.js';
import { kanbanExists, assessState, findStoryBySlug } from '../../core/kanban.js';
import { findStoryById, getStory, updateStoryField, writeStory, parseStory, resetRPIVCycle, isAtMaxRetries, updateStoryStatus, getEffectiveMaxImplementationRetries, isAtMaxImplementationRetries, resetImplementationRetryCount, incrementImplementationRetryCount } from '../../core/story.js';
import { getThemedChalk } from '../../core/theme.js';
import { getLogger } from '../../core/logger.js';
import { GitWorktreeService, getLastCompletedPhase, getNextPhase } from '../../core/worktree.js';
import { loadWorkflowState, clearWorkflowState, generateWorkflowId, calculateStoryHash, hasWorkflowState, saveWorkflowState, migrateGlobalWorkflowState } from '../../core/workflow-state.js';
import { validateGitState } from '../../core/git-utils.js';
import { createStoryFromFeatureRequest } from '../feature-request.js';
import { runConcurrentStoryQueue } from './concurrent.js';
import { executeAction } from './execute-action.js';
import { handleWorktreeCleanup } from './worktrees.js';
import { formatAction } from './format-utils.js';
import { getPhaseInfo, calculatePhaseProgress, renderPhaseChecklist } from './phase-display.js';
import { validateAutoStoryOptions, validateBatchOptions, shouldExecutePhase, generateFullSDLCActions, GIT_MODIFYING_ACTIONS, requiresGitValidation, displayGitValidationResult, sanitizeForDisplay } from './run-helpers.js';
import { setupWorktree } from './run-worktree.js';
import { processBatchInternal } from './run-batch.js';
import type { Story, Action, CompletedActionRecord, WorkflowExecutionState } from '../../types/index.js';
import { ReviewDecision } from '../../types/index.js';
import { generateReviewSummary } from '../../agents/review.js';
import { getTerminalWidth } from '../formatting.js';

/**
 * Result of the run() function execution
 */
export interface RunResult {
  success: boolean;
}

/**
 * Run the workflow (process one action or all)
 */
export async function run(options: { auto?: boolean; dryRun?: boolean; continue?: boolean; story?: string; batch?: string; epic?: string; maxConcurrent?: string; concurrent?: string; step?: string; maxIterations?: string; watch?: boolean; verbose?: boolean; force?: boolean; worktree?: boolean; clean?: boolean; keepWorktrees?: boolean; merge?: boolean; mergeStrategy?: string; request?: string; grillMe?: boolean }): Promise<RunResult> {
  const config = loadConfig();
  // Parse maxIterations from CLI (undefined means use config default which is Infinity)
  const maxIterationsOverride = options.maxIterations !== undefined
    ? parseInt(options.maxIterations, 10)
    : undefined;
  let sdlcRoot = getSdlcRoot();
  const c = getThemedChalk(config);
  const logger = getLogger();

  logger.debug('workflow', 'Run command initiated', {
    auto: options.auto,
    dryRun: options.dryRun,
    continue: options.continue,
    story: options.story,
    step: options.step,
    watch: options.watch,
    request: options.request,
    grillMe: options.grillMe,
    worktree: options.worktree,
    clean: options.clean,
    force: options.force,
  });

  // Migrate global workflow state to story-specific location if needed
  // Only run when NOT continuing (to avoid interrupting resumed workflows)
  if (!options.continue) {
    const migrationResult = await migrateGlobalWorkflowState(sdlcRoot);
    if (migrationResult.migrated) {
      console.log(c.info(migrationResult.message));
    }
  }

  if (options.grillMe && !options.request) {
    console.log(c.error('Error: --grill-me requires --request <text>'));
    return { success: false };
  }

  if (options.request && options.dryRun) {
    console.log(c.info('Dry run - would create story from feature request'));
    console.log(c.dim(`  /grill-me: ${options.grillMe ? 'yes' : 'no'}`));
    console.log(c.dim(`  Request: ${options.request}`));
    return { success: true };
  }

  if (options.request) {
    if (!kanbanExists(sdlcRoot)) {
      console.log(c.warning('ai-sdlc not initialized. Run `ai-sdlc init` first.'));
      return { success: false };
    }

    const story = await createStoryFromFeatureRequest(options.request, sdlcRoot, {
      grillMe: options.grillMe,
    });
    console.log(c.success(`Created story from feature request: ${story.frontmatter.id}`));
    console.log(c.dim(`  Title: ${story.frontmatter.title}`));

    if (!options.story) {
      options.story = story.frontmatter.id;
    }
    if (!options.watch && options.auto === undefined) {
      options.auto = true;
    }
  }

  // Handle daemon/watch mode
  if (options.watch) {
    console.log(c.info('🚀 Starting daemon mode...'));
    const { startDaemon } = await import('../daemon.js');
    await startDaemon({ maxIterations: maxIterationsOverride, verbose: options.verbose });
    return { success: true }; // Daemon runs indefinitely
  }

  // Handle concurrent mode
  if (options.concurrent) {
    const concurrency = parseInt(options.concurrent, 10);

    // Validate concurrency value
    if (isNaN(concurrency) || concurrency <= 0) {
      console.log(c.warning(`Warning: Invalid --concurrent value "${options.concurrent}". Defaulting to 1 (single-story mode).`));
      // Fall through to normal single-story mode
    } else if (concurrency > 1) {
      // Import orchestrator and run concurrent mode
      const { findStoriesByStatus } = await import('../../core/kanban.js');

      // Query database for ready stories, sorted by priority
      const readyStories = findStoriesByStatus(sdlcRoot, 'ready');

      if (readyStories.length === 0) {
        console.log(c.info('No ready stories found. Add stories to the ready column in the kanban board.'));
        return { success: true }; // No error, just nothing to do
      }

      console.log(c.info(`🚀 Running ${readyStories.length} ready stories with concurrency ${concurrency}`));
      const results = await runConcurrentStoryQueue(readyStories, concurrency, sdlcRoot, options.keepWorktrees, c);

      // Report results
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      console.log('');
      console.log(c.info('═══════════════════════════════════════════'));
      console.log(c.info('Concurrent Execution Summary'));
      console.log(c.info('═══════════════════════════════════════════'));
      console.log(c.success(`✅ Succeeded: ${succeeded}`));
      if (failed > 0) {
        console.log(c.error(`❌ Failed: ${failed}`));
      }
      console.log('');

      // Exit with error code if any failed
      if (failed > 0) {
        process.exit(1);
      }
      return { success: true };
    }
  }

  // Handle epic mode
  if (options.epic) {
    const { processEpic } = await import('../epic-processor.js');
    const maxConcurrent = options.maxConcurrent ? parseInt(options.maxConcurrent, 10) : undefined;

    // Parse merge strategy if provided
    const mergeStrategy = options.mergeStrategy as 'squash' | 'merge' | 'rebase' | undefined;

    const exitCode = await processEpic({
      epicId: options.epic,
      maxConcurrent,
      dryRun: options.dryRun,
      force: options.force,
      keepWorktrees: options.keepWorktrees,
      merge: options.merge,
      mergeStrategy,
    });

    process.exit(exitCode);
  }

  // Handle batch mode
  if (options.batch) {
    // Validate batch options first
    try {
      validateBatchOptions(options);
    } catch (error) {
      console.log(c.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
      return { success: false };
    }

    // Import batch validation modules
    const { parseStoryIdList, deduplicateStoryIds, validateStoryIds } = await import('../batch-validator.js');

    // Parse and validate story IDs
    const rawStoryIds = parseStoryIdList(options.batch);

    if (rawStoryIds.length === 0) {
      console.log(c.error('Error: Empty batch - no story IDs provided'));
      console.log(c.dim('Usage: ai-sdlc run --batch S-001,S-002,S-003'));
      return { success: false };
    }

    // Deduplicate story IDs
    const storyIds = deduplicateStoryIds(rawStoryIds);
    if (storyIds.length < rawStoryIds.length) {
      const duplicateCount = rawStoryIds.length - storyIds.length;
      console.log(c.dim(`Note: Removed ${duplicateCount} duplicate story ID(s)`));
    }

    // Validate all stories exist before processing
    const validation = validateStoryIds(storyIds, sdlcRoot);
    if (!validation.valid) {
      console.log(c.error('Error: Batch validation failed'));
      console.log();
      for (const error of validation.errors) {
        console.log(c.error(`  - ${error.message}`));
      }
      console.log();
      console.log(c.dim('Fix the errors above and try again.'));
      return { success: false };
    }

    // Process the batch using internal function
    await processBatchInternal(storyIds, sdlcRoot, {
      dryRun: options.dryRun,
      worktree: options.worktree,
      force: options.force,
    });

    return { success: true }; // Batch processing complete
  }

  // Valid step names for --step option
  const validSteps = ['refine', 'research', 'plan', 'implement', 'review'] as const;

  // Validate --step option early
  if (options.step) {
    const normalizedStep = options.step.toLowerCase();
    if (!validSteps.includes(normalizedStep as any)) {
      console.log(c.error(`Error: Invalid step "${options.step}"`));
      console.log(c.dim(`Valid steps: ${validSteps.join(', ')}`));
      return { success: false };
    }
  }

  if (!kanbanExists(sdlcRoot)) {
    console.log(c.warning('ai-sdlc not initialized. Run `ai-sdlc init` first.'));
    return { success: false };
  }

  // Validate flag combinations
  try {
    validateAutoStoryOptions(options);
  } catch (error) {
    console.log(c.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
    return { success: false };
  }

  // Detect full SDLC mode: --auto combined with --story
  let isFullSDLC = !!(options.auto && options.story && !options.continue);

  // Handle --continue flag
  let workflowId: string;
  let completedActions: CompletedActionRecord[] = [];
  let storyContentHash: string | undefined;

  if (options.continue) {
    // Determine storyId for loading state
    // If --story is provided, use it; otherwise, try to infer from existing state
    let resumeStoryId: string | undefined;

    // First try: use --story flag if provided
    if (options.story) {
      resumeStoryId = options.story;
    }

    // Try to load existing state (with or without storyId)
    const existingState = await loadWorkflowState(sdlcRoot, resumeStoryId);

    if (!existingState) {
      console.log(c.error('Error: No checkpoint found.'));
      console.log(c.dim('Remove --continue flag to start a new workflow.'));
      return { success: false };
    }

    workflowId = existingState.workflowId;
    completedActions = existingState.completedActions;
    storyContentHash = existingState.context.storyContentHash;

    // Restore full SDLC mode from checkpoint if it was set
    if (existingState.context.options.fullSDLC) {
      isFullSDLC = true;
      // Also restore the story option for proper filtering
      if (existingState.context.options.story) {
        options.story = existingState.context.options.story;
        options.auto = true; // Ensure auto mode is set for continuation
      }
    }

    // Display resume information
    console.log();
    console.log(c.info('⟳ Resuming workflow from checkpoint'));
    console.log(c.dim(`  Workflow ID: ${workflowId}`));
    console.log(c.dim(`  Checkpoint: ${new Date(existingState.timestamp).toLocaleString()}`));
    console.log(c.dim(`  Completed actions: ${completedActions.length}`));

    if (isFullSDLC) {
      console.log(c.dim(`  Mode: Full SDLC (story: ${options.story})`));
    }

    // Warn if story content changed
    if (storyContentHash && completedActions.length > 0) {
      const lastAction = completedActions[completedActions.length - 1];
      const currentHash = calculateStoryHash(lastAction.storyPath);
      if (currentHash && currentHash !== storyContentHash) {
        console.log(c.warning('  ⚠ Warning: Story content changed since interruption'));
        console.log(c.dim('  Proceeding with current state...'));
      }
    }

    // Check if workflow is stale (older than 48 hours)
    const stateAge = Date.now() - new Date(existingState.timestamp).getTime();
    const MAX_STATE_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours
    if (stateAge > MAX_STATE_AGE_MS) {
      console.log(c.warning('  ⚠ Warning: Checkpoint is more than 48 hours old'));
      console.log(c.dim('  Context may be stale. Consider starting fresh.'));
    }

    console.log();
  } else {
    // Early validation of story ID format before any operations that use it
    // This prevents sanitizeStoryId from throwing before we can show a nice error
    if (options.story && !/^[a-z0-9_-]+$/i.test(options.story.toLowerCase().trim())) {
      console.log(
        c.error(
          'Invalid story ID format. Only letters, numbers, hyphens, and underscores are allowed.'
        )
      );
      return { success: false };
    }

    // Check if there's an existing state and suggest --continue
    // Check both global and story-specific state
    const hasGlobalState = hasWorkflowState(sdlcRoot);
    const hasStoryState = options.story ? hasWorkflowState(sdlcRoot, options.story) : false;

    if ((hasGlobalState || hasStoryState) && !options.dryRun) {
      console.log(c.info('Note: Found previous checkpoint. Use --continue to resume.'));
      console.log();
    }

    // Start new workflow
    workflowId = generateWorkflowId();
  }

  let assessment = await assessState(sdlcRoot);

  // Hoist targetStory to outer scope so it can be reused for worktree checks
  let targetStory: Story | null = null;

  // Filter actions by story if --story flag is provided
  if (options.story) {
    const normalizedInput = options.story.toLowerCase().trim();

    // SECURITY: Validate story ID format to prevent path traversal and injection
    // Only allow alphanumeric characters, hyphens, and underscores
    if (!/^[a-z0-9_-]+$/i.test(normalizedInput)) {
      console.log(
        c.error(
          'Invalid story ID format. Only letters, numbers, hyphens, and underscores are allowed.'
        )
      );
      return { success: false };
    }

    // Try to find story by ID first, then by slug (case-insensitive)
    targetStory = findStoryById(sdlcRoot, normalizedInput);
    if (!targetStory) {
      targetStory = findStoryBySlug(sdlcRoot, normalizedInput);
    }
    // Also try original case for slug
    if (!targetStory) {
      targetStory = findStoryBySlug(sdlcRoot, options.story.trim());
    }

    if (!targetStory) {
      console.log(c.error(`Error: Story not found: "${options.story}"`));
      console.log();
      console.log(c.dim('Searched for:'));
      console.log(c.dim(`  ID: ${normalizedInput}`));
      console.log(c.dim(`  Slug: ${normalizedInput}`));
      console.log();
      console.log(c.info('Tip: Use `ai-sdlc status` to see all available stories.'));
      return { success: false };
    }

    // Full SDLC mode: Generate complete phase sequence for the story
    if (isFullSDLC) {
      console.log();
      console.log(c.bold(`🚀 Starting full SDLC for story: ${targetStory.frontmatter.title}`));
      console.log(c.dim(`  ID: ${targetStory.frontmatter.id}`));
      console.log(c.dim(`  Status: ${targetStory.frontmatter.status}`));

      const fullSDLCActions = generateFullSDLCActions(targetStory, c);
      const totalPhases = 5; // refine, research, plan, implement, review
      const phasesToExecute = fullSDLCActions.length;

      console.log(c.dim(`  Phases to execute: ${phasesToExecute}/${totalPhases}`));
      console.log();

      if (fullSDLCActions.length === 0) {
        console.log(c.success('✓ All SDLC phases already completed!'));
        console.log(c.dim('Story has completed: refine, research, plan, implement, and review.'));
        return { success: true };
      }

      // Replace assessment actions with full SDLC sequence
      assessment.recommendedActions = fullSDLCActions;
    } else {
      // Normal --story mode: Filter existing recommended actions
      const originalCount = assessment.recommendedActions.length;
      assessment.recommendedActions = assessment.recommendedActions.filter(
        action => action.storyPath === targetStory!.path
      );

      console.log(c.info(`Targeting story: ${targetStory.frontmatter.title}`));
      console.log(c.dim(`  ID: ${targetStory.frontmatter.id}`));
      console.log(c.dim(`  Status: ${targetStory.frontmatter.status}`));
      console.log(c.dim(`  Actions: ${assessment.recommendedActions.length} of ${originalCount} total`));
      console.log();
    }
  }

  // Filter actions by step type if --step flag is provided
  if (options.step) {
    const normalizedStep = options.step.toLowerCase();
    const originalCount = assessment.recommendedActions.length;

    assessment.recommendedActions = assessment.recommendedActions.filter(
      action => action.type === normalizedStep
    );

    if (assessment.recommendedActions.length < originalCount) {
      console.log(c.dim(`Filtered to "${options.step}" step: ${assessment.recommendedActions.length} actions`));
      console.log();
    }
  }

  if (assessment.recommendedActions.length === 0) {
    if (options.story || options.step) {
      const filterDesc = [
        options.story ? `story "${options.story}"` : null,
        options.step ? `step "${options.step}"` : null,
      ].filter(Boolean).join(' and ');
      console.log(c.info(`No pending actions for ${filterDesc}.`));
      console.log(c.dim('The specified work may already be complete.'));
    } else {
      console.log(c.success('No pending actions. Board is up to date!'));
    }

    // Clear state if workflow is complete
    if (options.continue || hasWorkflowState(sdlcRoot)) {
      // Using options.story - action not yet created in early exit path
      await clearWorkflowState(sdlcRoot, options.story);
      console.log(c.dim('Checkpoint cleared.'));
    }

    return { success: true };
  }

  if (options.dryRun) {
    console.log(c.info('Dry run - would execute:'));
    for (const action of assessment.recommendedActions) {
      console.log(`  ${formatAction(action)}`);
      if (!options.auto) break;
    }
    return { success: true };
  }

  // Filter out completed actions if resuming
  let actionsToProcess = options.auto
    ? assessment.recommendedActions
    : [assessment.recommendedActions[0]];

  if (options.continue && completedActions.length > 0) {
    const completedActionKeys = new Set(
      completedActions.map(a => `${a.type}:${a.storyPath}`)
    );

    const skippedActions: Action[] = [];
    const remainingActions: Action[] = [];

    for (const action of actionsToProcess) {
      const actionKey = `${action.type}:${action.storyPath}`;
      if (completedActionKeys.has(actionKey)) {
        skippedActions.push(action);
      } else {
        remainingActions.push(action);
      }
    }

    if (skippedActions.length > 0) {
      console.log(c.dim('⊘ Skipping completed actions:'));
      for (const action of skippedActions) {
        console.log(c.dim(`  ✓ ${formatAction(action)}`));
      }
      console.log();
    }

    actionsToProcess = remainingActions;

    if (actionsToProcess.length === 0) {
      console.log(c.success('All actions from checkpoint already completed!'));
      // Using options.story - action not yet created in early exit path
      await clearWorkflowState(sdlcRoot, options.story);
      console.log(c.dim('Checkpoint cleared.'));
      return { success: true };
    }
  }

  // Handle worktree creation based on flags, config, and story frontmatter
  // IMPORTANT: This must happen BEFORE git validation because:
  // 1. Worktree mode allows running from protected branches (main/master)
  // 2. The worktree will be created on a feature branch
  const worktreeResult = await setupWorktree(options, config, c, sdlcRoot, targetStory);
  if (!worktreeResult.success) {
    return { success: false };
  }

  let worktreePath = worktreeResult.worktreePath;
  let originalCwd = worktreeResult.originalCwd;
  let worktreeCreated = worktreeResult.worktreeCreated;
  if (worktreeResult.targetStory) {
    targetStory = worktreeResult.targetStory;
  }

  // Done with worktree setup - worktreePath, originalCwd, and worktreeCreated are now set

  // Validate git state before processing actions that modify git
  // Skip protected branch check if worktree mode is active (worktree is on feature branch)
  // Skip clean check entirely when worktree was just created:
  // - The worktree starts from a clean base branch
  // - npm install may modify package-lock.json
  // - Story file was just updated with worktree_path
  // - There's no prior user work to protect in a fresh worktree
  if (!options.force && requiresGitValidation(actionsToProcess)) {
    const workingDir = path.dirname(sdlcRoot);
    const gitValidationOptions = worktreeCreated
      ? { skipBranchCheck: true, skipCleanCheck: true }
      : {};
    const gitValidation = validateGitState(workingDir, gitValidationOptions);

    if (!gitValidation.valid) {
      displayGitValidationResult(gitValidation, c);
      if (worktreeCreated && originalCwd) {
        process.chdir(originalCwd);
      }
      return { success: false };
    }

    if (gitValidation.warnings.length > 0) {
      displayGitValidationResult(gitValidation, c);
      console.log();
    }
  }

  // Process actions with retry support for Full SDLC mode
  let currentActions = [...actionsToProcess];
  let currentActionIndex = 0;
  let retryAttempt = 0;
  const MAX_DISPLAY_RETRIES = 3; // For display purposes

  try {
    while (currentActionIndex < currentActions.length) {
      const action = currentActions[currentActionIndex];
      const totalActions = currentActions.length;

      // Enhanced progress indicator for full SDLC mode
      if (isFullSDLC && totalActions > 1) {
        const retryIndicator = retryAttempt > 0 ? ` (retry ${retryAttempt})` : '';
        console.log(c.info(`\n═══ Phase ${currentActionIndex + 1}/${totalActions}: ${action.type.toUpperCase()}${retryIndicator} ═══`));
      }

      const actionResult = await executeAction(action, sdlcRoot);

      // Handle action failure in full SDLC mode
      if (!actionResult.success && isFullSDLC) {
        console.log();
        console.log(c.error(`✗ Phase ${action.type} failed`));
        console.log(c.dim(`Completed ${currentActionIndex} of ${totalActions} phases`));
        console.log(c.info('Fix the error above and use --continue to resume.'));
        return { success: false };
      }

      // Handle review rejection in Full SDLC mode - trigger retry loop
      if (isFullSDLC && action.type === 'review' && actionResult.reviewResult) {
        const reviewResult = actionResult.reviewResult;

        if (reviewResult.decision === ReviewDecision.REJECTED) {
          // Load fresh story state and config for retry check
          const story = parseStory(action.storyPath);
          const config = loadConfig();

          // Check if we're at max retries (pass CLI override if provided)
          if (isAtMaxRetries(story, config, maxIterationsOverride)) {
            console.log();
            console.log(c.error('═'.repeat(50)));
            console.log(c.error(`✗ Review failed - maximum retries reached`));
            console.log(c.error('═'.repeat(50)));
            console.log(c.dim(`Story has reached the maximum retry limit.`));
            console.log(c.dim(`Issues found: ${reviewResult.issues.length}`));
            console.log(c.warning('Manual intervention required to address the review feedback.'));
            console.log(c.info('You can:'));
            console.log(c.dim('  1. Fix issues manually and run again'));
            console.log(c.dim('  2. Reset retry count in the story frontmatter'));
            // Using action.storyId - available from action loop context
            await clearWorkflowState(sdlcRoot, action.storyId);
            return { success: false };
          }

          // We can retry - reset RPIV cycle and loop back
          const currentRetry = (story.frontmatter.retry_count || 0) + 1;
          // Use CLI override, then story-specific, then config default
          const effectiveMaxRetries = maxIterationsOverride !== undefined
            ? maxIterationsOverride
            : (story.frontmatter.max_retries ?? config.reviewConfig?.maxRetries ?? Infinity);
          const maxRetriesDisplay = Number.isFinite(effectiveMaxRetries) ? effectiveMaxRetries : '∞';

          console.log();
          console.log(c.warning(`⟳ Review rejected with ${reviewResult.issues.length} issue(s) - initiating rework (attempt ${currentRetry}/${maxRetriesDisplay})`));

          // Display executive summary
          const summary = generateReviewSummary(reviewResult.issues, getTerminalWidth());
          console.log(c.dim(`  Summary: ${summary}`));

          // Reset the RPIV cycle (this increments retry_count and resets flags)
          await resetRPIVCycle(story, reviewResult.feedback);

          // Log what's being reset
          console.log(c.dim(`  → Reset plan_complete, implementation_complete, reviews_complete`));
          console.log(c.dim(`  → Retry count: ${currentRetry}/${maxRetriesDisplay}`));

          // Regenerate actions starting from the phase that needs rework
          // For now, we restart from 'plan' since that's the typical flow after research
          const freshStory = parseStory(action.storyPath);
          const newActions = generateFullSDLCActions(freshStory, c);

          if (newActions.length > 0) {
            // Replace remaining actions with the new sequence
            currentActions = newActions;
            currentActionIndex = 0;
            retryAttempt++;

            console.log(c.info(`  → Restarting SDLC from ${newActions[0].type} phase`));
            console.log();
            continue; // Restart the loop with new actions
          } else {
            // No actions to retry (shouldn't happen but handle gracefully)
            console.log(c.error('Error: No actions generated for retry. Manual intervention required.'));
            return { success: false };
          }
        } else if (reviewResult.decision === ReviewDecision.RECOVERY) {
          // Implementation recovery: reset implementation_complete and increment implementation retry count
          // This is distinct from REJECTED which resets the entire RPIV cycle
          const story = parseStory(action.storyPath);
          const config = loadConfig();
          const retryCount = story.frontmatter.implementation_retry_count || 0;
          const maxRetries = getEffectiveMaxImplementationRetries(story, config);
          const maxRetriesDisplay = Number.isFinite(maxRetries) ? maxRetries : '∞';

          console.log();
          console.log(c.warning(`🔄 Implementation recovery triggered (attempt ${retryCount + 1}/${maxRetriesDisplay})`));
          console.log(c.dim(`  Reason: ${story.frontmatter.last_restart_reason || 'No source code changes detected'}`));

          // Increment implementation retry count
          await incrementImplementationRetryCount(story);

          // Check if we've exceeded max implementation retries after incrementing
          const freshStory = parseStory(action.storyPath);
          if (isAtMaxImplementationRetries(freshStory, config)) {
            console.log();
            console.log(c.error('═'.repeat(50)));
            console.log(c.error(`✗ Implementation recovery failed - maximum retries reached`));
            console.log(c.error('═'.repeat(50)));
            console.log(c.dim(`Story has reached the maximum implementation retry limit (${maxRetries}).`));
            console.log(c.warning('Marking story as blocked. Manual intervention required.'));

            // Mark story as blocked
            await updateStoryStatus(freshStory, 'blocked');

            console.log(c.info('Story status updated to: blocked'));
            await clearWorkflowState(sdlcRoot, action.storyId);
            process.exit(1);
          }

          // Regenerate actions to restart from implementation phase
          const newActions = generateFullSDLCActions(freshStory, c);

          if (newActions.length > 0) {
            currentActions = newActions;
            currentActionIndex = 0;
            console.log(c.info(`  → Restarting from ${newActions[0].type} phase`));
            console.log();
            continue; // Restart the loop with new actions
          } else {
            console.log(c.error('Error: No actions generated for recovery. Manual intervention required.'));
            process.exit(1);
          }
        } else if (reviewResult.decision === ReviewDecision.FAILED) {
          // Review agent failed - don't increment retry count
          console.log();
          console.log(c.error(`✗ Review process failed: ${reviewResult.error || 'Unknown error'}`));
          console.log(c.warning('This does not count as a retry attempt. You can retry manually.'));
          await clearWorkflowState(sdlcRoot, action.storyId);
          process.exit(1);
        }
      }

      // Save checkpoint after successful action
      if (actionResult.success) {
        completedActions.push({
          type: action.type,
          storyId: action.storyId,
          storyPath: action.storyPath,
          completedAt: new Date().toISOString(),
        });

        const state: WorkflowExecutionState = {
          version: '1.0',
          workflowId,
          timestamp: new Date().toISOString(),
          currentAction: null,
          completedActions,
          context: {
            sdlcRoot,
            options: {
              auto: options.auto,
              dryRun: options.dryRun,
              story: options.story,
              fullSDLC: isFullSDLC,
            },
            storyContentHash: calculateStoryHash(action.storyPath),
          },
        };

        await saveWorkflowState(state, sdlcRoot, action.storyId);
        console.log(c.dim(`  ✓ Progress saved (${completedActions.length} actions completed)`));
      }

      currentActionIndex++;

      // Re-assess after each action in auto mode
      if (options.auto) {
        // For full SDLC mode, check if all phases are complete (and review passed)
        if (isFullSDLC) {
          // Check if we've completed all actions in our sequence
          if (currentActionIndex >= currentActions.length) {
            // Verify the review actually passed (reviews_complete should be true)
            const finalStory = parseStory(action.storyPath);
            if (finalStory.frontmatter.reviews_complete) {
              console.log();
              console.log(c.success('═'.repeat(50)));
              console.log(c.success(`✓ Full SDLC completed successfully!`));
              console.log(c.success('═'.repeat(50)));
              console.log(c.dim(`Completed phases: ${currentActions.length}`));
              if (retryAttempt > 0) {
                console.log(c.dim(`Retry attempts: ${retryAttempt}`));
              }
              console.log(c.dim(`Story is now ready for PR creation.`));
              // Using action.storyId - available from action loop context
              await clearWorkflowState(sdlcRoot, action.storyId);
              console.log(c.dim('Checkpoint cleared.'));
            } else {
              // This shouldn't happen if our logic is correct, but handle it
              console.log();
              console.log(c.warning('All phases executed but reviews_complete is false.'));
              console.log(c.dim('This may indicate an issue with the review process.'));
            }
            break;
          }
        } else {
          // Normal auto mode: re-assess state
          const newAssessment = await assessState(sdlcRoot);
          if (newAssessment.recommendedActions.length === 0) {
            console.log(c.success('\n✓ All actions completed!'));
            // Using action.storyId - available from action loop context
            await clearWorkflowState(sdlcRoot, action.storyId);
            console.log(c.dim('Checkpoint cleared.'));
            break;
          }
        }
      }
    }
  } finally {
    // Restore original working directory if worktree was used
    if (originalCwd) {
      process.chdir(originalCwd);
    }
  }

  return { success: true };
}
