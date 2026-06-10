import { type GitValidationResult } from '../../core/git-utils.js';
import { type WorktreeStatus } from '../../core/worktree.js';
import type { Action, ActionType, Story } from '../../types/index.js';

/**
 * Branch divergence threshold for warnings
 * When a worktree branch has diverged by more than this number of commits
 * from the base branch (ahead or behind), a warning will be displayed
 * suggesting the user rebase to sync with latest changes.
 */
export const DIVERGENCE_WARNING_THRESHOLD = 10;

/**
 * ANSI escape sequence patterns for sanitization
 */
const ANSI_CSI_PATTERN = /\x1B\[[0-9;]*[a-zA-Z]/g;
const ANSI_OSC_BEL_PATTERN = /\x1B\][^\x07]*\x07/g;
const ANSI_OSC_ESC_PATTERN = /\x1B\][^\x1B]*\x1B\\/g;
const ANSI_SINGLE_CHAR_PATTERN = /\x1B./g;
const CONTROL_CHARS_PATTERN = /[\x00-\x1F\x7F-\x9F]/g;

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
  targetStory: any | null
): boolean {
  if (options.worktree === false) return false;
  if (options.worktree === true) return true;
  if (targetStory?.frontmatter.worktree_path) return true;
  return worktreeConfig.enabled;
}

/**
 * Validates flag combinations for --auto --story --step conflicts
 * @throws Error if conflicting flags are detected
 */
export function validateAutoStoryOptions(options: { auto?: boolean; story?: string; step?: string }): void {
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
export function validateBatchOptions(options: { batch?: string; story?: string; watch?: boolean; continue?: boolean }): void {
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
export function shouldExecutePhase(story: Story, phase: ActionType): boolean {
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
export function generateFullSDLCActions(story: Story, c?: any): Action[] {
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
export const GIT_MODIFYING_ACTIONS: ActionType[] = ['implement', 'review', 'create_pr'];

/**
 * Check if any actions in the list require git validation
 */
export function requiresGitValidation(actions: Action[]): boolean {
  return actions.some(action => GIT_MODIFYING_ACTIONS.includes(action.type));
}

/**
 * Display git validation errors and warnings
 */
export function displayGitValidationResult(result: GitValidationResult, c: any): void {
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
export function displayExistingWorktreeInfo(status: WorktreeStatus, c: any): void {
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
export function sanitizeForDisplay(str: string): string {
  const cleaned = str
    .replace(ANSI_CSI_PATTERN, '')       // CSI sequences (e.g., \x1B[31m)
    .replace(ANSI_OSC_BEL_PATTERN, '')   // OSC with BEL terminator (e.g., \x1B]...\x07)
    .replace(ANSI_OSC_ESC_PATTERN, '')   // OSC with ESC\ terminator (e.g., \x1B]...\x1B\\)
    .replace(ANSI_SINGLE_CHAR_PATTERN, '') // Single-char escapes (e.g., \x1BH)
    .replace(CONTROL_CHARS_PATTERN, ''); // Control characters (0x00-0x1F, 0x7F-0x9F)

  // Truncate extremely long strings (DoS protection)
  return cleaned.length > 500 ? cleaned.slice(0, 497) + '...' : cleaned;
}
