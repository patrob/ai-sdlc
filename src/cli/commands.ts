import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import * as readline from 'readline';
import { execSync, spawnSync } from 'child_process';
import { getSdlcRoot, loadConfig, initConfig, validateWorktreeBasePath, DEFAULT_WORKTREE_CONFIG, saveConfig } from '../core/config.js';
import { detectProjects, formatDetectedProjects, getPrimaryProject } from '../core/stack-detector.js';
import { initializeKanban, kanbanExists, assessState, getBoardStats, findStoryBySlug, findStoriesByStatus } from '../core/kanban.js';
import { createStory, parseStory, resetRPIVCycle, isAtMaxRetries, unblockStory, getStory, findStoryById, updateStoryField, writeStory, sanitizeStoryId, autoCompleteStoryAfterReview, incrementImplementationRetryCount, resetImplementationRetryCount, getEffectiveMaxImplementationRetries, isAtMaxImplementationRetries, updateStoryStatus } from '../core/story.js';
import { GitWorktreeService, WorktreeStatus, getLastCompletedPhase, getNextPhase } from '../core/worktree.js';
import { Story, Action, ActionType, KanbanFolder, WorkflowExecutionState, CompletedActionRecord, ReviewResult, ReviewDecision, ReworkContext, WorktreeInfo, PreFlightResult } from '../types/index.js';
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
import { importIssue } from './commands/import-issue.js';
import { linkIssue } from './commands/link-issue.js';
import { generateReviewSummary } from '../agents/review.js';
import { getTerminalWidth } from './formatting.js';
import { validateGitState, GitValidationResult } from '../core/git-utils.js';
import { StoryLogger } from '../core/story-logger.js';
import { detectConflicts } from '../core/conflict-detector.js';
import { getLogger } from '../core/logger.js';

/**
 * Branch divergence threshold for warnings
 * When a worktree branch has diverged by more than this number of commits
 * from the base branch (ahead or behind), a warning will be displayed
 * suggesting the user rebase to sync with latest changes.
 */
const DIVERGENCE_WARNING_THRESHOLD = 10;

/**
 * Options for the init command
 */
export interface InitOptions {
  /** Skip project detection for faster initialization */
  quick?: boolean;
}

/**
 * Initialize the .ai-sdlc folder structure
 */
export async function init(options: InitOptions = {}): Promise<void> {
  const spinner = ora('Initializing ai-sdlc...').start();

  try {
    const config = initConfig();
    const sdlcRoot = getSdlcRoot();
    const workingDir = process.cwd();
    const c = getThemedChalk(config);

    if (kanbanExists(sdlcRoot)) {
      spinner.info('ai-sdlc already initialized');
      return;
    }

    initializeKanban(sdlcRoot);

    spinner.succeed(c.success('Initialized .ai-sdlc/'));
    console.log(c.dim('  └── stories/'));
    console.log();

    // Skip detection if --quick flag is set
    if (options.quick) {
      console.log(c.info('Get started:'));
      console.log(c.dim(`  ai-sdlc add "Your first story"`));
      return;
    }

    // Detect project structure
    spinner.start('Detecting project structure...');
    const detectedProjects = detectProjects(workingDir);

    if (detectedProjects.length === 0) {
      spinner.info('No recognizable project structure detected');
      console.log(c.dim('  You can manually configure testCommand and buildCommand in .ai-sdlc.json'));
      console.log();
      console.log(c.info('Get started:'));
      console.log(c.dim(`  ai-sdlc add "Your first story"`));
      return;
    }

    spinner.succeed('Project structure detected');
    console.log();
    console.log(formatDetectedProjects(detectedProjects));
    console.log();

    // Prompt for confirmation
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(c.info('Configure commands for these projects? [Y/n] '), (ans) => {
        rl.close();
        resolve(ans.trim().toLowerCase());
      });
    });

    if (answer === 'n' || answer === 'no') {
      console.log(c.dim('  Skipping project configuration'));
      console.log();
      console.log(c.info('Get started:'));
      console.log(c.dim(`  ai-sdlc add "Your first story"`));
      return;
    }

    // Update config with detected projects
    const updatedConfig = { ...config };

    // For single project at root, set top-level commands
    const primaryProject = getPrimaryProject(detectedProjects);
    if (primaryProject && primaryProject.path === '.') {
      updatedConfig.testCommand = primaryProject.commands.test;
      updatedConfig.buildCommand = primaryProject.commands.build;
      updatedConfig.installCommand = primaryProject.commands.install;
      updatedConfig.startCommand = primaryProject.commands.start;
    }

    // If there are subdirectory projects or multiple projects, save them
    if (detectedProjects.length > 1 || (primaryProject && primaryProject.path !== '.')) {
      updatedConfig.projects = detectedProjects;

      // For subdirectory projects, also set root-level commands from primary
      if (primaryProject) {
        updatedConfig.testCommand = primaryProject.commands.test;
        updatedConfig.buildCommand = primaryProject.commands.build;
        updatedConfig.installCommand = primaryProject.commands.install;
        updatedConfig.startCommand = primaryProject.commands.start;
      }
    }

    saveConfig(updatedConfig, workingDir);
    console.log(c.success('✓ Configuration saved to .ai-sdlc.json'));
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

  const assessment = await assessState(sdlcRoot);
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
 * Validate file path for security (path traversal, symlinks, allowed directories)
 */
function validateFilePath(filePath: string): void {
  const resolvedPath = path.resolve(filePath);
  const allowedDir = path.resolve(process.cwd());

  // Check path traversal: resolved path must be within current directory
  if (!resolvedPath.startsWith(allowedDir + path.sep) && resolvedPath !== allowedDir) {
    throw new Error('Security: File path must be within current directory (path traversal detected)');
  }

  // Check if file exists before checking if it's a symlink
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${path.basename(filePath)}`);
  }

  // Check for symbolic links (security risk)
  const stats = fs.lstatSync(resolvedPath);
  if (stats.isSymbolicLink()) {
    throw new Error('Security: Symbolic links are not allowed');
  }
}

/**
 * Validate file extension against whitelist
 */
function validateFileExtension(filePath: string): void {
  const allowedExtensions = ['.md', '.txt', '.markdown'];
  const ext = path.extname(filePath).toLowerCase();

  if (!allowedExtensions.includes(ext)) {
    throw new Error(`Invalid file type: only ${allowedExtensions.join(', ')} files are allowed`);
  }
}

/**
 * Validate file size (10MB maximum)
 */
function validateFileSize(filePath: string): void {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const stats = fs.statSync(filePath);

  if (stats.size > maxSize) {
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    throw new Error(`File too large: ${sizeMB}MB (maximum 10MB)`);
  }
}

/**
 * Sanitize file content (strip null bytes, validate UTF-8)
 */
function sanitizeFileContent(content: string): string {
  // Strip null bytes that could truncate strings
  return content.replace(/\0/g, '');
}

/**
 * Add a new story to the backlog
 */
export async function add(title?: string, options?: { file?: string }): Promise<void> {
  const spinner = ora('Creating story...').start();

  try {
    const config = loadConfig();
    const sdlcRoot = getSdlcRoot();
    const c = getThemedChalk(config);

    if (!kanbanExists(sdlcRoot)) {
      spinner.fail('ai-sdlc not initialized. Run `ai-sdlc init` first.');
      return;
    }

    // Validate that either title or file is provided (not both, not neither)
    if (!title && !options?.file) {
      spinner.fail('Error: Must provide either a title or --file option');
      console.log(c.dim('Usage:'));
      console.log(c.dim('  ai-sdlc add "Story Title"'));
      console.log(c.dim('  ai-sdlc add --file story.md'));
      process.exit(1);
    }

    if (title && options?.file) {
      spinner.fail('Error: Cannot provide both title and --file option');
      console.log(c.dim('Use either:'));
      console.log(c.dim('  ai-sdlc add "Story Title"'));
      console.log(c.dim('  ai-sdlc add --file story.md'));
      process.exit(1);
    }

    let storyTitle: string;
    let storyContent: string | undefined;

    // Handle file input with security validation
    if (options?.file) {
      spinner.text = 'Reading file...';

      const filePath = options.file;

      try {
        // Security validations
        validateFilePath(filePath);
        validateFileExtension(filePath);

        // Read file (includes existence check via fs.readFileSync)
        const resolvedPath = path.resolve(filePath);

        // Validate file size before reading
        validateFileSize(resolvedPath);

        // Read and sanitize content
        const rawContent = fs.readFileSync(resolvedPath, 'utf-8');
        storyContent = sanitizeFileContent(rawContent);

        // Extract title from content or use filename
        const { extractTitleFromContent } = await import('../core/story.js');
        const extractedTitle = extractTitleFromContent(storyContent);

        if (extractedTitle) {
          storyTitle = extractedTitle;
        } else {
          // Fall back to filename without extension
          storyTitle = path.basename(filePath, path.extname(filePath));
        }

        spinner.text = `Creating story from ${path.basename(filePath)}...`;
      } catch (error) {
        spinner.fail('Failed to read file');

        if (error instanceof Error) {
          // Sanitize error messages to avoid leaking system paths
          if (error.message.startsWith('Security:') || error.message.startsWith('Invalid file type:') || error.message.startsWith('File too large:')) {
            console.log(c.error(error.message));
          } else if (error.message.includes('ENOENT')) {
            console.log(c.error(`File not found: ${path.basename(filePath)}`));
          } else if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
            console.log(c.error(`Permission denied: ${path.basename(filePath)}`));
          } else {
            console.log(c.error(`Unable to read file: ${path.basename(filePath)}`));
          }
        }
        process.exit(1);
      }
    } else {
      // Traditional title-only input
      storyTitle = title!;
    }

    // Create the story
    const story = await createStory(storyTitle, sdlcRoot, {}, storyContent);

    spinner.succeed(c.success(`Created: ${story.path}`));
    console.log(c.dim(`  ID: ${story.frontmatter.id}`));
    console.log(c.dim(`  Title: ${story.frontmatter.title}`));
    console.log(c.dim(`  Slug: ${story.slug}`));
    if (options?.file) {
      console.log(c.dim(`  Source: ${path.basename(options.file)}`));
    }
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
 * Validates flag combinations for --batch conflicts
 * @throws Error if conflicting flags are detected
 */
function validateBatchOptions(options: { batch?: string; story?: string; watch?: boolean; continue?: boolean }): void {
  if (!options.batch) {
    return; // No batch flag, nothing to validate
  }

  // --batch and --story are mutually exclusive
  if (options.story) {
    throw new Error(
      'Cannot combine --batch with --story flag.\n' +
      'Use either:\n' +
      '  - ai-sdlc run --batch S-001,S-002,S-003 (batch processing)\n' +
      '  - ai-sdlc run --auto --story <id> (single story)'
    );
  }

  // --batch and --watch are mutually exclusive
  if (options.watch) {
    throw new Error(
      'Cannot combine --batch with --watch flag.\n' +
      'Use either:\n' +
      '  - ai-sdlc run --batch S-001,S-002,S-003 (batch processing)\n' +
      '  - ai-sdlc run --watch (daemon mode)'
    );
  }

  // --batch and --continue are mutually exclusive
  if (options.continue) {
    throw new Error(
      'Cannot combine --batch with --continue flag.\n' +
      'Batch mode does not support resuming from checkpoints.\n' +
      'Use: ai-sdlc run --batch S-001,S-002,S-003'
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
    case 'plan_review':
      return !story.frontmatter.plan_review_complete;
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
  const allPhases: ActionType[] = ['refine', 'research', 'plan', 'plan_review', 'implement', 'review'];
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
 * Display detailed information about an existing worktree
 */
function displayExistingWorktreeInfo(status: WorktreeStatus, c: any): void {
  console.log();
  console.log(c.warning('A worktree already exists for this story:'));
  console.log();
  console.log(c.bold('  Worktree Path:'), status.path);
  console.log(c.bold('  Branch:       '), status.branch);

  if (status.lastCommit) {
    console.log(c.bold('  Last Commit:  '), `${status.lastCommit.hash.substring(0, 7)} - ${status.lastCommit.message}`);
    console.log(c.bold('  Committed:    '), status.lastCommit.timestamp);
  }

  const statusLabel = status.workingDirectoryStatus === 'clean'
    ? c.success('clean')
    : c.warning(status.workingDirectoryStatus);
  console.log(c.bold('  Working Dir:  '), statusLabel);

  if (status.modifiedFiles.length > 0) {
    console.log();
    console.log(c.warning('  Modified files:'));
    for (const file of status.modifiedFiles.slice(0, 5)) {
      console.log(c.dim(`    M ${file}`));
    }
    if (status.modifiedFiles.length > 5) {
      console.log(c.dim(`    ... and ${status.modifiedFiles.length - 5} more`));
    }
  }

  if (status.untrackedFiles.length > 0) {
    console.log();
    console.log(c.warning('  Untracked files:'));
    for (const file of status.untrackedFiles.slice(0, 5)) {
      console.log(c.dim(`    ? ${file}`));
    }
    if (status.untrackedFiles.length > 5) {
      console.log(c.dim(`    ... and ${status.untrackedFiles.length - 5} more`));
    }
  }

  console.log();
  console.log(c.info('To resume work in this worktree:'));
  console.log(c.dim(`  cd ${status.path}`));
  console.log();
  console.log(c.info('To remove the worktree and start fresh:'));
  console.log(c.dim(`  ai-sdlc worktrees remove ${status.storyId}`));
  console.log();
}

// ANSI escape sequence patterns for sanitization
const ANSI_CSI_PATTERN = /\x1B\[[0-9;]*[a-zA-Z]/g;
const ANSI_OSC_BEL_PATTERN = /\x1B\][^\x07]*\x07/g;
const ANSI_OSC_ESC_PATTERN = /\x1B\][^\x1B]*\x1B\\/g;
const ANSI_SINGLE_CHAR_PATTERN = /\x1B./g;
const CONTROL_CHARS_PATTERN = /[\x00-\x1F\x7F-\x9F]/g;

/**
 * Sanitize a string for safe display in the terminal.
 * Strips ANSI escape sequences (CSI, OSC, single-char), control characters,
 * and truncates extremely long strings to prevent DoS attacks.
 *
 * This uses the same comprehensive ANSI stripping patterns as sanitizeReasonText
 * from src/core/story.ts for consistency.
 *
 * @param str - The string to sanitize
 * @returns Sanitized string safe for terminal display (max 500 chars)
 */
function sanitizeForDisplay(str: string): string {
  const cleaned = str
    .replace(ANSI_CSI_PATTERN, '')       // CSI sequences (e.g., \x1B[31m)
    .replace(ANSI_OSC_BEL_PATTERN, '')   // OSC with BEL terminator (e.g., \x1B]...\x07)
    .replace(ANSI_OSC_ESC_PATTERN, '')   // OSC with ESC\ terminator (e.g., \x1B]...\x1B\\)
    .replace(ANSI_SINGLE_CHAR_PATTERN, '') // Single-char escapes (e.g., \x1BH)
    .replace(CONTROL_CHARS_PATTERN, ''); // Control characters (0x00-0x1F, 0x7F-0x9F)

  // Truncate extremely long strings (DoS protection)
  return cleaned.length > 500 ? cleaned.slice(0, 497) + '...' : cleaned;
}

/**
 * Perform pre-flight conflict check before starting work on a story in a worktree.
 * Warns about potential file conflicts with active stories and prompts for confirmation.
 *
 * **Race Condition (TOCTOU):** Multiple users can pass this check simultaneously
 * before branches are created. This is an accepted risk - the window is small
 * (~100ms) and git will catch conflicts during merge/PR creation. Adding file
 * locks would significantly increase complexity for minimal security gain.
 *
 * **Security Notes:**
 * - sdlcRoot is normalized and validated (absolute path, no null bytes, max 1024 chars)
 * - All display output is sanitized to prevent terminal injection attacks
 * - Story IDs are validated with sanitizeStoryId() then stripped with sanitizeForDisplay()
 * - Error messages are generic to prevent information leakage
 *
 * @param targetStory - The story to check for conflicts
 * @param sdlcRoot - Root directory of the .ai-sdlc folder (must be absolute, validated)
 * @param options - Command options (force flag)
 * @param options.force - Skip conflict check if true
 * @returns PreFlightResult indicating whether to proceed and any warnings
 * @throws Error if sdlcRoot is invalid (not absolute, null bytes, too long)
 */
export async function preFlightConflictCheck(
  targetStory: Story,
  sdlcRoot: string,
  options: { force?: boolean }
): Promise<PreFlightResult> {
  const config = loadConfig();
  const c = getThemedChalk(config);

  // Skip if --force flag
  if (options.force) {
    console.log(c.warning('⚠️  Skipping conflict check (--force)'));
    return { proceed: true, warnings: ['Conflict check skipped'] };
  }

  // Validate sdlcRoot parameter (normalize first to prevent bypass attacks)
  const normalizedPath = path.normalize(sdlcRoot);

  if (!path.isAbsolute(normalizedPath)) {
    throw new Error('Invalid project path');
  }
  if (normalizedPath.includes('\0')) {
    throw new Error('Invalid project path');
  }
  if (normalizedPath.length > 1024) {
    throw new Error('Invalid project path');
  }

  // Check if target story is already in-progress (allow if resuming existing worktree)
  if (targetStory.frontmatter.status === 'in-progress' && !targetStory.frontmatter.worktree_path) {
    console.log(c.error('❌ Story is already in-progress'));
    return { proceed: false, warnings: ['Story already in progress'] };
  }

  try {
    // Query for all in-progress stories (excluding target)
    // Use normalizedPath for all subsequent operations
    const activeStories = findStoriesByStatus(normalizedPath, 'in-progress')
      .filter(s => s.frontmatter.id !== targetStory.frontmatter.id);

    if (activeStories.length === 0) {
      console.log(c.success('✓ Conflict check: No overlapping files with active stories'));
      return { proceed: true, warnings: [] };
    }

    // Run conflict detection (use normalizedPath)
    const workingDir = path.dirname(normalizedPath);
    const result = detectConflicts([targetStory, ...activeStories], workingDir, 'main');

    // Filter conflicts involving target story
    const relevantConflicts = result.conflicts.filter(
      conflict => conflict.storyA === targetStory.frontmatter.id || conflict.storyB === targetStory.frontmatter.id
    );

    // Filter out 'none' severity conflicts (keep all displayable conflicts including low)
    const displayableConflicts = relevantConflicts.filter(conflict => conflict.severity !== 'none');

    if (displayableConflicts.length === 0) {
      console.log(c.success('✓ Conflict check: No overlapping files with active stories'));
      return { proceed: true, warnings: [] };
    }

    // Sort conflicts by severity (high -> medium -> low)
    const severityOrder = { high: 0, medium: 1, low: 2, none: 3 };
    const sortedConflicts = displayableConflicts.sort((a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity]
    );

    // Display conflicts
    console.log();
    console.log(c.warning('⚠️  Potential conflicts detected:'));
    console.log();

    for (const conflict of sortedConflicts) {
      const otherStoryId = conflict.storyA === targetStory.frontmatter.id ? conflict.storyB : conflict.storyA;

      // Two-stage sanitization: validate structure, then strip for display
      try {
        const validatedTargetId = sanitizeStoryId(targetStory.frontmatter.id);
        const validatedOtherId = sanitizeStoryId(otherStoryId);
        const sanitizedTargetId = sanitizeForDisplay(validatedTargetId);
        const sanitizedOtherId = sanitizeForDisplay(validatedOtherId);
        console.log(c.warning(`   ${sanitizedTargetId} may conflict with ${sanitizedOtherId}:`));
      } catch (error) {
        // If validation fails, show generic error (defensive)
        console.log(c.warning(`   Story may have conflicting changes (invalid ID format)`));
      }

      // Display shared files
      for (const file of conflict.sharedFiles) {
        const severityLabel = conflict.severity === 'high' ? c.error('High') :
                              conflict.severity === 'medium' ? c.warning('Medium') :
                              c.info('Low');
        const sanitizedFile = sanitizeForDisplay(file);
        console.log(`   - ${severityLabel}: ${sanitizedFile} (both stories modify this file)`);
      }

      // Display shared directories
      for (const dir of conflict.sharedDirectories) {
        const severityLabel = conflict.severity === 'high' ? c.error('High') :
                              conflict.severity === 'medium' ? c.warning('Medium') :
                              c.info('Low');
        const sanitizedDir = sanitizeForDisplay(dir);
        console.log(`   - ${severityLabel}: ${sanitizedDir} (both stories modify files in this directory)`);
      }

      console.log();
      const sanitizedRecommendation = sanitizeForDisplay(conflict.recommendation);
      console.log(c.dim(`   Recommendation: ${sanitizedRecommendation}`));
      console.log();
    }

    // Non-interactive mode: default to declining
    if (!process.stdin.isTTY) {
      console.log(c.dim('Non-interactive mode: conflicts require --force to proceed'));
      return { proceed: false, warnings: ['Conflicts detected'] };
    }

    // Interactive mode: prompt user
    const shouldContinue = await confirmRemoval('Continue anyway?');
    return {
      proceed: shouldContinue,
      warnings: shouldContinue ? ['User confirmed with conflicts'] : ['Conflicts detected']
    };

  } catch (error) {
    // Fail-open: allow proceeding if conflict detection fails
    console.log(c.warning('⚠️  Conflict detection unavailable'));
    console.log(c.dim('Proceeding without conflict check...'));
    return { proceed: true, warnings: ['Conflict detection failed'] };
  }
}

/**
 * Process multiple stories sequentially through full SDLC
 * Internal function used by batch mode
 */
async function processBatchInternal(
  storyIds: string[],
  sdlcRoot: string,
  options: { dryRun?: boolean; worktree?: boolean; force?: boolean }
): Promise<{ total: number; succeeded: number; failed: number; skipped: number; errors: Array<{ storyId: string; error: string }>; duration: number }> {
  const startTime = Date.now();
  const config = loadConfig();
  const c = getThemedChalk(config);
  const { formatBatchProgress, formatBatchSummary, logStoryCompletion, promptContinueOnError } = await import('./batch-processor.js');

  const result = {
    total: storyIds.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [] as Array<{ storyId: string; error: string }>,
    duration: 0,
  };

  console.log();
  console.log(c.bold('═══ Starting Batch Processing ═══'));
  console.log(c.dim(`  Stories: ${storyIds.join(', ')}`));
  console.log(c.dim(`  Dry run: ${options.dryRun ? 'yes' : 'no'}`));
  console.log();

  // Process each story sequentially
  for (let i = 0; i < storyIds.length; i++) {
    const storyId = storyIds[i];

    // Get story and check status
    let story: Story;
    try {
      story = getStory(sdlcRoot, storyId);
    } catch (error) {
      result.failed++;
      result.errors.push({
        storyId,
        error: `Story not found: ${error instanceof Error ? error.message : String(error)}`,
      });
      console.log(c.error(`[${i + 1}/${storyIds.length}] ✗ Story not found: ${storyId}`));
      console.log();

      // Ask if user wants to continue (or abort in non-interactive)
      const shouldContinue = await promptContinueOnError(storyId, c);
      if (!shouldContinue) {
        console.log(c.warning('Batch processing aborted.'));
        break;
      }
      continue;
    }

    // Skip if already done
    if (story.frontmatter.status === 'done') {
      result.skipped++;
      console.log(c.dim(`[${i + 1}/${storyIds.length}] ⊘ Skipping ${storyId} (already completed)`));
      console.log();
      continue;
    }

    // Show progress header
    const progress = {
      currentIndex: i,
      total: storyIds.length,
      currentStory: story,
    };
    console.log(c.info(formatBatchProgress(progress)));
    console.log();

    // Dry-run mode: just show what would be done
    if (options.dryRun) {
      console.log(c.dim('  Would process story through full SDLC'));
      console.log(c.dim(`  Status: ${story.frontmatter.status}`));
      console.log();
      result.succeeded++;
      continue;
    }

    // Process story through full SDLC by recursively calling run()
    // We set auto: true to ensure full SDLC execution
    try {
      await run({
        auto: true,
        story: storyId,
        dryRun: false,
        worktree: options.worktree,
        force: options.force,
      });

      // Check if story completed successfully (moved to done)
      const finalStory = getStory(sdlcRoot, storyId);
      if (finalStory.frontmatter.status === 'done') {
        result.succeeded++;
        logStoryCompletion(storyId, true, c);
      } else {
        // Story didn't reach done state - treat as failure
        result.failed++;
        result.errors.push({
          storyId,
          error: `Story did not complete (status: ${finalStory.frontmatter.status})`,
        });
        logStoryCompletion(storyId, false, c);

        // Ask if user wants to continue (or abort in non-interactive)
        const shouldContinue = await promptContinueOnError(storyId, c);
        if (!shouldContinue) {
          console.log(c.warning('Batch processing aborted.'));
          break;
        }
      }
    } catch (error) {
      result.failed++;
      result.errors.push({
        storyId,
        error: error instanceof Error ? error.message : String(error),
      });
      logStoryCompletion(storyId, false, c);

      // Ask if user wants to continue (or abort in non-interactive)
      const shouldContinue = await promptContinueOnError(storyId, c);
      if (!shouldContinue) {
        console.log(c.warning('Batch processing aborted.'));
        break;
      }
    }

    console.log();
  }

  // Display final summary
  result.duration = Date.now() - startTime;
  const summaryLines = formatBatchSummary(result);
  summaryLines.forEach((line: string) => {
    if (line.includes('✓')) {
      console.log(c.success(line));
    } else if (line.includes('✗')) {
      console.log(c.error(line));
    } else if (line.includes('⊘')) {
      console.log(c.warning(line));
    } else if (line.startsWith('  -')) {
      console.log(c.dim(line));
    } else {
      console.log(line);
    }
  });

  // Return non-zero exit code if any failures occurred
  if (result.failed > 0) {
    process.exitCode = 1;
  }

  return result;
}

/**
 * Result of the run() function execution
 */
export interface RunResult {
  success: boolean;
}

/**
 * Run the workflow (process one action or all)
 */
export async function run(options: { auto?: boolean; dryRun?: boolean; continue?: boolean; story?: string; batch?: string; epic?: string; maxConcurrent?: string; concurrent?: string; step?: string; maxIterations?: string; watch?: boolean; force?: boolean; worktree?: boolean; clean?: boolean; keepWorktrees?: boolean; merge?: boolean; mergeStrategy?: string }): Promise<RunResult> {
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
    worktree: options.worktree,
    clean: options.clean,
    force: options.force,
  });

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
      const { Orchestrator } = await import('../core/orchestrator.js');
      const { findStoriesByStatus } = await import('../core/kanban.js');

      // Query database for ready stories, sorted by priority
      const readyStories = findStoriesByStatus(sdlcRoot, 'ready');

      if (readyStories.length === 0) {
        console.log(c.info('No ready stories found. Add stories to the ready column in the kanban board.'));
        return { success: true }; // No error, just nothing to do
      }

      // Limit to available stories
      const storiesToRun = readyStories.slice(0, Math.min(concurrency, readyStories.length));
      console.log(c.info(`🚀 Running ${storiesToRun.length} stories concurrently (concurrency: ${concurrency})`));

      // Create orchestrator and execute
      const orchestrator = new Orchestrator({
        concurrency,
        shutdownTimeout: 10000,
        keepWorktrees: options.keepWorktrees,
      });

      const results = await orchestrator.execute(storiesToRun);

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
    const { processEpic } = await import('./epic-processor.js');
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
    const { parseStoryIdList, deduplicateStoryIds, validateStoryIds } = await import('./batch-validator.js');

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
      return { success: false };
    }
  }

  if (shouldUseWorktree && options.story && targetStory) {
    // PRE-FLIGHT CHECK: Run conflict detection before creating worktree
    const preFlightResult = await preFlightConflictCheck(targetStory, sdlcRoot, options);

    if (!preFlightResult.proceed) {
      console.log(c.error('❌ Aborting. Complete active stories first or use --force.'));
      return { success: false };
    }

    // Log warnings if user proceeded despite conflicts (skip internal flag messages)
    if (preFlightResult.warnings.length > 0 && !preFlightResult.warnings.includes('Conflict check skipped')) {
      preFlightResult.warnings.forEach(w => console.log(c.dim(`  ⚠ ${w}`)));
      console.log();
    }

    const workingDir = path.dirname(sdlcRoot);

    // Check if story already has an existing worktree (resume scenario)
    // Note: We check only if existingWorktreePath is set, not if it exists.
    // The validation logic will handle missing directories/branches.
    const existingWorktreePath = targetStory.frontmatter.worktree_path;
    if (existingWorktreePath) {
      // Validate worktree before resuming
      const resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);

      // Security validation: ensure worktree_path is within the configured base directory
      const absoluteWorktreePath = path.resolve(existingWorktreePath);
      const absoluteBasePath = path.resolve(resolvedBasePath);
      if (!absoluteWorktreePath.startsWith(absoluteBasePath)) {
        console.log(c.error('Security Error: worktree_path is outside configured base directory'));
        console.log(c.dim(`  Worktree path: ${absoluteWorktreePath}`));
        console.log(c.dim(`  Expected base: ${absoluteBasePath}`));
        return { success: false };
      }

      // Warn if story is marked as done but has an existing worktree
      if (targetStory.frontmatter.status === 'done') {
        console.log(c.warning('⚠ Story is marked as done but has an existing worktree'));
        console.log(c.dim('  This may be a stale worktree that should be cleaned up.'));
        console.log();

        // Prompt user for confirmation to proceed
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(c.dim('Continue with this worktree? (y/N): '), (ans) => {
            rl.close();
            resolve(ans.toLowerCase().trim());
          });
        });

        if (answer !== 'y' && answer !== 'yes') {
          console.log(c.dim('Aborted. Consider removing the worktree_path from the story frontmatter.'));
          return { success: false };
        }

        console.log();
      }

      const worktreeService = new GitWorktreeService(workingDir, resolvedBasePath);
      const branchName = worktreeService.getBranchName(targetStory.frontmatter.id, targetStory.slug);

      const validation = worktreeService.validateWorktreeForResume(existingWorktreePath, branchName);

      if (!validation.canResume) {
        console.log(c.error('Cannot resume worktree:'));
        validation.issues.forEach(issue => console.log(c.dim(`  ✗ ${issue}`)));

        if (validation.requiresRecreation) {
          const branchExists = !validation.issues.includes('Branch does not exist');
          const dirMissing = validation.issues.includes('Worktree directory does not exist');
          const dirExists = !dirMissing;

          // Case 1: Directory missing but branch exists - recreate worktree from existing branch
          // Case 2: Directory exists but branch missing - recreate with new branch
          if ((branchExists && dirMissing) || (!branchExists && dirExists)) {
            const reason = branchExists
              ? 'Branch exists - automatically recreating worktree directory'
              : 'Directory exists - automatically recreating worktree with new branch';
            console.log(c.dim(`\n✓ ${reason}`));

            try {
              // Remove the old worktree reference if it exists
              const removeResult = spawnSync('git', ['worktree', 'remove', existingWorktreePath, '--force'], {
                cwd: workingDir,
                encoding: 'utf-8',
                shell: false,
                stdio: ['ignore', 'pipe', 'pipe'],
              });

              // Create the worktree at the same path
              // If branch exists, checkout that branch; otherwise create a new branch
              const baseBranch = worktreeService.detectBaseBranch();
              const worktreeAddArgs = branchExists
                ? ['worktree', 'add', existingWorktreePath, branchName]
                : ['worktree', 'add', '-b', branchName, existingWorktreePath, baseBranch];
              const addResult = spawnSync('git', worktreeAddArgs, {
                cwd: workingDir,
                encoding: 'utf-8',
                shell: false,
                stdio: ['ignore', 'pipe', 'pipe'],
              });

              if (addResult.status !== 0) {
                throw new Error(`Failed to recreate worktree: ${addResult.stderr}`);
              }

              // Install dependencies in the recreated worktree
              worktreeService.installDependencies(existingWorktreePath);

              console.log(c.success(`✓ Worktree recreated at ${existingWorktreePath}`));
              getLogger().info('worktree', `Recreated worktree for ${targetStory.frontmatter.id} at ${existingWorktreePath}`);
            } catch (error) {
              console.log(c.error(`Failed to recreate worktree: ${error instanceof Error ? error.message : String(error)}`));
              console.log(c.dim('Please manually remove the worktree_path from the story frontmatter and try again.'));
              return { success: false };
            }
          } else {
            console.log(c.dim('\nWorktree needs manual intervention. Please remove the worktree_path from the story frontmatter and try again.'));
            return { success: false };
          }
        } else {
          return { success: false };
        }
      }

      // Reuse existing worktree
      originalCwd = process.cwd();
      worktreePath = existingWorktreePath;
      process.chdir(worktreePath);
      sdlcRoot = getSdlcRoot();
      worktreeCreated = true;

      // Re-load story from worktree context to get current state
      const worktreeStory = findStoryById(sdlcRoot, targetStory.frontmatter.id);
      if (worktreeStory) {
        targetStory = worktreeStory;
      }

      // Get phase information for resume context
      const lastPhase = getLastCompletedPhase(targetStory);
      const nextPhase = getNextPhase(targetStory);

      // Get worktree status for uncommitted changes info
      const worktreeInfo: WorktreeInfo = {
        path: existingWorktreePath,
        branch: branchName,
        storyId: targetStory.frontmatter.id,
        exists: true,
      };
      const worktreeStatus = worktreeService.getWorktreeStatus(worktreeInfo);

      // Check branch divergence
      const divergence = worktreeService.checkBranchDivergence(branchName);

      console.log(c.success(`✓ Resuming in existing worktree: ${worktreePath}`));
      console.log(c.dim(`  Branch: ${branchName}`));

      if (lastPhase) {
        console.log(c.dim(`  Last completed phase: ${lastPhase}`));
      }

      if (nextPhase) {
        console.log(c.dim(`  Next phase: ${nextPhase}`));
      }

      // Display uncommitted changes if present
      if (worktreeStatus.workingDirectoryStatus !== 'clean') {
        const totalChanges = worktreeStatus.modifiedFiles.length + worktreeStatus.untrackedFiles.length;
        console.log(c.dim(`  Uncommitted changes: ${totalChanges} file(s)`));

        if (worktreeStatus.modifiedFiles.length > 0) {
          console.log(c.dim(`    Modified: ${worktreeStatus.modifiedFiles.slice(0, 3).join(', ')}${worktreeStatus.modifiedFiles.length > 3 ? '...' : ''}`));
        }
        if (worktreeStatus.untrackedFiles.length > 0) {
          console.log(c.dim(`    Untracked: ${worktreeStatus.untrackedFiles.slice(0, 3).join(', ')}${worktreeStatus.untrackedFiles.length > 3 ? '...' : ''}`));
        }
      }

      // Warn if branch has diverged significantly
      if (divergence.diverged && (divergence.ahead > DIVERGENCE_WARNING_THRESHOLD || divergence.behind > DIVERGENCE_WARNING_THRESHOLD)) {
        console.log(c.warning(`  ⚠ Branch has diverged from base: ${divergence.ahead} ahead, ${divergence.behind} behind`));
        console.log(c.dim(`    Consider rebasing to sync with latest changes`));
      }

      console.log();

      // Log resume event
      getLogger().info('worktree', `Resumed worktree for ${targetStory.frontmatter.id} at ${worktreePath}`);
    } else {
      // Create new worktree
      // Resolve worktree base path from config
      let resolvedBasePath: string;
      try {
        resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
      } catch (error) {
        console.log(c.error(`Configuration Error: ${error instanceof Error ? error.message : String(error)}`));
        console.log(c.dim('Fix worktree.basePath in .ai-sdlc.json or remove it to use default location'));
        return { success: false };
      }

      const worktreeService = new GitWorktreeService(workingDir, resolvedBasePath);

      // Check for existing worktree NOT recorded in story frontmatter
      // This catches scenarios where workflow was interrupted after worktree creation
      // but before the story file was updated
      const existingWorktree = worktreeService.findByStoryId(targetStory.frontmatter.id);
      let shouldCreateNewWorktree = !existingWorktree || !existingWorktree.exists;

      if (existingWorktree && existingWorktree.exists) {
        // Handle --clean flag: cleanup and restart
        if (options.clean) {
          console.log(c.warning('Existing worktree found - cleaning up before restart...'));
          console.log();

          const worktreeStatus = worktreeService.getWorktreeStatus(existingWorktree);
          const unpushedResult = worktreeService.hasUnpushedCommits(existingWorktree.path);
          const commitCount = worktreeService.getCommitCount(existingWorktree.path);
          const branchOnRemote = worktreeService.branchExistsOnRemote(existingWorktree.branch);

          // Display summary of what will be deleted
          console.log(c.bold('Cleanup Summary:'));
          console.log(c.dim('─'.repeat(60)));
          console.log(`${c.dim('Worktree Path:')}    ${worktreeStatus.path}`);
          console.log(`${c.dim('Branch:')}          ${worktreeStatus.branch}`);
          console.log(`${c.dim('Total Commits:')}   ${commitCount}`);
          console.log(`${c.dim('Unpushed Commits:')} ${unpushedResult.hasUnpushed ? c.warning(unpushedResult.count.toString()) : c.success('0')}`);
          console.log(`${c.dim('Modified Files:')}  ${worktreeStatus.modifiedFiles.length > 0 ? c.warning(worktreeStatus.modifiedFiles.length.toString()) : c.success('0')}`);
          console.log(`${c.dim('Untracked Files:')} ${worktreeStatus.untrackedFiles.length > 0 ? c.warning(worktreeStatus.untrackedFiles.length.toString()) : c.success('0')}`);
          console.log(`${c.dim('Remote Branch:')}   ${branchOnRemote ? c.warning('EXISTS') : c.dim('none')}`);
          console.log();

          // Warn about data loss
          if (worktreeStatus.modifiedFiles.length > 0 || worktreeStatus.untrackedFiles.length > 0 || unpushedResult.hasUnpushed) {
            console.log(c.error('⚠ WARNING: This will DELETE all uncommitted and unpushed work!'));
            console.log();
          }

          // Check for --force flag to skip confirmation
          const forceCleanup = options.force;
          if (!forceCleanup) {
            // Prompt for confirmation
            const confirmed = await new Promise<boolean>((resolve) => {
              const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
              rl.question(c.warning('Are you sure you want to proceed? (y/N): '), (answer) => {
                rl.close();
                resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
              });
            });

            if (!confirmed) {
              console.log(c.info('Cleanup cancelled.'));
              return { success: false };
            }
          }

          console.log();
          const cleanupSpinner = ora('Cleaning up worktree...').start();

          try {
            // Remove worktree (force remove to handle uncommitted changes)
            const forceRemove = worktreeStatus.modifiedFiles.length > 0 || worktreeStatus.untrackedFiles.length > 0;
            worktreeService.remove(existingWorktree.path, forceRemove);
            cleanupSpinner.text = 'Worktree removed, deleting branch...';

            // Delete local branch
            worktreeService.deleteBranch(existingWorktree.branch, true);

            // Optionally delete remote branch if it exists
            if (branchOnRemote) {
              if (!forceCleanup) {
                cleanupSpinner.stop();
                const deleteRemote = await new Promise<boolean>((resolve) => {
                  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                  rl.question(c.warning('Branch exists on remote. Delete it too? (y/N): '), (answer) => {
                    rl.close();
                    resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
                  });
                });

                if (deleteRemote) {
                  cleanupSpinner.start('Deleting remote branch...');
                  worktreeService.deleteRemoteBranch(existingWorktree.branch);
                }
                cleanupSpinner.start();
              } else {
                // --force provided, skip remote deletion by default (safer)
                cleanupSpinner.text = 'Skipping remote branch deletion (use manual cleanup if needed)';
              }
            }

            // Reset story workflow state
            cleanupSpinner.text = 'Resetting story state...';
            const { resetWorkflowState } = await import('../core/story.js');
            targetStory = await resetWorkflowState(targetStory);

            // Clear workflow checkpoint if exists
            if (hasWorkflowState(sdlcRoot, targetStory.frontmatter.id)) {
              await clearWorkflowState(sdlcRoot, targetStory.frontmatter.id);
            }

            cleanupSpinner.succeed(c.success('✓ Cleanup complete - ready to create fresh worktree'));
            console.log();
          } catch (error) {
            cleanupSpinner.fail(c.error('Cleanup failed'));
            console.log(c.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
            return { success: false };
          }

          // After cleanup, create a fresh worktree
          shouldCreateNewWorktree = true;
        } else {
          // Not cleaning - resume in existing worktree (S-0063 feature)
          getLogger().info('worktree', `Detected existing worktree for ${targetStory.frontmatter.id} at ${existingWorktree.path}`);

          // Validate the existing worktree before resuming
        const branchName = worktreeService.getBranchName(targetStory.frontmatter.id, targetStory.slug);
        const validation = worktreeService.validateWorktreeForResume(existingWorktree.path, branchName);

        if (!validation.canResume) {
          console.log(c.error('Detected existing worktree but cannot resume:'));
          validation.issues.forEach(issue => console.log(c.dim(`  ✗ ${issue}`)));

          if (validation.requiresRecreation) {
            const branchExists = !validation.issues.includes('Branch does not exist');
            const dirMissing = validation.issues.includes('Worktree directory does not exist');
            const dirExists = !dirMissing;

            // Case 1: Directory missing but branch exists - recreate worktree from existing branch
            // Case 2: Directory exists but branch missing - recreate with new branch
            if ((branchExists && dirMissing) || (!branchExists && dirExists)) {
              const reason = branchExists
                ? 'Branch exists - automatically recreating worktree directory'
                : 'Directory exists - automatically recreating worktree with new branch';
              console.log(c.dim(`\n✓ ${reason}`));

              try {
                // Remove the old worktree reference if it exists
                const removeResult = spawnSync('git', ['worktree', 'remove', existingWorktree.path, '--force'], {
                  cwd: workingDir,
                  encoding: 'utf-8',
                  shell: false,
                  stdio: ['ignore', 'pipe', 'pipe'],
                });

                // Create the worktree at the same path
                // If branch exists, checkout that branch; otherwise create a new branch
                const baseBranch = worktreeService.detectBaseBranch();
                const worktreeAddArgs = branchExists
                  ? ['worktree', 'add', existingWorktree.path, branchName]
                  : ['worktree', 'add', '-b', branchName, existingWorktree.path, baseBranch];
                const addResult = spawnSync('git', worktreeAddArgs, {
                  cwd: workingDir,
                  encoding: 'utf-8',
                  shell: false,
                  stdio: ['ignore', 'pipe', 'pipe'],
                });

                if (addResult.status !== 0) {
                  throw new Error(`Failed to recreate worktree: ${addResult.stderr}`);
                }

                // Install dependencies in the recreated worktree
                worktreeService.installDependencies(existingWorktree.path);

                console.log(c.success(`✓ Worktree recreated at ${existingWorktree.path}`));
                getLogger().info('worktree', `Recreated worktree for ${targetStory.frontmatter.id} at ${existingWorktree.path}`);
              } catch (error) {
                console.log(c.error(`Failed to recreate worktree: ${error instanceof Error ? error.message : String(error)}`));
                console.log(c.dim('Please manually remove it with:'));
                console.log(c.dim(`  git worktree remove ${existingWorktree.path}`));
                return { success: false };
              }
            } else {
              console.log(c.dim('\nWorktree needs manual intervention. Please remove it manually with:'));
              console.log(c.dim(`  git worktree remove ${existingWorktree.path}`));
              return { success: false };
            }
          } else {
            return { success: false };
          }
        }

        // Automatically resume in the existing worktree
        originalCwd = process.cwd();
        worktreePath = existingWorktree.path;
        process.chdir(worktreePath);
        sdlcRoot = getSdlcRoot();
        worktreeCreated = true;

        // Update story frontmatter with worktree path (sync state)
        const worktreeStory = findStoryById(sdlcRoot, targetStory.frontmatter.id);
        if (worktreeStory) {
          const updatedStory = await updateStoryField(worktreeStory, 'worktree_path', worktreePath);
          await writeStory(updatedStory);
          targetStory = updatedStory;
        }

        // Get phase information for resume context
        const lastPhase = getLastCompletedPhase(targetStory);
        const nextPhase = getNextPhase(targetStory);

        // Get worktree status for uncommitted changes info
        const worktreeStatus = worktreeService.getWorktreeStatus(existingWorktree);

        // Check branch divergence
        const divergence = worktreeService.checkBranchDivergence(branchName);

        console.log(c.success(`✓ Resuming in existing worktree: ${worktreePath}`));
        console.log(c.dim(`  Branch: ${branchName}`));
        console.log(c.dim(`  (Worktree path synced to story frontmatter)`));

        if (lastPhase) {
          console.log(c.dim(`  Last completed phase: ${lastPhase}`));
        }

        if (nextPhase) {
          console.log(c.dim(`  Next phase: ${nextPhase}`));
        }

        // Display uncommitted changes if present
        if (worktreeStatus.workingDirectoryStatus !== 'clean') {
          const totalChanges = worktreeStatus.modifiedFiles.length + worktreeStatus.untrackedFiles.length;
          console.log(c.dim(`  Uncommitted changes: ${totalChanges} file(s)`));

          if (worktreeStatus.modifiedFiles.length > 0) {
            console.log(c.dim(`    Modified: ${worktreeStatus.modifiedFiles.slice(0, 3).join(', ')}${worktreeStatus.modifiedFiles.length > 3 ? '...' : ''}`));
          }
          if (worktreeStatus.untrackedFiles.length > 0) {
            console.log(c.dim(`    Untracked: ${worktreeStatus.untrackedFiles.slice(0, 3).join(', ')}${worktreeStatus.untrackedFiles.length > 3 ? '...' : ''}`));
          }
        }

        // Warn if branch has diverged significantly
        if (divergence.diverged && (divergence.ahead > DIVERGENCE_WARNING_THRESHOLD || divergence.behind > DIVERGENCE_WARNING_THRESHOLD)) {
          console.log(c.warning(`  ⚠ Branch has diverged from base: ${divergence.ahead} ahead, ${divergence.behind} behind`));
          console.log(c.dim(`    Consider rebasing to sync with latest changes`));
        }

        console.log();
        }
      }

      if (shouldCreateNewWorktree) {
        // Validate git state for worktree creation
        const validation = worktreeService.validateCanCreateWorktree();
        if (!validation.valid) {
          console.log(c.error(`Error: ${validation.error}`));
          return { success: false };
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

          // Change to worktree directory BEFORE updating story
          // This ensures story updates happen in the worktree, not on main
          // (allows parallel story launches from clean main)
          process.chdir(worktreePath);

          // Recalculate sdlcRoot for the worktree context
          sdlcRoot = getSdlcRoot();
          worktreeCreated = true;

          // Now update story frontmatter with worktree path (writes to worktree copy)
          // Re-resolve target story in worktree context
          const worktreeStory = findStoryById(sdlcRoot, targetStory.frontmatter.id);
          if (worktreeStory) {
            const updatedStory = await updateStoryField(worktreeStory, 'worktree_path', worktreePath);
            await writeStory(updatedStory);
            // Update targetStory reference for downstream use
            targetStory = updatedStory;
          }

          console.log(c.success(`✓ Created worktree at: ${worktreePath}`));
          console.log(c.dim(`  Branch: ai-sdlc/${targetStory.frontmatter.id}-${targetStory.slug}`));
          console.log();
        } catch (error) {
          // Restore directory on worktree creation failure
          if (originalCwd) {
            process.chdir(originalCwd);
          }
          console.log(c.error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`));
          return { success: false };
        }
      }
    }
  }

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
  const globalLogger = getLogger();
  const actionStartTime = Date.now();

  // Log action start to global logger
  globalLogger.info('action', `Starting action: ${action.type}`, {
    storyId: action.storyId,
    actionType: action.type,
    storyPath: action.storyPath,
  });

  // Initialize per-story logger
  const maxLogs = config.logging?.maxFiles ?? 5;
  let storyLogger: StoryLogger | null = null;
  let spinner: ReturnType<typeof ora> | null = null;

  try {
    storyLogger = new StoryLogger(action.storyId, sdlcRoot, maxLogs);
    storyLogger.log('INFO', `Starting action: ${action.type} for story ${action.storyId}`);
  } catch (error) {
    // If logger initialization fails, continue without logging (console-only)
    console.warn(`Warning: Failed to initialize logger: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    // Resolve story by ID to get current path (handles moves between folders)
    let resolvedPath: string;
    try {
      const story = getStory(sdlcRoot, action.storyId);
      resolvedPath = story.path;
    } catch (error) {
      const errorMsg = `Error: Story not found for action "${action.type}"`;
      storyLogger?.log('ERROR', errorMsg);
      storyLogger?.log('ERROR', `  Story ID: ${action.storyId}`);
      storyLogger?.log('ERROR', `  Original path: ${action.storyPath}`);
      console.log(c.error(errorMsg));
      console.log(c.dim(`  Story ID: ${action.storyId}`));
      console.log(c.dim(`  Original path: ${action.storyPath}`));
      if (error instanceof Error) {
        storyLogger?.log('ERROR', `  ${error.message}`);
        console.log(c.dim(`  ${error.message}`));
      }
      return { success: false };
    }

    // Update action path if it was stale
    if (resolvedPath !== action.storyPath) {
      storyLogger?.log('WARN', `Note: Story path updated (file was moved)`);
      storyLogger?.log('WARN', `  From: ${action.storyPath}`);
      storyLogger?.log('WARN', `  To: ${resolvedPath}`);
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
      plan_review_complete: storyBeforeAction.frontmatter.plan_review_complete ?? false,
      implementation_complete: storyBeforeAction.frontmatter.implementation_complete,
      reviews_complete: storyBeforeAction.frontmatter.reviews_complete,
      status: storyBeforeAction.frontmatter.status,
    };

    spinner = ora(formatAction(action, true, c)).start();
    const baseText = formatAction(action, true, c);

    // Create agent progress callback for real-time updates
    const onAgentProgress = (event: { type: string; toolName?: string; sessionId?: string }) => {
      if (!spinner) return; // Guard against null spinner
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

      case 'plan_review':
        const { runPlanReviewAgent } = await import('../agents/plan-review.js');
        result = await runPlanReviewAgent(action.storyPath, sdlcRoot, { onProgress: onAgentProgress });
        break;

      case 'implement':
        const { runImplementationAgent } = await import('../agents/implementation.js');
        result = await runImplementationAgent(action.storyPath, sdlcRoot, { onProgress: onAgentProgress });
        break;

      case 'review':
        const { runReviewAgent } = await import('../agents/review.js');
        result = await runReviewAgent(action.storyPath, sdlcRoot, {
          onVerificationProgress: (phase, status, message) => {
            if (!spinner) return; // Guard against null spinner
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

        // Auto-complete story if review was approved
        if (result && result.success) {
          const reviewResult = result as ReviewResult;
          let story = parseStory(action.storyPath);
          story = await autoCompleteStoryAfterReview(story, config, reviewResult);

          // Log auto-completion if it occurred
          if (reviewResult.decision === ReviewDecision.APPROVED && config.reviewConfig.autoCompleteOnApproval) {
            // Reset implementation retry count on successful review approval
            await resetImplementationRetryCount(story);
            storyLogger?.log('INFO', 'Implementation retry count reset after review approval');

            spinner.text = c.success('Review approved - auto-completing story');
            storyLogger?.log('INFO', `Story auto-completed after review approval: "${story.frontmatter.title}"`);

            // Auto-create PR in automated mode
            const workflowState = await loadWorkflowState(sdlcRoot, story.frontmatter.id);
            const isAutoMode = workflowState?.context.options.auto ?? false;

            if (isAutoMode || config.reviewConfig.autoCreatePROnApproval) {
              try {
                // Create PR (this will automatically commit any uncommitted changes)
                spinner.text = c.dim('Creating pull request...');
                const { createPullRequest } = await import('../agents/review.js');
                const prResult = await createPullRequest(action.storyPath, sdlcRoot);

                if (prResult.success) {
                  spinner.text = c.success('Review approved - PR created');
                  storyLogger?.log('INFO', `PR created successfully for ${story.frontmatter.id}`);
                } else {
                  // PR creation failed - mark as blocked
                  const { updateStoryStatus } = await import('../core/story.js');
                  const blockedStory = await updateStoryStatus(story, 'blocked');
                  await writeStory(blockedStory);
                  spinner.text = c.warning('Review approved but PR creation failed - story marked as blocked');
                  storyLogger?.log('WARN', `PR creation failed for ${story.frontmatter.id}: ${prResult.error || 'Unknown error'}`);
                }
              } catch (error) {
                // Error during PR creation - mark as blocked
                const { updateStoryStatus } = await import('../core/story.js');
                const blockedStory = await updateStoryStatus(story, 'blocked');
                await writeStory(blockedStory);
                const errorMsg = error instanceof Error ? error.message : String(error);
                spinner.text = c.warning(`Review approved but auto-PR failed: ${errorMsg}`);
                storyLogger?.log('ERROR', `Auto-PR failed for ${story.frontmatter.id}: ${errorMsg}`);
              }
            }

            // Handle worktree cleanup if story has a worktree
            if (story.frontmatter.worktree_path) {
              await handleWorktreeCleanup(story, config, c);
            }
          }
        }
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
        const { updateStoryStatus, markStoryComplete } = await import('../core/story.js');
        const storyToMove = parseStory(action.storyPath);
        // FIX: For manual move to done, ensure completion flags are set first
        // This is a user-initiated action so we trust they want to mark it complete
        const completedStory = await markStoryComplete(storyToMove);
        const updatedStory = await updateStoryStatus(completedStory, 'done');
        result = {
          success: true,
          story: updatedStory,
          changesMade: ['Marked story complete and updated status to done'],
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
    const actionDuration = Date.now() - actionStartTime;
    if (result && !result.success) {
      spinner.fail(c.error(`Failed: ${formatAction(action, true, c)}`));
      storyLogger?.log('ERROR', `Action failed: ${formatAction(action, false, c)}`);
      globalLogger.warn('action', `Action failed: ${action.type}`, {
        storyId: action.storyId,
        actionType: action.type,
        durationMs: actionDuration,
        error: result.error,
      });
      if (result.error) {
        storyLogger?.log('ERROR', `  Error: ${result.error}`);
        console.error(c.error(`  Error: ${result.error}`));
      }
      return { success: false };
    }

    spinner.succeed(c.success(formatAction(action, true, c)));
    storyLogger?.log('INFO', `Action completed successfully: ${formatAction(action, false, c)}`);
    globalLogger.info('action', `Action completed: ${action.type}`, {
      storyId: action.storyId,
      actionType: action.type,
      durationMs: actionDuration,
      changesCount: result?.changesMade?.length ?? 0,
    });

    // Show changes made
    if (result && result.changesMade.length > 0) {
      for (const change of result.changesMade) {
        storyLogger?.log('INFO', `  → ${change}`);
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
          case 'plan_review':
            // Plan review completes when plan_review_complete transitions from false to true
            phaseJustCompleted = !prevPhaseState.plan_review_complete && (story.frontmatter.plan_review_complete ?? false);
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
    const exceptionDuration = Date.now() - actionStartTime;
    if (spinner) {
      spinner.fail(c.error(`Failed: ${formatAction(action, true, c)}`));
    } else {
      console.error(c.error(`Failed: ${formatAction(action, true, c)}`));
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    storyLogger?.log('ERROR', `Exception during action execution: ${errorMessage}`);
    globalLogger.error('action', `Action exception: ${action.type}`, {
      storyId: action.storyId,
      actionType: action.type,
      durationMs: exceptionDuration,
      error: errorMessage,
    });
    console.error(error);

    // Show phase checklist with error indication (if file still exists)
    try {
      const story = parseStory(action.storyPath);
      console.log(c.dim(`  Progress: ${renderPhaseChecklist(story, c)}`));
      // Update story with error
      story.frontmatter.last_error = errorMessage;
    } catch {
      // File may have been moved - skip progress display
    }
    // Don't throw - let the workflow continue if in auto mode
    return { success: false };
  } finally {
    // Always close logger, even if action fails or throws
    storyLogger?.close();
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
    case 'plan_review':
      return {
        name: 'Plan Review',
        icon: '📝',
        iconAscii: '[PR]',
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
    plan_review: 'Plan Review',
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
export async function unblock(storyId: string, options?: { resetRetries?: boolean }): Promise<void> {
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
    const unblockedStory = await unblockStory(storyId, sdlcRoot, options);

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
  // Sanitize message to prevent terminal injection attacks
  // Use consistent sanitizeForDisplay() for all terminal output
  const sanitizedMessage = sanitizeForDisplay(message);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(sanitizedMessage + ' (y/N): ', (answer) => {
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
    const updated = await updateStoryField(story, 'worktree_path', undefined);
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

    const updated = await updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updated);
    console.log(c.success('  ✓ Worktree removed'));
  } catch (error) {
    console.log(c.warning(`  Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`));
    // Clear frontmatter anyway (user may have manually deleted)
    const updated = await updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updated);
  }
}

/**
 * Security: Escape shell arguments for safe use in commands
 * For use with execSync when shell execution is required
 * @internal Exported for testing
 */
export function escapeShellArg(arg: string): string {
  // Replace single quotes with '\'' and wrap in single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`;
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
    const updatedStory = await updateStoryField(story, 'worktree_path', worktreePath);
    const branchName = service.getBranchName(story.frontmatter.id, story.slug);
    const storyWithBranch = await updateStoryField(updatedStory, 'branch', branchName);
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
    const updatedStory = await updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updatedStory);

    spinner.succeed(c.success(`Removed worktree for ${story.frontmatter.id}`));
    console.log(c.dim(`  Path: ${worktreePath}`));
  } catch (error) {
    console.log(c.error(`Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// Export the GitHub integration commands
export { importIssue, linkIssue };
