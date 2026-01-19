import { Story } from '../types/index.js';
import * as readline from 'readline';

/**
 * Result summary for batch processing operation
 */
export interface BatchResult {
  /** Total number of stories in the batch */
  total: number;
  /** Number of stories that completed successfully */
  succeeded: number;
  /** Number of stories that failed during processing */
  failed: number;
  /** Number of stories that were skipped (e.g., already done) */
  skipped: number;
  /** List of errors encountered during batch processing */
  errors: Array<{ storyId: string; error: string }>;
  /** Total execution time in milliseconds */
  duration: number;
}

/**
 * Options for batch processing
 */
export interface BatchOptions {
  /** Preview actions without executing them */
  dryRun?: boolean;
  /** Create isolated git worktrees for each story */
  worktree?: boolean;
  /** Skip git validation and conflict checks */
  force?: boolean;
}

/**
 * Internal progress tracking for batch processing
 */
export interface BatchProgress {
  /** Current story index (0-based) */
  currentIndex: number;
  /** Total number of stories in batch */
  total: number;
  /** Current story being processed */
  currentStory: Story | null;
}

/**
 * Format batch progress header for a story
 * Example: [1/3] Processing: S-001 - Add user authentication
 */
export function formatBatchProgress(progress: BatchProgress): string {
  const { currentIndex, total, currentStory } = progress;
  const position = `[${currentIndex + 1}/${total}]`;

  if (!currentStory) {
    return `${position} Processing story...`;
  }

  const storyId = currentStory.frontmatter.id;
  const title = currentStory.frontmatter.title;

  return `${position} Processing: ${storyId} - ${title}`;
}

/**
 * Format final batch summary
 */
export function formatBatchSummary(result: BatchResult): string[] {
  const lines: string[] = [];
  const { total, succeeded, failed, skipped, duration } = result;

  lines.push('');
  lines.push('═══ Batch Processing Summary ═══');
  lines.push('');
  lines.push(`Total stories:     ${total}`);
  lines.push(`✓ Succeeded:       ${succeeded}`);

  if (failed > 0) {
    lines.push(`✗ Failed:          ${failed}`);
  }

  if (skipped > 0) {
    lines.push(`⊘ Skipped:         ${skipped}`);
  }

  const durationSec = (duration / 1000).toFixed(1);
  lines.push(`⏱  Execution time: ${durationSec}s`);

  if (result.errors.length > 0) {
    lines.push('');
    lines.push('Failed stories:');
    for (const error of result.errors) {
      lines.push(`  - ${error.storyId}: ${error.error}`);
    }
  }

  lines.push('');

  return lines;
}

/**
 * Log completion message for an individual story
 */
export function logStoryCompletion(storyId: string, success: boolean, c: any): void {
  if (success) {
    console.log(c.success(`   ✓ Completed: ${storyId}`));
  } else {
    console.log(c.error(`   ✗ Failed: ${storyId}`));
  }
}

/**
 * Prompt user whether to continue after a story failure
 * Returns true to continue, false to abort
 *
 * In non-interactive mode (no TTY), always returns false (abort)
 */
export async function promptContinueOnError(storyId: string, c: any): Promise<boolean> {
  // Non-interactive mode: always abort
  if (!process.stdin.isTTY) {
    console.log();
    console.log(c.dim('Non-interactive mode: aborting batch processing'));
    return false;
  }

  // Interactive mode: prompt user
  console.log();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question(c.dim(`Story ${storyId} failed. Continue to next story? [y/N]: `), (ans) => {
      rl.close();
      resolve(ans.toLowerCase().trim());
    });
  });

  return answer === 'y' || answer === 'yes';
}

// Note: The main processBatch function has been moved to commands.ts
// to avoid circular dependencies. This module only exports utility functions.
