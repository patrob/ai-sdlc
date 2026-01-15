import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import * as readline from 'readline';
import { getSdlcRoot, loadConfig, initConfig, validateWorktreeBasePath, DEFAULT_WORKTREE_CONFIG } from '../core/config.js';
import { initializeKanban, kanbanExists, assessState, getBoardStats, findStoryBySlug } from '../core/kanban.js';
import { createStory, parseStory, resetRPIVCycle, isAtMaxRetries, unblockStory, getStory, findStoryById, updateStoryField, writeStory } from '../core/story.js';
import { GitWorktreeService } from '../core/worktree.js';
import { Story, Action, ActionType, KanbanFolder, WorkflowExecutionState, CompletedActionRecord, ReviewResult, ReviewDecision, ReworkContext, WorktreeInfo } from '../types/index.js';
import { getThemedChalk } from '../core/theme.js';
import {
  saveWorkflowState,
  loadWorkflowState,
  clearWorkflowState,
  generateWorkflowId,
  calculateStoryHash,
  hasWorkflowState,
} from '../core/workflow-state.js';
import { renderStories, renderKanbanBoard, shouldUseKanbanLayout, KanbanColumn } from './table-renderer.js';
import { getStoryFlags as getStoryFlagsUtil, formatStatus as formatStatusUtil } from './story-utils.js';
import { migrateToFolderPerStory } from './commands/migrate.js';
import { generateReviewSummary } from '../agents/review.js';
import { getTerminalWidth } from './formatting.js';
import { validateGitState, GitValidationResult } from '../core/git-utils.js';

/**
 * Initialize the .ai-sdlc folder structure
 */
export async function init(): Promise<void> {
  const spinner = ora('Initializing ai-sdlc...').start();

  try {
    const config = initConfig();
    const sdlcRoot = getSdlcRoot();
    const c = getThemedChalk(config);

    if (kanbanExists(sdlcRoot)) {
      spinner.info('ai-sdlc already initialized');
      return;
    }

    initializeKanban(sdlcRoot);

    spinner.succeed(c.success('Initialized .ai-sdlc/'));
    console.log(c.dim('  └── stories/'));
    console.log();
    console.log(c.info('Get started:'));
    console.log(c.dim(`  ai-sdlc add "Your first story"`));
  } catch (error) {
    spinner.fail('Failed to initialize');
    console.error(error);
    process.exit(1);
  }
}

/**
 * Show current board state
 */
export async function status(options?: { active?: boolean }): Promise<void> {
  const config = loadConfig();
  const sdlcRoot = getSdlcRoot();
  const c = getThemedChalk(config);

  if (!kanbanExists(sdlcRoot)) {
    console.log(c.warning('ai-sdlc not initialized. Run `ai-sdlc init` first.'));
    return;
  }

  const assessment = assessState(sdlcRoot);
  const stats = getBoardStats(sdlcRoot);

  console.log();
  console.log(c.bold('═══ AI SDLC Board ═══'));
  console.log();

  // Define columns with their data
  const columnDefs: { name: string; folder: KanbanFolder; color: any }[] = [
    { name: 'BACKLOG', folder: 'backlog', color: c.backlog },
    { name: 'READY', folder: 'ready', color: c.ready },
    { name: 'IN-PROGRESS', folder: 'in-progress', color: c.inProgress },
    { name: 'DONE', folder: 'done', color: c.done },
  ];

  // Filter columns if --active flag is set
  let displayColumns = columnDefs;
  let doneCount = 0;

  if (options?.active) {
    doneCount = stats['done'];
    displayColumns = columnDefs.filter(col => col.folder !== 'done');
  }

  // Check if we should use kanban layout
  if (shouldUseKanbanLayout()) {
    // Prepare kanban columns with stories
    const kanbanColumns: KanbanColumn[] = displayColumns.map(col => {
      const stories = col.folder === 'backlog' ? assessment.backlogItems
        : col.folder === 'ready' ? assessment.readyItems
        : col.folder === 'in-progress' ? assessment.inProgressItems
        : assessment.doneItems;

      return {
        name: col.name,
        stories,
        color: col.color,
      };
    });

    // Render kanban board
    console.log(renderKanbanBoard(kanbanColumns, c));
    console.log();
  } else {
    // Fall back to vertical layout for narrow terminals
    for (const col of displayColumns) {
      const count = stats[col.folder];
      console.log(c.bold(col.color(`${col.name} (${count})`)));

      const stories = col.folder === 'backlog' ? assessment.backlogItems
        : col.folder === 'ready' ? assessment.readyItems
        : col.folder === 'in-progress' ? assessment.inProgressItems
        : assessment.doneItems;

      // Use existing table/compact renderer
      console.log(renderStories(stories, c));
      console.log();
    }
  }

  // Show summary line when done is filtered and there are done stories
  if (options?.active && doneCount > 0) {
    console.log(c.dim(`${doneCount} done stories (use 'status' without --active to show all)`));
    console.log();
  }

  // Show recommended next action
  if (assessment.recommendedActions.length > 0) {
    const nextAction = assessment.recommendedActions[0];
    console.log(c.info('Recommended:'), formatAction(nextAction));
  } else {
    console.log(c.success('No pending actions. Board is up to date!'));
  }
}

/**
 * Add a new story to the backlog
 */
export async function add(title: string): Promise<void> {
  const spinner = ora('Creating story...').start();

  try {
    const config = loadConfig();
    const sdlcRoot = getSdlcRoot();
    const c = getThemedChalk(config);

    if (!kanbanExists(sdlcRoot)) {
      spinner.fail('ai-sdlc not initialized. Run `ai-sdlc init` first.');
      return;
    }

    const story = createStory(title, sdlcRoot);

    spinner.succeed(c.success(`Created: ${story.path}`));
    console.log(c.dim(`  ID: ${story.frontmatter.id}`));
    console.log(c.dim(`  Slug: ${story.slug}`));
    console.log();
    console.log(c.info('Next step:'), `ai-sdlc run`);
  } catch (error) {
    spinner.fail('Failed to create story');
    console.error(error);
    process.exit(1);
  }
}

/**
 * Validates flag combinations for --auto --story --step conflicts
 * @throws Error if conflicting flags are detected
 */
function validateAutoStoryOptions(options: { auto?: boolean; story?: string; step?: string }): void {
  if (options.auto && options.story && options.step) {
    throw new Error(
      'Cannot combine --auto --story with --step flag.\n' +
      'Use either:\n' +
      '  - ai-sdlc run --auto --story <id> (full SDLC)\n' +
      '  - ai-sdlc run --story <id> --step <phase> (single phase)'
    );
  }
}

/**
 * Determines if a specific phase should be executed based on story state
 * @param story The story to check
 * @param phase The phase to evaluate
 * @returns true if the phase should be executed, false if it should be skipped
 */
function shouldExecutePhase(story: Story, phase: ActionType): boolean {
  switch (phase) {
    case 'refine':
      // Execute refine if story is in backlog
      return story.frontmatter.status === 'backlog';
    case 'research':
      return !story.frontmatter.research_complete;
    case 'plan':
      return !story.frontmatter.plan_complete;
    case 'implement':
      return !story.frontmatter.implementation_complete;
    case 'review':
      return !story.frontmatter.reviews_complete;
    default:
      return false;
  }
}

/**
 * Generates the complete SDLC action sequence for a story
 * @param story The target story
 * @param c Themed chalk instance for logging (optional)
 * @returns Array of actions to execute in sequence
 */
function generateFullSDLCActions(story: Story, c?: any): Action[] {
  const allPhases: ActionType[] = ['refine', 'research', 'plan', 'implement', 'review'];
  const actions: Action[] = [];
  const skippedPhases: string[] = [];

  for (const phase of allPhases) {
    if (shouldExecutePhase(story, phase)) {
      actions.push({
        type: phase,
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Full SDLC: ${phase} phase`,
        priority: 0,
      });
    } else {
      skippedPhases.push(phase);
    }
  }

  // Log skipped phases if chalk is provided
  if (c && skippedPhases.length > 0) {
    console.log(c.dim(`  Skipping completed phases: ${skippedPhases.join(', ')}`));
  }

  return actions;
}

/**
 * Actions that modify git and require validation
 */
const GIT_MODIFYING_ACTIONS: ActionType[] = ['implement', 'review', 'create_pr'];

/**
 * Check if any actions in the list require git validation
 */
function requiresGitValidation(actions: Action[]): boolean {
  return actions.some(action => GIT_MODIFYING_ACTIONS.includes(action.type));
}

/**
 * Determine if worktree mode should be used based on CLI flags, story frontmatter, and config.
 * Priority order:
 * 1. CLI --no-worktree flag (explicit disable)
 * 2. CLI --worktree flag (explicit enable)
 * 3. Story frontmatter.worktree_path exists (auto-enable for resuming)
 * 4. Config worktree.enabled (default behavior)
 */
export function determineWorktreeMode(
  options: { worktree?: boolean },
  worktreeConfig: { enabled: boolean },
  targetStory: Story | null
): boolean {
  if (options.worktree === false) return false;
  if (options.worktree === true) return true;
  if (targetStory?.frontmatter.worktree_path) return true;
  return worktreeConfig.enabled;
}

/**
 * Display git validation errors and warnings
 */
function displayGitValidationResult(result: GitValidationResult, c: any): void {
  if (result.errors.length > 0) {
    console.log();
    console.log(c.error('Git validation failed:'));
    for (const error of result.errors) {
      console.log(c.error(`  - ${error}`));
    }
    console.log();
    console.log(c.info('To override this check, use --force (at your own risk)'));
  }

  if (result.warnings.length > 0) {
    console.log();
    console.log(c.warning('Git validation warnings:'));
    for (const warning of result.warnings) {
      console.log(c.warning(`  - ${warning}`));
    }
  }
}

/**
 * Run the workflow (process one action or all)
 */
export async function run(options: { auto?: boolean; dryRun?: boolean; continue?: boolean; story?: string; step?: string; maxIterations?: string; watch?: boolean; force?: boolean; worktree?: boolean }): Promise<void> {
  const config = loadConfig();
  // Parse maxIterations from CLI (undefined means use config default which is Infinity)
  const maxIterationsOverride = options.maxIterations !== undefined
    ? parseInt(options.maxIterations, 10)
    : undefined;
  let sdlcRoot = getSdlcRoot();
  const c = getThemedChalk(config);

  // Migrate global workflow state to story-specific location if needed
  // Only run when NOT continuing (to avoid interrupting resumed workflows)
  if (!options.continue) {
    const { migrateGlobalWorkflowState } = await import('../core/workflow-state.js');
    const migrationResult = await migrateGlobalWorkflowState(sdlcRoot);
    if (migrationResult.migrated) {
      console.log(c.info(migrationResult.message));
    }
  }

  // Handle daemon/watch mode
  if (options.watch) {
    console.log(c.info('🚀 Starting daemon mode...'));
    const { startDaemon } = await import('./daemon.js');
    await startDaemon({ maxIterations: maxIterationsOverride });
    return; // Daemon runs indefinitely
  }

  // Valid step names for --step option
  const validSteps = ['refine', 'research', 'plan', 'implement', 'review'] as const;

  // Validate --step option early
  if (options.step) {
    const normalizedStep = options.step.toLowerCase();
    if (!validSteps.includes(normalizedStep as any)) {
      console.log(c.error(`Error: Invalid step "${options.step}"`));
      console.log(c.dim(`Valid steps: ${validSteps.join(', ')}`));
      return;
    }
  }

  if (!kanbanExists(sdlcRoot)) {
    console.log(c.warning('ai-sdlc not initialized. Run `ai-sdlc init` first.'));
    return;
  }

  // Validate flag combinations
  try {
    validateAutoStoryOptions(options);
  } catch (error) {
    console.log(c.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
    return;
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
      return;
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
      return;
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

  let assessment = assessState(sdlcRoot);

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
      return;
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
      return;
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
        return;
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

    return;
  }

  if (options.dryRun) {
    console.log(c.info('Dry run - would execute:'));
    for (const action of assessment.recommendedActions) {
      console.log(`  ${formatAction(action)}`);
      if (!options.auto) break;
    }
    return;
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
      return;
    }
  }

  // Handle worktree creation based on flags, config, and story frontmatter
  // IMPORTANT: This must happen BEFORE git validation because:
  // 1. Worktree mode allows running from protected branches (main/master)
  // 2. The worktree will be created on a feature branch
  let worktreePath: string | undefined;
  let originalCwd: string | undefined;
  let worktreeCreated = false;

  // Determine if worktree should be used
  // Priority: CLI flags > story frontmatter > config > default (disabled)
  const worktreeConfig = config.worktree ?? DEFAULT_WORKTREE_CONFIG;

  // Reuse targetStory from earlier lookup (DRY - avoids duplicate story lookup)
  const shouldUseWorktree = determineWorktreeMode(options, worktreeConfig, targetStory);

  // Validate that worktree mode requires --story
  if (shouldUseWorktree && !options.story) {
    if (options.worktree === true) {
      console.log(c.error('Error: --worktree requires --story flag'));
      return;
    }
  }

  if (shouldUseWorktree && options.story && targetStory) {
    const workingDir = path.dirname(sdlcRoot);

    // Resolve worktree base path from config
    let resolvedBasePath: string;
    try {
      resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
    } catch (error) {
      console.log(c.error(`Configuration Error: ${error instanceof Error ? error.message : String(error)}`));
      console.log(c.dim('Fix worktree.basePath in .ai-sdlc.json or remove it to use default location'));
      return;
    }

    const worktreeService = new GitWorktreeService(workingDir, resolvedBasePath);

    // Validate git state for worktree creation
    const validation = worktreeService.validateCanCreateWorktree();
    if (!validation.valid) {
      console.log(c.error(`Error: ${validation.error}`));
      return;
    }

    try {
      // Detect base branch
      const baseBranch = worktreeService.detectBaseBranch();

      // Create worktree
      originalCwd = process.cwd();
      worktreePath = worktreeService.create({
        storyId: targetStory.frontmatter.id,
        slug: targetStory.slug,
        baseBranch,
      });

      // Update story frontmatter with worktree path
      const updatedStory = updateStoryField(targetStory, 'worktree_path', worktreePath);
      await writeStory(updatedStory);

      // Change to worktree directory
      process.chdir(worktreePath);

      // Recalculate sdlcRoot for the worktree context
      sdlcRoot = getSdlcRoot();
      worktreeCreated = true;

      console.log(c.success(`✓ Created worktree at: ${worktreePath}`));
      console.log(c.dim(`  Branch: ai-sdlc/${targetStory.frontmatter.id}-${targetStory.slug}`));
      console.log();
    } catch (error) {
      // Restore directory on worktree creation failure
      if (originalCwd) {
        process.chdir(originalCwd);
      }
      console.log(c.error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`));
      return;
    }
  }

  // Validate git state before processing actions that modify git
  // Skip protected branch check if worktree mode is active (worktree is on feature branch)
  if (!options.force && requiresGitValidation(actionsToProcess)) {
    const workingDir = path.dirname(sdlcRoot);
    const gitValidationOptions = worktreeCreated ? { skipBranchCheck: true } : {};
    const gitValidation = validateGitState(workingDir, gitValidationOptions);

    if (!gitValidation.valid) {
      displayGitValidationResult(gitValidation, c);
      if (worktreeCreated && originalCwd) {
        process.chdir(originalCwd);
      }
      return;
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
      return;
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
          return;
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
        resetRPIVCycle(story, reviewResult.feedback);

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
          return;
        }
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
        const newAssessment = assessState(sdlcRoot);
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
}

// resolveStoryPath() has been removed - use getStory() instead (centralized lookup)

/**
 * Result from executing an action
 */
interface ActionExecutionResult {
  success: boolean;
  reviewResult?: ReviewResult;  // Present when action.type === 'review'
}

/**
 * Execute a specific action
 *
 * @returns ActionExecutionResult with success status and optional review result
 */
async function executeAction(action: Action, sdlcRoot: string): Promise<ActionExecutionResult> {
  const config = loadConfig();
  const c = getThemedChalk(config);

  // Resolve story by ID to get current path (handles moves between folders)
  let resolvedPath: string;
  try {
    const story = getStory(sdlcRoot, action.storyId);
    resolvedPath = story.path;
  } catch (error) {
    console.log(c.error(`Error: Story not found for action "${action.type}"`));
    console.log(c.dim(`  Story ID: ${action.storyId}`));
    console.log(c.dim(`  Original path: ${action.storyPath}`));
    if (error instanceof Error) {
      console.log(c.dim(`  ${error.message}`));
    }
    return { success: false };
  }

  // Update action path if it was stale
  if (resolvedPath !== action.storyPath) {
    console.log(c.warning(`Note: Story path updated (file was moved)`));
    console.log(c.dim(`  From: ${action.storyPath}`));
    console.log(c.dim(`  To: ${resolvedPath}`));
    action.storyPath = resolvedPath;
  }

  // Store phase completion state BEFORE action execution (to detect transitions)
  const storyBeforeAction = parseStory(action.storyPath);
  const prevPhaseState = {
    research_complete: storyBeforeAction.frontmatter.research_complete,
    plan_complete: storyBeforeAction.frontmatter.plan_complete,
    implementation_complete: storyBeforeAction.frontmatter.implementation_complete,
    reviews_complete: storyBeforeAction.frontmatter.reviews_complete,
    status: storyBeforeAction.frontmatter.status,
  };

  const spinner = ora(formatAction(action, true, c)).start();
  const baseText = formatAction(action, true, c);

  // Create agent progress callback for real-time updates
  const onAgentProgress = (event: { type: string; toolName?: string; sessionId?: string }) => {
    switch (event.type) {
      case 'session_start':
        spinner.text = `${baseText} ${c.dim('(session started)')}`;
        break;
      case 'tool_start':
        // Show which tool is being executed
        const toolName = event.toolName || 'unknown';
        const shortName = toolName.replace(/^(mcp__|Mcp)/, '').substring(0, 30);
        spinner.text = `${baseText} ${c.dim(`→ ${shortName}`)}`;
        break;
      case 'tool_end':
        // Keep showing the action, tool completed
        spinner.text = baseText;
        break;
      case 'completion':
        spinner.text = `${baseText} ${c.dim('(completing...)')}`;
        break;
    }
  };

  try {
    // Import and run the appropriate agent
    let result;

    switch (action.type) {
      case 'refine':
        const { runRefinementAgent } = await import('../agents/refinement.js');
        result = await runRefinementAgent(action.storyPath, sdlcRoot, { onProgress: onAgentProgress });
        break;

      case 'research':
        const { runResearchAgent } = await import('../agents/research.js');
        result = await runResearchAgent(action.storyPath, sdlcRoot, { onProgress: onAgentProgress });
        break;

      case 'plan':
        const { runPlanningAgent } = await import('../agents/planning.js');
        result = await runPlanningAgent(action.storyPath, sdlcRoot, { onProgress: onAgentProgress });
        break;

      case 'implement':
        const { runImplementationAgent } = await import('../agents/implementation.js');
        result = await runImplementationAgent(action.storyPath, sdlcRoot, { onProgress: onAgentProgress });
        break;

      case 'review':
        const { runReviewAgent } = await import('../agents/review.js');
        result = await runReviewAgent(action.storyPath, sdlcRoot, {
          onVerificationProgress: (phase, status, message) => {
            const phaseLabel = phase === 'build' ? 'Building' : 'Testing';
            switch (status) {
              case 'starting':
                spinner.text = c.dim(`${phaseLabel}: ${message || ''}`);
                break;
              case 'running':
                // Keep spinner spinning, optionally could show last line of output
                break;
              case 'passed':
                spinner.text = c.success(`${phaseLabel}: passed`);
                break;
              case 'failed':
                spinner.text = c.error(`${phaseLabel}: failed`);
                break;
            }
          },
        });
        break;

      case 'rework':
        const { runReworkAgent } = await import('../agents/rework.js');
        if (!action.context) {
          throw new Error('Rework action requires context with review feedback');
        }
        result = await runReworkAgent(action.storyPath, sdlcRoot, action.context as ReworkContext);
        break;

      case 'create_pr':
        const { createPullRequest } = await import('../agents/review.js');
        result = await createPullRequest(action.storyPath, sdlcRoot);
        break;

      case 'move_to_done':
        // Update story status to done (no file move in new architecture)
        const { updateStoryStatus } = await import('../core/story.js');
        const storyToMove = parseStory(action.storyPath);
        const updatedStory = updateStoryStatus(storyToMove, 'done');
        result = {
          success: true,
          story: updatedStory,
          changesMade: ['Updated story status to done'],
        };

        // Worktree cleanup prompt (if story has a worktree)
        if (storyToMove.frontmatter.worktree_path) {
          await handleWorktreeCleanup(storyToMove, config, c);
        }
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }

    // Check if agent succeeded
    if (result && !result.success) {
      spinner.fail(c.error(`Failed: ${formatAction(action, true, c)}`));
      if (result.error) {
        console.error(c.error(`  Error: ${result.error}`));
      }
      return { success: false };
    }

    spinner.succeed(c.success(formatAction(action, true, c)));

    // Show changes made
    if (result && result.changesMade.length > 0) {
      for (const change of result.changesMade) {
        console.log(c.dim(`  → ${change}`));
      }
    }

    // Display phase progress after successful action
    if (result && result.success) {
      // Use the story from result if available (handles moved files like refine)
      const story = result.story || parseStory(action.storyPath);
      const progress = calculatePhaseProgress(story);

      // Show phase checklist
      console.log(c.dim(`  Progress: ${renderPhaseChecklist(story, c)}`));

      // Check if a phase just completed (detect transition from false → true)
      const phaseInfo = getPhaseInfo(action.type, c);
      if (phaseInfo) {
        let phaseJustCompleted = false;
        switch (action.type) {
          case 'refine':
            // Refine completes when status changes from backlog to something else
            phaseJustCompleted = prevPhaseState.status === 'backlog' && story.frontmatter.status !== 'backlog';
            break;
          case 'research':
            // Research completes when research_complete transitions from false to true
            phaseJustCompleted = !prevPhaseState.research_complete && story.frontmatter.research_complete;
            break;
          case 'plan':
            // Plan completes when plan_complete transitions from false to true
            phaseJustCompleted = !prevPhaseState.plan_complete && story.frontmatter.plan_complete;
            break;
          case 'implement':
            // Implement completes when implementation_complete transitions from false to true
            phaseJustCompleted = !prevPhaseState.implementation_complete && story.frontmatter.implementation_complete;
            break;
          case 'review':
            // Review completes when reviews_complete transitions from false to true
            phaseJustCompleted = !prevPhaseState.reviews_complete && story.frontmatter.reviews_complete;
            break;
          case 'rework':
            // Rework doesn't have a specific completion flag
            phaseJustCompleted = false;
            break;
        }

        // Only show completion message if phase transitioned to complete
        if (phaseJustCompleted) {
          const useAscii = process.env.NO_COLOR !== undefined;
          const completionSymbol = useAscii ? '[X]' : '✓';
          console.log(c.phaseComplete(`  ${completionSymbol} ${phaseInfo.name} phase complete`));
        }
      }
    }

    // Return review result for review actions
    if (action.type === 'review' && result) {
      return { success: true, reviewResult: result as ReviewResult };
    }

    return { success: true };
  } catch (error) {
    spinner.fail(c.error(`Failed: ${formatAction(action, true, c)}`));
    console.error(error);

    // Show phase checklist with error indication (if file still exists)
    try {
      const story = parseStory(action.storyPath);
      console.log(c.dim(`  Progress: ${renderPhaseChecklist(story, c)}`));
      // Update story with error
      story.frontmatter.last_error = error instanceof Error ? error.message : String(error);
    } catch {
      // File may have been moved - skip progress display
    }
    // Don't throw - let the workflow continue if in auto mode
    return { success: false };
  }
}

/**
 * Phase information for RPIV display
 */
export interface PhaseInfo {
  name: string;
  icon: string;
  iconAscii: string;
  colorFn: (str: string) => string;
}

/**
 * Get phase information for an action type
 * Returns null for non-RPIV actions (create_pr, move_to_done)
 *
 * @param actionType - The type of action to get phase info for
 * @param colors - The theme colors object
 * @returns Phase information object or null for non-RPIV actions
 */
export function getPhaseInfo(actionType: ActionType, colors: any): PhaseInfo | null {
  const useAscii = process.env.NO_COLOR !== undefined;

  switch (actionType) {
    case 'refine':
      return {
        name: 'Refine',
        icon: '✨',
        iconAscii: '[RF]', // Changed from [R] to avoid collision with Research
        colorFn: colors.phaseRefine,
      };
    case 'research':
      return {
        name: 'Research',
        icon: '🔍',
        iconAscii: '[R]',
        colorFn: colors.phaseResearch,
      };
    case 'plan':
      return {
        name: 'Plan',
        icon: '📋',
        iconAscii: '[P]',
        colorFn: colors.phasePlan,
      };
    case 'implement':
      return {
        name: 'Implement',
        icon: '🔨',
        iconAscii: '[I]',
        colorFn: colors.phaseImplement,
      };
    case 'review':
      return {
        name: 'Verify',
        icon: '✓',
        iconAscii: '[V]',
        colorFn: colors.phaseVerify,
      };
    case 'rework':
      return {
        name: 'Rework',
        icon: '🔄',
        iconAscii: '[RW]',
        colorFn: colors.warning,
      };
    default:
      return null; // create_pr, move_to_done are not RPIV phases
  }
}

/**
 * Calculate phase progress for a story
 *
 * @param story - The story to calculate progress for
 * @returns Object containing current phase, completed phases, and all phases
 */
export function calculatePhaseProgress(story: Story): {
  currentPhase: string;
  completedPhases: string[];
  allPhases: string[];
} {
  const allPhases = ['Refine', 'Research', 'Plan', 'Implement', 'Verify'];
  const completedPhases: string[] = [];
  let currentPhase = 'Refine';

  // Check each phase completion status
  if (story.frontmatter.status !== 'backlog') {
    completedPhases.push('Refine');
    currentPhase = 'Research';
  }

  if (story.frontmatter.research_complete) {
    completedPhases.push('Research');
    currentPhase = 'Plan';
  }

  if (story.frontmatter.plan_complete) {
    completedPhases.push('Plan');
    currentPhase = 'Implement';
  }

  if (story.frontmatter.implementation_complete) {
    completedPhases.push('Implement');
    currentPhase = 'Verify';
  }

  if (story.frontmatter.reviews_complete) {
    completedPhases.push('Verify');
    currentPhase = 'Complete';
  }

  return { currentPhase, completedPhases, allPhases };
}

/**
 * Render phase checklist for progress display
 *
 * @param story - The story to render progress for
 * @param colors - The theme colors object
 * @returns Formatted checklist string with symbols and colors
 */
export function renderPhaseChecklist(story: Story, colors: any): string {
  const { currentPhase, completedPhases, allPhases } = calculatePhaseProgress(story);
  const useAscii = process.env.NO_COLOR !== undefined;

  const symbols = {
    complete: useAscii ? '[X]' : '✓',
    current: useAscii ? '[>]' : '●',
    pending: useAscii ? '[ ]' : '○',
    arrow: useAscii ? '->' : '→',
  };

  const parts = allPhases.map(phase => {
    if (completedPhases.includes(phase)) {
      return colors.success(symbols.complete) + ' ' + colors.dim(phase);
    } else if (phase === currentPhase) {
      return colors.info(symbols.current) + ' ' + colors.bold(phase);
    } else {
      return colors.dim(symbols.pending + ' ' + phase);
    }
  });

  return parts.join(colors.dim(' ' + symbols.arrow + ' '));
}

/**
 * Truncate story slug if it exceeds terminal width
 *
 * @param text - The text to truncate
 * @param maxWidth - Maximum width (defaults to terminal columns or 80)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateForTerminal(text: string, maxWidth?: number): string {
  // Enforce minimum 40 and maximum 1000 width to prevent memory/performance issues
  const terminalWidth = Math.min(1000, Math.max(40, maxWidth || process.stdout.columns || 80));
  const minWidth = 40; // Reserve space for phase indicators and verbs

  if (text.length + minWidth <= terminalWidth) {
    return text;
  }

  const availableWidth = terminalWidth - minWidth - 3; // -3 for "..."
  if (availableWidth <= 0) {
    // When there's no room for truncation indicator, just return what fits
    return text.slice(0, 10);
  }

  return text.slice(0, availableWidth) + '...';
}

/**
 * Sanitize story slug by removing ANSI escape codes
 *
 * This function prevents ANSI injection attacks by stripping escape sequences
 * that could manipulate terminal output (colors, cursor movement, screen clearing, etc.)
 *
 * @security Prevents ANSI injection attacks through malicious story titles
 * @param text - The text to sanitize
 * @returns Sanitized text without ANSI codes
 */
export function sanitizeStorySlug(text: string): string {
  // Remove ANSI escape codes (security: prevent ANSI injection attacks)
  // Comprehensive regex that covers:
  // - SGR (Select Graphic Rendition): \x1b\[[0-9;]*m
  // - Cursor positioning and other CSI sequences: \x1b\[[0-9;]*[A-Za-z]
  // - OSC (Operating System Command): \x1b\][^\x07]*\x07
  // - Incomplete sequences: \x1b\[[^\x1b]*
  return text
    .replace(/\x1b\[[0-9;]*m/g, '') // SGR color codes (complete)
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') // Other CSI sequences (cursor movement, etc.)
    .replace(/\x1b\][^\x07]*\x07/g, '') // OSC sequences (complete)
    .replace(/\x1b\[[^\x1b]*/g, ''); // Incomplete CSI sequences
}

/**
 * Format an action for display with phase indicator
 *
 * @param action - The action to format
 * @param includePhaseIndicator - Whether to include phase indicator brackets
 * @param colors - The theme colors object (parameter renamed for clarity)
 * @returns Formatted action string
 */
function formatAction(action: Action, includePhaseIndicator: boolean = false, colors?: any): string {
  const actionVerbs: Record<Action['type'], string> = {
    refine: 'Refine',
    research: 'Research',
    plan: 'Plan',
    implement: 'Implement',
    review: 'Review',
    rework: 'Rework',
    create_pr: 'Create PR for',
    move_to_done: 'Move to done',
  };

  const storySlug = action.storyPath.split('/').pop()?.replace('.md', '') || action.storyId;
  const sanitizedSlug = sanitizeStorySlug(storySlug); // Security: sanitize ANSI codes
  const truncatedSlug = truncateForTerminal(sanitizedSlug);
  const verb = actionVerbs[action.type];

  // If no color context or phase indicator not requested, return simple format
  if (!includePhaseIndicator || !colors) {
    return `${verb} "${truncatedSlug}"`;
  }

  // Get phase info for RPIV actions
  const phaseInfo = getPhaseInfo(action.type, colors);
  if (!phaseInfo) {
    // Non-RPIV actions (create_pr, move_to_done) don't get phase indicators
    return `${verb} "${truncatedSlug}"`;
  }

  // Format with phase indicator
  const useAscii = process.env.NO_COLOR !== undefined;
  const icon = useAscii ? phaseInfo.iconAscii : phaseInfo.icon;
  const phaseLabel = phaseInfo.colorFn(`[${phaseInfo.name}]`);

  // Special formatting for review actions
  if (action.type === 'review') {
    return `${phaseLabel} ${icon} ${colors.reviewAction(verb)} "${truncatedSlug}"`;
  }

  return `${phaseLabel} ${icon} ${verb} "${truncatedSlug}"`;
}

/**
 * Get status flags for a story (wrapper for shared utility)
 * Adds dim styling and error color for backward compatibility
 */
function getStoryFlags(story: Story, c: any): string {
  const flags = getStoryFlagsUtil(story, c);
  return flags ? c.dim(` ${flags}`) : '';
}

/**
 * Show detailed information about a story by ID or slug
 */
export async function details(idOrSlug: string): Promise<void> {
  const config = loadConfig();
  const sdlcRoot = getSdlcRoot();
  const c = getThemedChalk(config);

  // Check if SDLC is initialized
  if (!kanbanExists(sdlcRoot)) {
    console.log(c.warning('ai-sdlc not initialized. Run `ai-sdlc init` first.'));
    return;
  }

  // Validate input
  if (!idOrSlug || idOrSlug.trim() === '') {
    console.log(c.error('Error: Please provide a story ID or slug.'));
    console.log(c.dim('Usage: ai-sdlc details <id|slug>'));
    return;
  }

  // Normalize input (case-insensitive)
  const normalizedInput = idOrSlug.toLowerCase().trim();

  // Try to find story by ID first, then by slug
  let story = findStoryById(sdlcRoot, normalizedInput);

  if (!story) {
    story = findStoryBySlug(sdlcRoot, normalizedInput);
  }

  // Handle not found
  if (!story) {
    console.log(c.error(`Error: Story not found: "${idOrSlug}"`));
    console.log();
    console.log(c.dim('Searched for:'));
    console.log(c.dim(`  ID: ${normalizedInput}`));
    console.log(c.dim(`  Slug: ${normalizedInput}`));
    console.log();
    console.log(c.info('Tip: Use `ai-sdlc status` to see all available stories.'));
    return;
  }

  // Display story details
  console.log();
  console.log(c.bold('═'.repeat(60)));
  console.log(c.bold(story.frontmatter.title));
  console.log(c.bold('═'.repeat(60)));
  console.log();

  // Metadata section
  console.log(c.info('METADATA'));
  console.log(c.dim('─'.repeat(60)));
  console.log(`${c.dim('ID:')}          ${story.frontmatter.id}`);
  console.log(`${c.dim('Slug:')}        ${story.slug}`);
  console.log(`${c.dim('Status:')}      ${formatStatus(story.frontmatter.status, c)}`);
  console.log(`${c.dim('Priority:')}    ${story.frontmatter.priority}`);
  console.log(`${c.dim('Type:')}        ${story.frontmatter.type}`);

  if (story.frontmatter.estimated_effort) {
    console.log(`${c.dim('Effort:')}      ${story.frontmatter.estimated_effort}`);
  }

  if (story.frontmatter.assignee) {
    console.log(`${c.dim('Assignee:')}    ${story.frontmatter.assignee}`);
  }

  if (story.frontmatter.labels && story.frontmatter.labels.length > 0) {
    console.log(`${c.dim('Labels:')}      ${story.frontmatter.labels.join(', ')}`);
  }

  console.log(`${c.dim('Created:')}     ${formatDate(story.frontmatter.created)}`);

  if (story.frontmatter.updated) {
    console.log(`${c.dim('Updated:')}     ${formatDate(story.frontmatter.updated)}`);
  }

  console.log();

  // Workflow status section
  console.log(c.info('WORKFLOW STATUS'));
  console.log(c.dim('─'.repeat(60)));
  console.log(`${c.dim('Research:')}         ${formatCheckbox(story.frontmatter.research_complete, c)}`);
  console.log(`${c.dim('Planning:')}         ${formatCheckbox(story.frontmatter.plan_complete, c)}`);
  console.log(`${c.dim('Implementation:')}   ${formatCheckbox(story.frontmatter.implementation_complete, c)}`);
  console.log(`${c.dim('Reviews:')}          ${formatCheckbox(story.frontmatter.reviews_complete, c)}`);
  console.log();

  // PR information (if present)
  if (story.frontmatter.pr_url || story.frontmatter.branch) {
    console.log(c.info('PULL REQUEST'));
    console.log(c.dim('─'.repeat(60)));

    if (story.frontmatter.branch) {
      console.log(`${c.dim('Branch:')}    ${story.frontmatter.branch}`);
    }

    if (story.frontmatter.pr_url) {
      console.log(`${c.dim('PR URL:')}    ${story.frontmatter.pr_url}`);
    }

    console.log();
  }

  // Error information (if present)
  if (story.frontmatter.last_error) {
    console.log(c.error('LAST ERROR'));
    console.log(c.dim('─'.repeat(60)));
    console.log(c.error(story.frontmatter.last_error));
    console.log();
  }

  // Content sections
  displayContentSections(story, c);

  console.log(c.bold('═'.repeat(60)));
  console.log();
}

/**
 * Format status with appropriate color (wrapper for shared utility)
 */
function formatStatus(status: string, c: any): string {
  return formatStatusUtil(status, c);
}

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format checkbox (completed/not completed)
 */
function formatCheckbox(completed: boolean, c: any): string {
  return completed ? c.success('✓ Complete') : c.dim('○ Pending');
}

/**
 * Display content sections from the story
 */
function displayContentSections(story: Story, c: any): void {
  const content = story.content;

  // Parse sections from markdown
  const sections = parseContentSections(content);

  // Display each section if it has content
  for (const section of sections) {
    if (section.content && !isEmptySection(section.content)) {
      console.log(c.info(section.title.toUpperCase()));
      console.log(c.dim('─'.repeat(60)));
      console.log(section.content);
      console.log();
    }
  }
}

/**
 * Parse markdown content into sections
 */
function parseContentSections(content: string): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  const lines = content.split('\n');

  let currentSection: { title: string; content: string } | null = null;

  for (const line of lines) {
    // Check if this is a section header (## Header)
    const headerMatch = line.match(/^##\s+(.+)$/);

    if (headerMatch) {
      // Save previous section if exists
      if (currentSection) {
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        title: headerMatch[1],
        content: '',
      };
    } else if (currentSection) {
      // Add line to current section
      currentSection.content += line + '\n';
    }
  }

  // Don't forget the last section
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Check if a section is empty (contains only placeholder comments or whitespace)
 */
function isEmptySection(content: string): boolean {
  const trimmed = content.trim();

  // Empty or only whitespace
  if (!trimmed) {
    return true;
  }

  // Only contains placeholder HTML comments
  const withoutComments = trimmed.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!withoutComments) {
    return true;
  }

  return false;
}

/**
 * Unblock a story from the blocked folder and move it back to the workflow
 */
export function unblock(storyId: string, options?: { resetRetries?: boolean }): void {
  const spinner = ora('Unblocking story...').start();
  const config = loadConfig();
  const c = getThemedChalk(config);

  try {
    const sdlcRoot = getSdlcRoot();

    if (!kanbanExists(sdlcRoot)) {
      spinner.fail('ai-sdlc not initialized. Run `ai-sdlc init` first.');
      return;
    }

    // Unblock the story (using renamed import to avoid naming conflict)
    const unblockedStory = unblockStory(storyId, sdlcRoot, options);

    // Determine destination folder from updated path
    const destinationFolder = unblockedStory.path.match(/\/([^/]+)\/[^/]+\.md$/)?.[1] || 'unknown';

    spinner.succeed(c.success(`Unblocked story ${storyId}, moved to ${destinationFolder}/`));

    if (options?.resetRetries) {
      console.log(c.dim('  Reset retry_count and refinement_count to 0'));
    }

    console.log(c.dim(`  Path: ${unblockedStory.path}`));
  } catch (error) {
    spinner.fail('Failed to unblock story');
    const message = error instanceof Error ? error.message : String(error);
    console.error(c.error(`  ${message}`));
    process.exit(1);
  }
}

export async function migrate(options: { dryRun?: boolean; backup?: boolean; force?: boolean }): Promise<void> {
  const config = loadConfig();
  const sdlcRoot = getSdlcRoot();
  const c = getThemedChalk(config);

  // Migration needs to check for OLD structure (kanban folders) OR new structure (stories/)
  // It's valid to run migration when old folders exist but stories/ doesn't yet
  const oldFolders = ['backlog', 'ready', 'in-progress', 'done', 'blocked'];
  const hasOldStructure = oldFolders.some(folder => fs.existsSync(path.join(sdlcRoot, folder)));
  const hasNewStructure = kanbanExists(sdlcRoot);

  if (!hasOldStructure && !hasNewStructure) {
    console.log(c.warning('ai-sdlc not initialized. Run `ai-sdlc init` first.'));
    return;
  }

  const spinner = options.dryRun
    ? ora('Analyzing migration...').start()
    : ora('Migrating stories...').start();

  try {
    const result = await migrateToFolderPerStory(sdlcRoot, options);

    if (result.warnings.some(w => w.includes('Already migrated'))) {
      spinner.info(c.info('Already migrated'));
      console.log(c.dim('Stories are already using folder-per-story structure.'));
      console.log(c.dim('Delete .ai-sdlc/.migrated to force re-migration.'));
      return;
    }

    if (result.errors.length > 0) {
      spinner.fail(c.error('Migration failed'));
      console.log();
      for (const error of result.errors) {
        console.log(c.error(`  ✗ ${error}`));
      }
      return;
    }

    if (result.migrations.length === 0) {
      spinner.info(c.info('No stories to migrate'));
      console.log(c.dim('No old folder structure found.'));
      return;
    }

    if (options.dryRun) {
      spinner.succeed(c.info('Migration plan ready'));
      console.log();
      console.log(c.bold('Migration Plan (dry run)'));
      console.log(c.dim('═'.repeat(60)));
      console.log();
      console.log(c.info(`Stories to migrate: ${result.migrations.length}`));
      console.log();

      for (const item of result.migrations) {
        const statusColorMap: Record<string, any> = {
          'backlog': c.backlog,
          'ready': c.ready,
          'in-progress': c.inProgress,
          'done': c.done,
          'blocked': c.blocked,
        };
        const statusColor = statusColorMap[item.status] || c.dim;
        console.log(c.dim(`  ${item.oldPath}`));
        console.log(c.success(`    → ${item.newPath}`));
        console.log(c.dim(`    ${statusColor(`status: ${item.status}`)}, priority: ${item.priority}, slug: ${item.slug}`));
        console.log();
      }

      if (result.warnings.length > 0) {
        console.log(c.warning('Warnings:'));
        for (const warning of result.warnings) {
          console.log(c.warning(`  ⚠ ${warning}`));
        }
        console.log();
      }

      console.log(c.info('Run without --dry-run to execute migration.'));
    } else {
      spinner.succeed(c.success('Migration complete!'));
      console.log();
      console.log(c.success(`✓ ${result.migrations.length} stories migrated`));

      const removedFolders = ['backlog', 'ready', 'in-progress', 'done', 'blocked'].filter(folder => {
        const folderPath = `${sdlcRoot}/${folder}`;
        return !fs.existsSync(folderPath);
      });

      if (removedFolders.length > 0) {
        console.log(c.dim(`  Old folders removed: ${removedFolders.join(', ')}`));
      }

      if (result.warnings.length > 0) {
        console.log();
        console.log(c.warning('Warnings:'));
        for (const warning of result.warnings) {
          console.log(c.warning(`  ⚠ ${warning}`));
        }
      }

      console.log();
      console.log(c.info('Next steps:'));
      console.log(c.dim('  git add -A'));
      console.log(c.dim('  git commit -m "chore: migrate to folder-per-story architecture"'));
    }
  } catch (error) {
    spinner.fail(c.error('Migration failed'));
    console.error(error);
    process.exit(1);
  }
}

/**
 * Helper function to prompt for removal confirmation
 */
async function confirmRemoval(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(message + ' (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Handle worktree cleanup when story moves to done
 * Prompts user in interactive mode to remove worktree
 */
async function handleWorktreeCleanup(
  story: Story,
  config: ReturnType<typeof loadConfig>,
  c: ReturnType<typeof getThemedChalk>
): Promise<void> {
  const worktreePath = story.frontmatter.worktree_path;
  if (!worktreePath) return;

  const sdlcRoot = getSdlcRoot();
  const workingDir = path.dirname(sdlcRoot);
  const worktreeConfig = config.worktree ?? DEFAULT_WORKTREE_CONFIG;

  // Check if worktree exists
  if (!fs.existsSync(worktreePath)) {
    console.log(c.warning(`  Note: Worktree path no longer exists: ${worktreePath}`));
    const updated = updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updated);
    console.log(c.dim('  Cleared worktree_path from frontmatter'));
    return;
  }

  // Only prompt in interactive mode
  if (!process.stdin.isTTY) {
    console.log(c.dim(`  Worktree preserved (non-interactive mode): ${worktreePath}`));
    return;
  }

  // Prompt for cleanup
  console.log();
  console.log(c.info(`  Story has a worktree at: ${worktreePath}`));
  const shouldRemove = await confirmRemoval('  Remove worktree?');

  if (!shouldRemove) {
    console.log(c.dim('  Worktree preserved'));
    return;
  }

  // Remove worktree
  try {
    let resolvedBasePath: string;
    try {
      resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
    } catch {
      resolvedBasePath = path.dirname(worktreePath);
    }
    const service = new GitWorktreeService(workingDir, resolvedBasePath);
    service.remove(worktreePath);

    const updated = updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updated);
    console.log(c.success('  ✓ Worktree removed'));
  } catch (error) {
    console.log(c.warning(`  Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`));
    // Clear frontmatter anyway (user may have manually deleted)
    const updated = updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updated);
  }
}

/**
 * List all ai-sdlc managed worktrees
 */
export async function listWorktrees(): Promise<void> {
  const config = loadConfig();
  const c = getThemedChalk(config);

  try {
    const sdlcRoot = getSdlcRoot();
    const workingDir = path.dirname(sdlcRoot);
    const worktreeConfig = config.worktree ?? DEFAULT_WORKTREE_CONFIG;

    // Resolve worktree base path
    let resolvedBasePath: string;
    try {
      resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
    } catch (error) {
      // If basePath doesn't exist yet, create an empty list response
      console.log();
      console.log(c.bold('═══ Worktrees ═══'));
      console.log();
      console.log(c.dim('No worktrees found.'));
      console.log(c.dim('Use `ai-sdlc worktrees add <story-id>` to create one.'));
      console.log();
      return;
    }

    const service = new GitWorktreeService(workingDir, resolvedBasePath);
    const worktrees = service.list();

    console.log();
    console.log(c.bold('═══ Worktrees ═══'));
    console.log();

    if (worktrees.length === 0) {
      console.log(c.dim('No worktrees found.'));
      console.log(c.dim('Use `ai-sdlc worktrees add <story-id>` to create one.'));
    } else {
      // Table header
      console.log(c.dim('Story ID'.padEnd(12) + 'Branch'.padEnd(40) + 'Status'.padEnd(10) + 'Path'));
      console.log(c.dim('─'.repeat(80)));

      for (const wt of worktrees) {
        const storyId = wt.storyId || 'unknown';
        const branch = wt.branch.length > 38 ? wt.branch.substring(0, 35) + '...' : wt.branch;
        const status = wt.exists ? c.success('exists') : c.error('missing');
        const displayPath = wt.path.length > 50 ? '...' + wt.path.slice(-47) : wt.path;

        console.log(
          storyId.padEnd(12) +
          branch.padEnd(40) +
          (wt.exists ? 'exists    ' : 'missing   ') +
          displayPath
        );
      }

      console.log();
      console.log(c.dim(`Total: ${worktrees.length} worktree(s)`));
    }

    console.log();
  } catch (error) {
    console.log(c.error(`Error listing worktrees: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Create a worktree for a specific story
 */
export async function addWorktree(storyId: string): Promise<void> {
  const spinner = ora('Creating worktree...').start();
  const config = loadConfig();
  const c = getThemedChalk(config);

  try {
    const sdlcRoot = getSdlcRoot();
    const workingDir = path.dirname(sdlcRoot);

    if (!kanbanExists(sdlcRoot)) {
      spinner.fail('ai-sdlc not initialized. Run `ai-sdlc init` first.');
      return;
    }

    // Find the story
    const story = findStoryById(sdlcRoot, storyId) || findStoryBySlug(sdlcRoot, storyId);
    if (!story) {
      spinner.fail(c.error(`Story not found: "${storyId}"`));
      console.log(c.dim('Use `ai-sdlc status` to see available stories.'));
      return;
    }

    // Check if story already has a worktree
    if (story.frontmatter.worktree_path) {
      spinner.fail(c.error(`Story already has a worktree: ${story.frontmatter.worktree_path}`));
      return;
    }

    // Resolve worktree base path
    const worktreeConfig = config.worktree ?? DEFAULT_WORKTREE_CONFIG;
    let resolvedBasePath: string;
    try {
      resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
    } catch (error) {
      spinner.fail(c.error(`Configuration Error: ${error instanceof Error ? error.message : String(error)}`));
      console.log(c.dim('Fix worktree.basePath in .ai-sdlc.json or remove it to use default location'));
      return;
    }

    const service = new GitWorktreeService(workingDir, resolvedBasePath);

    // Validate git state
    const validation = service.validateCanCreateWorktree();
    if (!validation.valid) {
      spinner.fail(c.error(validation.error || 'Cannot create worktree'));
      return;
    }

    // Detect base branch
    const baseBranch = service.detectBaseBranch();

    // Create the worktree
    const worktreePath = service.create({
      storyId: story.frontmatter.id,
      slug: story.slug,
      baseBranch,
    });

    // Update story frontmatter
    const updatedStory = updateStoryField(story, 'worktree_path', worktreePath);
    const branchName = service.getBranchName(story.frontmatter.id, story.slug);
    const storyWithBranch = updateStoryField(updatedStory, 'branch', branchName);
    await writeStory(storyWithBranch);

    spinner.succeed(c.success(`Created worktree for ${story.frontmatter.id}`));
    console.log(c.dim(`  Path: ${worktreePath}`));
    console.log(c.dim(`  Branch: ${branchName}`));
    console.log(c.dim(`  Base: ${baseBranch}`));
  } catch (error) {
    spinner.fail(c.error('Failed to create worktree'));
    console.error(c.error(`  ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Remove a worktree for a specific story
 */
export async function removeWorktree(storyId: string, options?: { force?: boolean }): Promise<void> {
  const config = loadConfig();
  const c = getThemedChalk(config);

  try {
    const sdlcRoot = getSdlcRoot();
    const workingDir = path.dirname(sdlcRoot);

    if (!kanbanExists(sdlcRoot)) {
      console.log(c.warning('ai-sdlc not initialized. Run `ai-sdlc init` first.'));
      return;
    }

    // Find the story
    const story = findStoryById(sdlcRoot, storyId) || findStoryBySlug(sdlcRoot, storyId);
    if (!story) {
      console.log(c.error(`Story not found: "${storyId}"`));
      console.log(c.dim('Use `ai-sdlc status` to see available stories.'));
      return;
    }

    // Check if story has a worktree
    if (!story.frontmatter.worktree_path) {
      console.log(c.warning(`Story ${storyId} does not have a worktree.`));
      return;
    }

    const worktreePath = story.frontmatter.worktree_path;

    // Confirm removal (unless --force)
    if (!options?.force) {
      console.log();
      console.log(c.warning('About to remove worktree:'));
      console.log(c.dim(`  Story: ${story.frontmatter.title}`));
      console.log(c.dim(`  Path: ${worktreePath}`));
      console.log();

      const confirmed = await confirmRemoval('Are you sure you want to remove this worktree?');
      if (!confirmed) {
        console.log(c.dim('Cancelled.'));
        return;
      }
    }

    const spinner = ora('Removing worktree...').start();

    // Resolve worktree base path
    const worktreeConfig = config.worktree ?? DEFAULT_WORKTREE_CONFIG;
    let resolvedBasePath: string;
    try {
      resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
    } catch {
      // If basePath doesn't exist, use the worktree path's parent
      resolvedBasePath = path.dirname(worktreePath);
    }

    const service = new GitWorktreeService(workingDir, resolvedBasePath);

    // Remove the worktree
    service.remove(worktreePath);

    // Clear worktree_path from frontmatter
    const updatedStory = updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updatedStory);

    spinner.succeed(c.success(`Removed worktree for ${story.frontmatter.id}`));
    console.log(c.dim(`  Path: ${worktreePath}`));
  } catch (error) {
    console.log(c.error(`Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}
