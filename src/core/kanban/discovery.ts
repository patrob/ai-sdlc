import fs from 'fs';
import { glob } from 'glob';
import path from 'path';

import { KANBAN_FOLDERS, type KanbanFolder, STORIES_FOLDER, type Story, type StoryStatus } from '../../types/index.js';
import { parseStory } from '../story.js';
import { GitWorktreeService } from '../worktree.js';

/**
 * Load stories from active worktrees.
 * Returns a map of story ID to story object for all stories found in worktrees.
 * Handles missing files, parse errors, and deleted worktrees gracefully with logging.
 *
 * @param sdlcRoot - Path to .ai-sdlc folder
 * @returns Map of story ID to story object from worktrees
 */
export function loadStoriesFromWorktrees(sdlcRoot: string): Map<string, Story> {
  const worktreeMap = new Map<string, Story>();

  try {
    // Determine worktree base path and project root
    // Resolve to absolute paths since git worktree list returns absolute paths
    const projectRoot = path.resolve(path.dirname(sdlcRoot));
    const worktreeBasePath = path.resolve(path.join(sdlcRoot, 'worktrees'));

    // Get list of active worktrees
    const worktreeService = new GitWorktreeService(projectRoot, worktreeBasePath);
    const worktrees = worktreeService.list();

    for (const worktree of worktrees) {
      // Skip worktrees that don't exist on filesystem
      if (!worktree.exists) {
        continue;
      }

      // Skip worktrees without a story ID
      if (!worktree.storyId) {
        continue;
      }

      // Construct expected story path in worktree
      // Pattern: {worktreePath}/{sdlcFolderName}/stories/{storyId}/story.md
      // The worktree contains a full copy of the repo, so we need to include the .ai-sdlc folder
      const sdlcFolderName = path.basename(sdlcRoot);
      const storyPath = path.join(worktree.path, sdlcFolderName, STORIES_FOLDER, worktree.storyId, 'story.md');

      // Check if story file exists
      if (!fs.existsSync(storyPath)) {
        console.warn(`Worktree story file missing for ${worktree.storyId}: ${storyPath}`);
        continue;
      }

      try {
        // Parse the story from worktree
        const canonicalPath = fs.realpathSync(storyPath);
        const story = parseStory(canonicalPath);
        worktreeMap.set(worktree.storyId, { ...story, path: canonicalPath });
      } catch (err) {
        // Log parse error and continue
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Failed to parse worktree story ${worktree.storyId} at ${storyPath}: ${errorMsg}`);
        continue;
      }
    }
  } catch (err) {
    // If worktree listing fails, log error but return empty map (graceful fallback)
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Failed to load worktree stories: ${errorMsg}`);
  }

  return worktreeMap;
}

/**
 * Merge main repository stories with worktree stories.
 * Worktree versions take precedence over main repo versions for the same story ID.
 *
 * @param mainStories - Stories from main repository
 * @param worktreeStories - Map of story ID to story from worktrees
 * @returns Merged array of stories with worktree versions prioritized
 */
export function mergeStories(mainStories: Story[], worktreeStories: Map<string, Story>): Story[] {
  const merged: Story[] = [];

  for (const mainStory of mainStories) {
    const storyId = mainStory.frontmatter.id;

    // Check if worktree version exists
    if (worktreeStories.has(storyId)) {
      // Use worktree version (more up-to-date)
      merged.push(worktreeStories.get(storyId)!);
    } else {
      // Use main repo version
      merged.push(mainStory);
    }
  }

  return merged;
}

/**
 * Find all stories in the stories/ folder structure
 * Globs stories/*​/story.md and returns all story objects
 * Skips malformed folders (folders without story.md)
 */
export function findAllStories(sdlcRoot: string): Story[] {
  const storiesFolder = path.join(sdlcRoot, STORIES_FOLDER);

  if (!fs.existsSync(storiesFolder)) {
    return [];
  }

  const mainStories: Story[] = [];
  const pattern = path.join(storiesFolder, '*', 'story.md');

  try {
    const storyPaths = glob.sync(pattern);

    for (const storyPath of storyPaths) {
      try {
        const canonicalPath = fs.realpathSync(storyPath);
        const story = parseStory(canonicalPath);
        mainStories.push({ ...story, path: canonicalPath });
      } catch (_err) {
        // Skip malformed stories or symlinks that can't be resolved
        continue;
      }
    }
  } catch (_err) {
    // If glob fails, return empty array
    return [];
  }

  // Load stories from active worktrees
  const worktreeStories = loadStoriesFromWorktrees(sdlcRoot);

  // Merge: worktree version takes precedence
  return mergeStories(mainStories, worktreeStories);
}

/**
 * Find stories by frontmatter status
 * Filters stories by frontmatter status and sorts by priority ascending
 */
export function findStoriesByStatus(sdlcRoot: string, status: StoryStatus): Story[] {
  const allStories = findAllStories(sdlcRoot);

  return allStories
    .filter(story => story.frontmatter.status === status)
    .sort((a, b) => {
      // Sort by priority ascending
      if (a.frontmatter.priority !== b.frontmatter.priority) {
        return a.frontmatter.priority - b.frontmatter.priority;
      }
      // Tiebreaker: sort by creation date
      return a.frontmatter.created.localeCompare(b.frontmatter.created);
    });
}

/**
 * Get all stories in a specific kanban folder
 * @deprecated Use findStoriesByStatus() instead
 */
export function getStoriesInFolder(sdlcRoot: string, folder: KanbanFolder): Story[] {
  console.warn('getStoriesInFolder() is deprecated. Use findStoriesByStatus() instead.');

  const folderPath = path.join(sdlcRoot, folder);

  if (!fs.existsSync(folderPath)) {
    return [];
  }

  const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));

  return files
    .map(f => parseStory(path.join(folderPath, f)))
    .sort((a, b) => a.frontmatter.priority - b.frontmatter.priority);
}

/**
 * Get all stories across all kanban folders
 * In new architecture, uses findAllStories() and groups by status
 */
export function getAllStories(sdlcRoot: string): Map<KanbanFolder, Story[]> {
  const stories = new Map<KanbanFolder, Story[]>();

  // Initialize empty arrays for each folder
  for (const folder of KANBAN_FOLDERS) {
    stories.set(folder, []);
  }

  // Get all stories and group by status
  const allStories = findAllStories(sdlcRoot);
  for (const story of allStories) {
    const status = story.frontmatter.status;
    // Only add to map if status matches a kanban folder (exclude 'blocked')
    if (status === 'backlog' || status === 'ready' || status === 'in-progress' || status === 'done') {
      const folder = status as KanbanFolder;
      const folderStories = stories.get(folder) || [];
      folderStories.push(story);
      stories.set(folder, folderStories);
    }
  }

  // Sort each folder's stories by priority
  for (const [folder, folderStories] of stories.entries()) {
    folderStories.sort((a, b) => {
      if (a.frontmatter.priority !== b.frontmatter.priority) {
        return a.frontmatter.priority - b.frontmatter.priority;
      }
      return a.frontmatter.created.localeCompare(b.frontmatter.created);
    });
    stories.set(folder, folderStories);
  }

  return stories;
}

/**
 * Find a story by slug across all folders
 */
export function findStoryBySlug(sdlcRoot: string, slug: string): Story | null {
  const allStories = findAllStories(sdlcRoot);
  return allStories.find(s => s.slug === slug) || null;
}
