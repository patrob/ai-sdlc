import { loadConfig } from '../../core/config.js';
import { getStory } from '../../core/story.js';
import { getThemedChalk } from '../../core/theme.js';
import type { Story } from '../../types/index.js';
import { run } from './run.js';

/**
 * Process multiple stories sequentially through full SDLC
 * Internal function used by batch mode
 */
export async function processBatchInternal(
  storyIds: string[],
  sdlcRoot: string,
  options: { dryRun?: boolean; worktree?: boolean; force?: boolean }
): Promise<{ total: number; succeeded: number; failed: number; skipped: number; errors: Array<{ storyId: string; error: string }>; duration: number }> {
  const startTime = Date.now();
  const config = loadConfig();
  const c = getThemedChalk(config);
  const { formatBatchProgress, formatBatchSummary, logStoryCompletion, promptContinueOnError } = await import('../batch-processor.js');

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
