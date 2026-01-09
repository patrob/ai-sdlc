import chalk from 'chalk';
import ora from 'ora';
import { getSdlcRoot, loadConfig, initConfig } from '../core/config.js';
import { initializeKanban, kanbanExists, assessState, getBoardStats, findStoryBySlug, findStoryById } from '../core/kanban.js';
import { createStory, parseStory } from '../core/story.js';
import { Story, Action, KanbanFolder, WorkflowExecutionState, CompletedActionRecord } from '../types/index.js';
import { getThemedChalk } from '../core/theme.js';
import {
  saveWorkflowState,
  loadWorkflowState,
  clearWorkflowState,
  generateWorkflowId,
  calculateStoryHash,
  hasWorkflowState,
} from '../core/workflow-state.js';

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

  // Show each column
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

    if (stories.length === 0) {
      console.log(c.dim('  (empty)'));
    } else {
      for (const story of stories) {
        const flags = getStoryFlags(story, c);
        console.log(`  [${story.frontmatter.priority}] ${story.slug} - ${story.frontmatter.title}${flags}`);
      }
    }
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
 * Run the workflow (process one action or all)
 */
export async function run(options: { auto?: boolean; dryRun?: boolean; continue?: boolean; story?: string; step?: string }): Promise<void> {
  const config = loadConfig();
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

    // Display resume information
    console.log();
    console.log(c.info('⟳ Resuming workflow from checkpoint'));
    console.log(c.dim(`  Workflow ID: ${workflowId}`));
    console.log(c.dim(`  Checkpoint: ${new Date(existingState.timestamp).toLocaleString()}`));
    console.log(c.dim(`  Completed actions: ${completedActions.length}`));

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

    // Filter actions to only include those for the target story
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

  // Process actions
  for (const action of actionsToProcess) {
    const actionSuccess = await executeAction(action, sdlcRoot);

    // Save checkpoint after successful action
    if (actionSuccess) {
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
          options: { auto: options.auto, dryRun: options.dryRun },
          storyContentHash: calculateStoryHash(action.storyPath),
        },
      };

      await saveWorkflowState(state, sdlcRoot);
      console.log(c.dim(`  ✓ Progress saved (${completedActions.length} actions completed)`));
    }

    // Re-assess after each action in auto mode
    if (options.auto) {
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

/**
 * Execute a specific action
 *
 * @returns true if action succeeded, false if it failed
 */
async function executeAction(action: Action, sdlcRoot: string): Promise<boolean> {
  const config = loadConfig();
  const c = getThemedChalk(config);
  const spinner = ora(formatAction(action)).start();

  try {
    // Import and run the appropriate agent
    let result;

    switch (action.type) {
      case 'refine':
        const { runRefinementAgent } = await import('../agents/refinement.js');
        result = await runRefinementAgent(action.storyPath, sdlcRoot);
        break;

      case 'research':
        const { runResearchAgent } = await import('../agents/research.js');
        result = await runResearchAgent(action.storyPath, sdlcRoot);
        break;

      case 'plan':
        const { runPlanningAgent } = await import('../agents/planning.js');
        result = await runPlanningAgent(action.storyPath, sdlcRoot);
        break;

      case 'implement':
        const { runImplementationAgent } = await import('../agents/implementation.js');
        result = await runImplementationAgent(action.storyPath, sdlcRoot);
        break;

      case 'review':
        const { runReviewAgent } = await import('../agents/review.js');
        result = await runReviewAgent(action.storyPath, sdlcRoot);
        break;

      case 'create_pr':
        const { createPullRequest } = await import('../agents/review.js');
        result = await createPullRequest(action.storyPath, sdlcRoot);
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }

    // Check if agent succeeded
    if (result && !result.success) {
      spinner.fail(c.error(`Failed: ${formatAction(action)}`));
      if (result.error) {
        console.error(c.error(`  Error: ${result.error}`));
      }
      return false;
    }

    spinner.succeed(c.success(formatAction(action)));

    // Show changes made
    if (result && result.changesMade.length > 0) {
      for (const change of result.changesMade) {
        console.log(c.dim(`  → ${change}`));
      }
    }

    return true;
  } catch (error) {
    spinner.fail(c.error(`Failed: ${formatAction(action)}`));
    console.error(error);

    // Update story with error
    const story = parseStory(action.storyPath);
    story.frontmatter.last_error = error instanceof Error ? error.message : String(error);
    // Don't throw - let the workflow continue if in auto mode
    return false;
  }
}

/**
 * Format an action for display
 */
function formatAction(action: Action): string {
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
  return `${actionVerbs[action.type]} "${storySlug}"`;
}

/**
 * Get status flags for a story
 */
function getStoryFlags(story: Story, c: any): string {
  const flags: string[] = [];

  if (story.frontmatter.research_complete) flags.push('R');
  if (story.frontmatter.plan_complete) flags.push('P');
  if (story.frontmatter.implementation_complete) flags.push('I');
  if (story.frontmatter.reviews_complete) flags.push('V');
  if (story.frontmatter.last_error) flags.push(c.error('!'));

  return flags.length > 0 ? c.dim(` [${flags.join('')}]`) : '';
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
 * Format status with appropriate color
 */
function formatStatus(status: string, c: any): string {
  switch (status) {
    case 'backlog':
      return c.backlog(status);
    case 'ready':
      return c.ready(status);
    case 'in-progress':
      return c.inProgress(status);
    case 'done':
      return c.done(status);
    default:
      return status;
  }
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
