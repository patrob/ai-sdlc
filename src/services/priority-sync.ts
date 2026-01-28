/**
 * Service for syncing story priority from external ticketing systems.
 */

import { Story } from '../types/index.js';
import { TicketProvider } from './ticket-provider/types.js';
import { updateStoryField } from '../core/story.js';

/**
 * Sync priority for a single story from its ticket provider.
 * Updates the story's priority and priority_source fields if a priority is returned.
 *
 * @param story - Story to sync priority for
 * @param provider - Ticket provider to use for syncing
 * @returns Updated story if priority was synced, null if no sync needed
 */
export async function syncStoryPriority(
  story: Story,
  provider: TicketProvider
): Promise<Story | null> {
  // Only sync if story has a ticket ID and provider supports priority sync
  if (!story.frontmatter.ticket_id || !provider.syncPriority) {
    return null;
  }

  try {
    const priority = await provider.syncPriority(story.frontmatter.ticket_id);

    // If priority is null, the ticket is not in a project - keep local priority
    if (priority === null) {
      return null;
    }

    // Update priority if it changed
    if (story.frontmatter.priority !== priority) {
      await updateStoryField(story, 'priority', priority);
      await updateStoryField(story, 'priority_source', 'github-project');
      await updateStoryField(story, 'ticket_synced_at', new Date().toISOString());
      return story;
    }

    // Priority unchanged, but update sync timestamp
    if (story.frontmatter.priority_source !== 'github-project') {
      await updateStoryField(story, 'priority_source', 'github-project');
    }
    await updateStoryField(story, 'ticket_synced_at', new Date().toISOString());

    return story;
  } catch (error) {
    // Log error but don't throw - gracefully continue with local priority
    console.warn(
      `Failed to sync priority for story ${story.slug}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Sync priority for multiple stories.
 * Continues on individual failures to ensure all stories are attempted.
 *
 * @param stories - Stories to sync priority for
 * @param provider - Ticket provider to use for syncing
 * @param onProgress - Optional callback for progress updates
 * @returns Number of successfully synced stories
 */
export async function syncAllStoriesPriority(
  stories: Story[],
  provider: TicketProvider,
  onProgress?: (current: number, total: number, story: Story) => void
): Promise<number> {
  let syncedCount = 0;

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];

    if (onProgress) {
      onProgress(i + 1, stories.length, story);
    }

    const updated = await syncStoryPriority(story, provider);
    if (updated) {
      syncedCount++;
    }
  }

  return syncedCount;
}
