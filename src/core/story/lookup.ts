import fs from 'fs';
import path from 'path';
import { Story, StoryStatus, STORIES_FOLDER, STORY_FILENAME, BLOCKED_DIR } from '../../types/index.js';
import { parseStory, writeStory } from './io.js';

/**
 * Sanitize story ID for safe path construction.
 * Prevents path traversal attacks by rejecting dangerous characters.
 *
 * SECURITY: This function is CRITICAL for preventing path traversal vulnerabilities.
 * Use this before constructing ANY file paths with user-provided story IDs.
 *
 * @param storyId - Story ID to sanitize (e.g., 'S-0001')
 * @returns Sanitized story ID safe for path construction
 * @throws Error if storyId contains dangerous characters or patterns
 */
export function sanitizeStoryId(storyId: string): string {
  if (!storyId) {
    throw new Error('Story ID cannot be empty');
  }

  // Reject path traversal attempts
  if (storyId.includes('..')) {
    throw new Error('Invalid story ID: contains path traversal sequence (..)');
  }

  // Reject path separators
  if (storyId.includes('/') || storyId.includes('\\')) {
    throw new Error('Invalid story ID: contains path separator');
  }

  // Reject absolute paths
  if (path.isAbsolute(storyId)) {
    throw new Error('Invalid story ID: cannot be an absolute path');
  }

  // Reject control characters and other dangerous characters
  if (/[\x00-\x1F\x7F]/.test(storyId)) {
    throw new Error('Invalid story ID: contains control characters');
  }

  return storyId;
}

/**
 * Sanitize user-controlled text for safe display and storage.
 * Removes ANSI escape sequences, control characters, and potential injection vectors.
 * Truncates to 200 characters maximum.
 */
export function sanitizeReasonText(text: string): string {
  if (!text) return '';

  let sanitized = text
    // Remove ANSI CSI sequences (colors, cursor movement) - e.g., \x1B[31m
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    // Remove OSC sequences (hyperlinks, window titles) - terminated by BEL (\x07) or ST (\x1B\\)
    .replace(/\x1B\][^\x07]*\x07/g, '')
    .replace(/\x1B\][^\x1B]*\x1B\\/g, '')
    // Remove any remaining standalone escape characters
    .replace(/\x1B/g, '')
    // Replace newlines and tabs with spaces
    .replace(/[\n\r\t]/g, ' ')
    // Remove potential markdown injection characters
    .replace(/[`|>]/g, '')
    // Remove remaining control characters (0x00-0x1F except newline/tab already handled, and 0x7F-0x9F)
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');

  // Normalize Unicode to prevent homograph attacks
  sanitized = sanitized.normalize('NFC');

  // Truncate to prevent storage bloat
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 197) + '...';
  }

  return sanitized.trim();
}

/**
 * Find a story by ID using O(1) direct path lookup
 * Falls back to searching old folder structure for backwards compatibility
 *
 * This function is the internal lookup mechanism. Use getStory() for external access.
 *
 * @param sdlcRoot - Root directory of the SDLC workspace
 * @param storyId - Story ID (e.g., 'S-0001')
 * @returns Story object or null if not found
 */
export function findStoryById(sdlcRoot: string, storyId: string): Story | null {
  // SECURITY: Validate storyId format (defense-in-depth)
  // Reject any input that could be used for path traversal
  if (
    !storyId ||
    storyId.includes('..') ||
    storyId.includes('/') ||
    storyId.includes('\\') ||
    path.isAbsolute(storyId)
  ) {
    return null;
  }

  // Check worktrees first (worktree version is more up-to-date)
  const worktreesFolder = path.join(sdlcRoot, 'worktrees');
  if (fs.existsSync(worktreesFolder)) {
    try {
      const worktreeDirs = fs.readdirSync(worktreesFolder, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      const sdlcFolderName = path.basename(sdlcRoot);
      for (const wtDir of worktreeDirs) {
        // Scan story directories to get correct filesystem casing
        // (realpathSync does NOT canonicalize casing on macOS)
        const wtStoriesFolder = path.join(worktreesFolder, wtDir, sdlcFolderName, STORIES_FOLDER);
        if (!fs.existsSync(wtStoriesFolder)) continue;

        const storyDirs = fs.readdirSync(wtStoriesFolder, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);

        const actualDir = storyDirs.find(d => d.toLowerCase() === storyId.toLowerCase());
        if (!actualDir) continue;

        const wtStoryPath = path.join(wtStoriesFolder, actualDir, STORY_FILENAME);
        if (fs.existsSync(wtStoryPath)) {
          const canonicalPath = fs.realpathSync(wtStoryPath);
          const story = parseStory(canonicalPath);
          if (story.frontmatter.id?.toLowerCase() === storyId.toLowerCase()) {
            return { ...story, path: canonicalPath };
          }
        }
      }
    } catch {
      // Fall through to main stories folder
    }
  }

  // O(n) directory scan for case-insensitive matching in new architecture
  // Reads all story directories to find case-insensitive match
  // Note: fs.realpathSync() does NOT canonicalize casing on macOS, so we must scan
  const storiesFolder = path.join(sdlcRoot, STORIES_FOLDER);

  if (fs.existsSync(storiesFolder)) {
    try {
      // Read actual directory names from filesystem
      const directories = fs.readdirSync(storiesFolder, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      // Find directory that matches case-insensitively
      const actualDirName = directories.find(
        dir => dir.toLowerCase() === storyId.toLowerCase()
      );

      if (actualDirName) {
        // Use the actual directory name (with correct filesystem casing)
        const storyPath = path.join(storiesFolder, actualDirName, STORY_FILENAME);

        if (fs.existsSync(storyPath)) {
          const canonicalPath = fs.realpathSync(storyPath);
          const story = parseStory(canonicalPath);
          return { ...story, path: canonicalPath };
        }
      }
    } catch (err) {
      // If reading directory fails, fall through to fallback search
    }
  }

  // Fallback: search old folder structure for backwards compatibility
  // Search kanban folders first
  const KANBAN_FOLDERS: ('backlog' | 'ready' | 'in-progress' | 'done')[] = ['backlog', 'ready', 'in-progress', 'done'];
  for (const folder of KANBAN_FOLDERS) {
    const folderPath = path.join(sdlcRoot, folder);
    if (!fs.existsSync(folderPath)) {
      continue;
    }

    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      try {
        const canonicalPath = fs.realpathSync(filePath);
        const story = parseStory(canonicalPath);
        // Case-insensitive comparison to match input
        if (story.frontmatter.id?.toLowerCase() === storyId.toLowerCase()) {
          return { ...story, path: canonicalPath };
        }
      } catch (err) {
        continue;
      }
    }
  }

  // Also search blocked folder
  const blockedFolder = path.join(sdlcRoot, BLOCKED_DIR);
  if (fs.existsSync(blockedFolder)) {
    const blockedFiles = fs.readdirSync(blockedFolder).filter(f => f.endsWith('.md'));
    for (const file of blockedFiles) {
      const filePath = path.join(blockedFolder, file);
      try {
        const canonicalPath = fs.realpathSync(filePath);
        const story = parseStory(canonicalPath);
        // Case-insensitive comparison to match input
        if (story.frontmatter.id?.toLowerCase() === storyId.toLowerCase()) {
          return { ...story, path: canonicalPath };
        }
      } catch (err) {
        continue;
      }
    }
  }

  return null;
}

/**
 * Retrieves a story by ID, resolving its current location across all folders.
 * This is the single source of truth for story lookup - use this instead of
 * directly calling parseStory() with cached paths.
 *
 * @param sdlcRoot - Root directory of the SDLC workspace
 * @param storyId - Story ID (e.g., 'S-0001')
 * @returns Fully parsed Story object with current path and metadata
 * @throws Error if story ID not found in any folder
 */
export function getStory(sdlcRoot: string, storyId: string): Story {
  const story = findStoryById(sdlcRoot, storyId);

  if (!story) {
    const newStructurePath = path.join(sdlcRoot, STORIES_FOLDER, storyId, STORY_FILENAME);
    throw new Error(
      `Story not found: ${storyId}\n` +
      `Searched in: ${newStructurePath}\n` +
      `Also searched old folder structure (backlog, in-progress, done, blocked).\n` +
      `The story may have been deleted or the ID is incorrect.`
    );
  }

  return story;
}

/**
 * Reset workflow state for a story (clear worktree metadata and set status based on completion flags)
 * Used when cleaning up an existing worktree and restarting from scratch
 *
 * @param story - Story to reset
 * @returns Updated story with cleared worktree metadata and reset status
 */
export async function resetWorkflowState(story: Story): Promise<Story> {
  // Clear worktree metadata
  delete story.frontmatter.worktree_path;
  delete story.frontmatter.branch;

  // Determine appropriate status based on completion flags
  if (story.frontmatter.implementation_complete) {
    // Implementation complete - ready for review
    story.frontmatter.status = 'ready';
  } else if (story.frontmatter.plan_complete) {
    // Plan complete - ready for implementation
    story.frontmatter.status = 'ready';
  } else if (story.frontmatter.research_complete) {
    // Only research complete - back to backlog
    story.frontmatter.status = 'backlog';
  } else {
    // No phases complete - back to backlog
    story.frontmatter.status = 'backlog';
  }

  // Update timestamp
  story.frontmatter.updated = new Date().toISOString().split('T')[0];

  // Write changes to disk
  await writeStory(story);

  return story;
}

/**
 * Unblock a story and set status back to in-progress
 * In the new architecture, this only updates frontmatter - file path remains unchanged
 *
 * @param storyId - Story ID to unblock
 * @param sdlcRoot - Root path of the .ai-sdlc folder
 * @param options - Optional configuration { resetRetries?: boolean }
 * @returns The unblocked story
 */
export async function unblockStory(
  storyId: string,
  sdlcRoot: string,
  options?: { resetRetries?: boolean }
): Promise<Story> {
  // Use the centralized findStoryById() function for lookup
  const foundStory = findStoryById(sdlcRoot, storyId);

  if (!foundStory) {
    throw new Error(`Story ${storyId} not found`);
  }

  // Verify story is actually blocked
  if (foundStory.frontmatter.status !== 'blocked') {
    throw new Error(`Story ${storyId} is not blocked (current status: ${foundStory.frontmatter.status})`);
  }

  // Clear blocking fields
  delete foundStory.frontmatter.blocked_reason;
  delete foundStory.frontmatter.blocked_at;

  // Reset retries if requested
  if (options?.resetRetries) {
    foundStory.frontmatter.retry_count = 0;
    foundStory.frontmatter.refinement_count = 0;
    foundStory.frontmatter.total_recovery_attempts = 0;
  }

  // Determine appropriate status based on completion flags
  let newStatus: StoryStatus;
  if (foundStory.frontmatter.implementation_complete) {
    // Implementation is complete - return to in-progress for review
    newStatus = 'in-progress';
  } else if (foundStory.frontmatter.plan_complete) {
    // Plan is complete but implementation is not - ready for implementation
    newStatus = 'ready';
  } else {
    // No phases complete - back to backlog
    newStatus = 'backlog';
  }

  foundStory.frontmatter.status = newStatus;
  foundStory.frontmatter.updated = new Date().toISOString().split('T')[0];

  // Write back to same location
  await writeStory(foundStory);

  return foundStory;
}
