import fs from 'fs';
import ora from 'ora';
import path from 'path';

import { getSdlcRoot, loadConfig } from '../../core/config.js';
import { kanbanExists } from '../../core/kanban.js';
import { getStory, unblockStory, updateStoryField,writeStory } from '../../core/story.js';
import { getThemedChalk } from '../../core/theme.js';
import { migrateToFolderPerStory } from './migrate.js';

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

/**
 * Approve a story that is awaiting human approval.
 * Sets an approval marker on the story and emits an event.
 */
export async function approve(storyId: string): Promise<void> {
  const config = loadConfig();
  const c = getThemedChalk(config);
  const sdlcRoot = getSdlcRoot();

  if (!kanbanExists(sdlcRoot)) {
    console.log(c.warning('ai-sdlc not initialized. Run `ai-sdlc init` first.'));
    return;
  }

  try {
    const story = getStory(sdlcRoot, storyId);
    await updateStoryField(story, 'plan_review_complete', true);
    console.log(c.success(`Approved story ${storyId}: "${story.frontmatter.title}"`));

    // Emit event via EventBus (lazy import to avoid circular)
    const { getEventBus } = await import('../../core/event-bus.js');
    getEventBus().emit({
      type: 'story_phase_change',
      storyId: story.frontmatter.id,
      fromPhase: 'awaiting_approval',
      toPhase: 'approved',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(c.error(`Failed to approve story: ${message}`));
    process.exit(1);
  }
}

/**
 * Provide human feedback on a story.
 * Appends feedback to the story's review section and emits an event.
 */
export async function feedback(storyId: string, feedbackText: string): Promise<void> {
  const config = loadConfig();
  const c = getThemedChalk(config);
  const sdlcRoot = getSdlcRoot();

  if (!kanbanExists(sdlcRoot)) {
    console.log(c.warning('ai-sdlc not initialized. Run `ai-sdlc init` first.'));
    return;
  }

  try {
    const story = getStory(sdlcRoot, storyId);

    // Append feedback to story content
    const feedbackEntry = `\n\n## Human Feedback (${new Date().toISOString()})\n\n${feedbackText}\n`;
    const updatedContent = story.content + feedbackEntry;
    await writeStory({ ...story, content: updatedContent });

    console.log(c.success(`Feedback recorded for story ${storyId}: "${story.frontmatter.title}"`));

    // Emit event
    const { getEventBus } = await import('../../core/event-bus.js');
    getEventBus().emit({
      type: 'story_phase_change',
      storyId: story.frontmatter.id,
      fromPhase: 'awaiting_feedback',
      toPhase: 'feedback_received',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(c.error(`Failed to record feedback: ${message}`));
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
