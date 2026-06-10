/**
 * Epic and story discovery
 */

import { findStoriesByEpic } from '../../core/kanban.js';
import type { Story } from '../../types/index.js';

/**
 * Normalize epic ID by stripping 'epic-' prefix if present
 * Both 'epic-foo' and 'foo' become 'foo'
 */
export function normalizeEpicId(epicId: string): string {
  return epicId.startsWith('epic-') ? epicId.slice(5) : epicId;
}

/**
 * Discover stories for an epic with normalized ID
 * Filters out stories that are already done
 */
export function discoverEpicStories(sdlcRoot: string, epicId: string): Story[] {
  const normalized = normalizeEpicId(epicId);
  const stories = findStoriesByEpic(sdlcRoot, normalized);

  // Filter out stories that are already done
  const activeStories = stories.filter(story => story.frontmatter.status !== 'done');

  // Sort by priority (ascending) then created date (ascending)
  return activeStories.sort((a, b) => {
    if (a.frontmatter.priority !== b.frontmatter.priority) {
      return a.frontmatter.priority - b.frontmatter.priority;
    }
    return a.frontmatter.created.localeCompare(b.frontmatter.created);
  });
}
