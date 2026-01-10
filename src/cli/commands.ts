import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import { getSdlcRoot, loadConfig, initConfig } from '../core/config.js';
import { initializeKanban, kanbanExists, assessState, getBoardStats, findStoryBySlug, findStoryById } from '../core/kanban.js';
import { createStory, parseStory, resetRPIVCycle, isAtMaxRetries } from '../core/story.js';
import { Story, Action, ActionType, KanbanFolder, WorkflowExecutionState, CompletedActionRecord, ReviewResult, ReviewDecision, ReworkContext } from '../types/index.js';
import { getThemedChalk } from '../core/theme.js';
import {
  saveWorkflowState,
  loadWorkflowState,
  clearWorkflowState,
  generateWorkflowId,
  calculateStoryHash,
  hasWorkflowState,
} from '../core/workflow-state.js';
import { renderStories } from './table-renderer.js';
import { getStoryFlags as getStoryFlagsUtil, formatStatus as formatStatusUtil } from './story-utils.js';

/**
 * Initialize the .agentic-sdlc folder structure
 */
export async function init(): Promise<void> {
  const spinner = ora('Initializing agentic-sdlc...').start();

  try {
    const config = initConfig();
    const sdlcRoot = getSdlcRoot();
    const c = getThemedChalk(config);

    if (kanbanExists(sdlcRoot)) {
      spinner.info('agentic-sdlc already initialized');
      return;
    }

    initializeKanban(sdlcRoot);

    spinner.succeed(c.success('Initialized .agentic-sdlc/'));
    console.log(c.dim('  ├── backlog/'));
    console.log(c.dim('  ├── ready/'));
    console.log(c.dim('  ├── in-progress/'));
    console.log(c.dim('  └── done/'));
    console.log();
    console.log(c.info('Get started:'));
    console.log(c.dim(`  agentic-sdlc add "Your first story"`));
  } catch (error) {
    spinner.fail('Failed to initialize');
    console.error(error);
    process.exit(1);
  }
}

/**
 * Show current board state
 */
export async function status(): Promise<void> {
  const config = loadConfig();
  const sdlcRoot = getSdlcRoot();
  const c = getThemedChalk(config);

  if (!kanbanExists(sdlcRoot)) {
    console.log(c.warning('agentic-sdlc not initialized. Run `agentic-sdlc init` first.'));
    return;
  }

  const assessment = assessState(sdlcRoot);
  const stats = getBoardStats(sdlcRoot);

  console.log();
  console.log(c.bold('═══ Agentic SDLC Board ═══'));
  console.log();

  // Show each column with new table format
  const columns: { name: string; folder: KanbanFolder; color: any }[] = [
    { name: 'BACKLOG', folder: 'backlog', color: c.backlog },
    { name: 'READY', folder: 'ready', color: c.ready },
    { name: 'IN-PROGRESS', folder: 'in-progress', color: c.inProgress },
    { name: 'DONE', folder: 'done', color: c.done },
  ];

  for (const col of columns) {
    const count = stats[col.folder];
    console.log(c.bold(col.color(`${col.name} (${count})`)));

    const stories = col.folder === 'backlog' ? assessment.backlogItems
      : col.folder === 'ready' ? assessment.readyItems
      : col.folder === 'in-progress' ? assessment.inProgressItems
      : assessment.doneItems;

    // Use new table renderer
    console.log(renderStories(stories, c));
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
      spinner.fail('agentic-sdlc not initialized. Run `agentic-sdlc init` first.');
      return;
    }

    const story = createStory(title, sdlcRoot);

    spinner.succeed(c.success(`Created: ${story.path}`));
    console.log(c.dim(`  ID: ${story.frontmatter.id}`));
    console.log(c.dim(`  Slug: ${story.slug}`));
    console.log();
    console.log(c.info('Next step:'), `agentic-sdlc run`);
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
      '  - agentic-sdlc run --auto --story <id> (full SDLC)\n' +
      '  - agentic-sdlc run --story <id> --step <phase> (single phase)'
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
 * Run the workflow (process one action or all)
 */
export async function run(options: { auto?: boolean; dryRun?: boolean; continue?: boolean; story?: string; step?: string; maxIterations?: string }): Promise<void> {
  const config = loadConfig();
  // Parse maxIterations from CLI (undefined means use config default which is Infinity)
  const maxIterationsOverride = options.maxIterations !== undefined
    ? parseInt(options.maxIterations, 10)
    : undefined;
  const sdlcRoot = getSdlcRoot();
  const c = getThemedChalk(config);

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
    console.log(c.warning('agentic-sdlc not initialized. Run `agentic-sdlc init` first.'));
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
    // Try to load existing state
    const existingState = await loadWorkflowState(sdlcRoot);

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
    // Check if there's an existing state and suggest --continue
    if (hasWorkflowState(sdlcRoot) && !options.dryRun) {
      console.log(c.info('Note: Found previous checkpoint. Use --continue to resume.'));
      console.log();
    }

    // Start new workflow
    workflowId = generateWorkflowId();
  }

  let assessment = assessState(sdlcRoot);

  // Filter actions by story if --story flag is provided
  if (options.story) {
    const normalizedInput = options.story.toLowerCase().trim();

    // Try to find story by ID first, then by slug (case-insensitive)
    let targetStory = findStoryById(sdlcRoot, normalizedInput);
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
      console.log(c.info('Tip: Use `agentic-sdlc status` to see all available stories.'));
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
      await clearWorkflowState(sdlcRoot);
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
      await clearWorkflowState(sdlcRoot);
      console.log(c.dim('Checkpoint cleared.'));
      return;
    }
  }

  // Process actions with retry support for Full SDLC mode
  let currentActions = [...actionsToProcess];
  let currentActionIndex = 0;
  let retryAttempt = 0;
  const MAX_DISPLAY_RETRIES = 3; // For display purposes

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
          await clearWorkflowState(sdlcRoot);
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

      await saveWorkflowState(state, sdlcRoot);
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
            await clearWorkflowState(sdlcRoot);
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
          await clearWorkflowState(sdlcRoot);
          console.log(c.dim('Checkpoint cleared.'));
          break;
        }
      }
    }
  }
}

/**
 * Validate and resolve the story path for an action.
 * If the path doesn't exist, attempts to find the story by ID.
 *
 * @returns The resolved story path, or null if story cannot be found
 */
function resolveStoryPath(action: Action, sdlcRoot: string): string | null {
  // Check if the current path exists
  if (fs.existsSync(action.storyPath)) {
    return action.storyPath;
  }

  // Path is stale - try to find by story ID
  const story = findStoryById(sdlcRoot, action.storyId);
  if (story) {
    return story.path;
  }

  // Story not found by ID either
  return null;
}

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

  // Validate and resolve the story path before executing
  const resolvedPath = resolveStoryPath(action, sdlcRoot);
  if (!resolvedPath) {
    console.log(c.error(`Error: Story not found for action "${action.type}"`));
    console.log(c.dim(`  Story ID: ${action.storyId}`));
    console.log(c.dim(`  Original path: ${action.storyPath}`));
    console.log(c.dim('  The story file may have been moved or deleted.'));
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
        // Move story to done folder
        const { moveStory } = await import('../core/story.js');
        const storyToMove = parseStory(action.storyPath);
        const movedStory = moveStory(storyToMove, 'done', sdlcRoot);
        result = {
          success: true,
          story: movedStory,
          changesMade: ['Moved story to done/'],
        };
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
    console.log(c.warning('agentic-sdlc not initialized. Run `agentic-sdlc init` first.'));
    return;
  }

  // Validate input
  if (!idOrSlug || idOrSlug.trim() === '') {
    console.log(c.error('Error: Please provide a story ID or slug.'));
    console.log(c.dim('Usage: agentic-sdlc details <id|slug>'));
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
    console.log(c.info('Tip: Use `agentic-sdlc status` to see all available stories.'));
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
