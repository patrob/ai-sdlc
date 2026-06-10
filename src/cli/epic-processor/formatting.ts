/**
 * Epic summary formatting and display
 */

import type { EpicSummary, PhaseExecutionResult, Story } from '../../types/index.js';

/**
 * Format execution plan for display
 */
export function formatExecutionPlan(epicId: string, phases: Story[][]): string {
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
 * Generate final epic summary
 */
export function generateEpicSummary(
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
export function printEpicSummary(summary: EpicSummary, chalk: any): void {
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
