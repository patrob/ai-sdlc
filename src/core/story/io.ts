import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';
import * as properLockfile from 'proper-lockfile';

import { FOLDER_TO_STATUS, type LockOptions, type Story,type StoryFrontmatter, type StoryStatus } from '../../types/index.js';

/**
 * Section file names for split story outputs.
 * Each agent writes to its own file within the story folder.
 */
export const SECTION_FILES = {
  research: 'research.md',
  plan: 'plan.md',
  plan_review: 'plan_review.md',
  review: 'review.md',
} as const;

export type SectionType = keyof typeof SECTION_FILES;

/**
 * Parse a story markdown file into a Story object
 *
 * In the new architecture, story ID is extracted from the parent folder name,
 * and slug is read from frontmatter (with fallback to ID if missing).
 */
export function parseStory(filePath: string): Story {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Pass empty options to bypass gray-matter's content-based cache.
  // Without this, repeated parses of modified files return stale data.
  const { data, content: body } = matter(content, {});

  const frontmatter = data as StoryFrontmatter;

  // Ensure labels field exists (backward compatibility with old stories)
  if (!frontmatter.labels) {
    frontmatter.labels = [];
  }

  // Extract slug from frontmatter (new architecture) or filename (old architecture fallback)
  let slug: string;
  if (frontmatter.slug) {
    // New architecture: slug is in frontmatter
    slug = frontmatter.slug;
  } else {
    // Fallback for old architecture: extract from filename
    const filename = path.basename(filePath, '.md');
    slug = filename.replace(/^\d+-/, '');

    // Also fallback to ID if available
    if (!slug && frontmatter.id) {
      slug = frontmatter.id;
    }
  }

  return {
    path: filePath,
    slug,
    frontmatter,
    content: body.trim(),
  };
}

/**
 * Write a story back to disk with file locking for atomic updates.
 *
 * This function acquires an exclusive lock before writing to prevent race conditions
 * from concurrent processes. The lock is always released, even if an error occurs.
 *
 * **IMPORTANT:** Do not nest locks on the same file to avoid deadlock. Batch multiple
 * updates into a single writeStory() call instead.
 *
 * @param story - Story object to write
 * @param options - Lock options (timeout, retries, stale threshold)
 * @throws Error if file is locked by another process or filesystem is read-only
 *
 * @example
 * ```typescript
 * // Good: Batch updates
 * story.frontmatter.status = 'in-progress';
 * story.frontmatter.priority = 1;
 * await writeStory(story);
 *
 * // Bad: Nested locks (potential deadlock)
 * await writeStory(story); // holds lock
 * await writeStory(story); // tries to acquire same lock = deadlock
 * ```
 */
export async function writeStory(story: Story, options?: LockOptions): Promise<void> {
  const content = matter.stringify(story.content, story.frontmatter);

  // For new files, write directly without locking using exclusive create.
  // The 'wx' flag atomically creates the file, throwing EEXIST if it already exists (TOCTOU-safe)
  try {
    fs.writeFileSync(story.path, content, { flag: 'wx' });
    return;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    // File exists — fall through to the locked write path below
  }

  // For existing files, use locking to prevent concurrent write corruption
  const timeout = options?.lockTimeout ?? 10000;  // Increased from 5s to 10s
  const retries = options?.retries ?? 5;          // Increased from 3 to 5
  const stale = options?.stale ?? timeout;

  // Acquire lock with exponential backoff and jitter to prevent thundering herd
  // Backoff pattern: 100ms → 200ms → 400ms → 800ms → 1000ms (capped)
  // Jitter adds random delay up to 50% of the calculated backoff
  let release;
  try {
    release = await properLockfile.lock(story.path, {
      retries: {
        retries,
        minTimeout: 100,
        maxTimeout: 2000,   // Increased max for longer contention scenarios
        factor: 2,          // Exponential factor
        randomize: true,    // Add jitter (randomizes between 1x and 2x the delay)
      },
      stale,
    });
  } catch (error: any) {
    // Handle lock-specific errors with actionable messages
    if (error.code === 'ELOCKED') {
      throw new Error(
        `Story ${story.frontmatter.id || story.path} is locked by another process. ` +
        `Please retry in a moment or check for hung processes.`
      );
    }
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw new Error(
        `Cannot create lock file: filesystem is read-only or insufficient permissions. ` +
        `Ensure ${path.dirname(story.path)} is writable.`
      );
    }
    // ESTALE is handled automatically by proper-lockfile (stale lock removed)
    throw error;
  }

  try {
    // Critical section: write story to disk
    fs.writeFileSync(story.path, content);
  } finally {
    // Always release lock, even on error
    await release();
  }
}

/**
 * Update story status in frontmatter without moving files
 * This is the preferred method in the new folder-per-story architecture
 *
 * FIX: Validates status transitions to prevent inconsistent state.
 * Status 'done' requires both implementation_complete and reviews_complete to be true.
 *
 * @param story - Story to update
 * @param newStatus - New status to set
 * @throws Error if transitioning to 'done' without required completion flags
 */
export async function updateStoryStatus(story: Story, newStatus: StoryStatus): Promise<Story> {
  // FIX: Validate transition to 'done' requires completion flags
  if (newStatus === 'done') {
    if (!story.frontmatter.implementation_complete || !story.frontmatter.reviews_complete) {
      throw new Error(
        `Cannot set status to 'done': implementation_complete (${story.frontmatter.implementation_complete}) ` +
        `and reviews_complete (${story.frontmatter.reviews_complete}) must both be true`
      );
    }
  }

  story.frontmatter.status = newStatus;
  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  await writeStory(story);
  return story;
}

/**
 * Move a story to a different kanban folder
 * @deprecated Use updateStoryStatus() instead. Will be removed in v2.0
 */
export async function moveStory(story: Story, toFolder: string, sdlcRoot: string): Promise<Story> {
  console.warn('moveStory() is deprecated. Use updateStoryStatus() instead. Will be removed in v2.0');

  const targetFolder = path.join(sdlcRoot, toFolder);

  // Ensure target folder exists
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  // Get existing stories in target folder to determine priority
  const existingFiles = fs.readdirSync(targetFolder).filter(f => f.endsWith('.md'));
  const newPriority = existingFiles.length + 1;

  // Create new filename with priority
  const newFilename = `${String(newPriority).padStart(2, '0')}-${story.slug}.md`;
  const newPath = path.join(targetFolder, newFilename);

  // Update frontmatter
  story.frontmatter.priority = newPriority;
  story.frontmatter.status = FOLDER_TO_STATUS[toFolder as keyof typeof FOLDER_TO_STATUS];
  story.frontmatter.updated = new Date().toISOString().split('T')[0];

  // Write to new location
  const oldPath = story.path;
  story.path = newPath;
  await writeStory(story);

  // Remove old file
  if (fs.existsSync(oldPath) && oldPath !== newPath) {
    fs.unlinkSync(oldPath);
  }

  return story;
}

/**
 * Get the path to a section file within a story folder.
 *
 * @param storyPath - Path to the story.md file
 * @param section - Section type (research, plan, review)
 * @returns Absolute path to the section file
 */
export function getSectionFilePath(storyPath: string, section: SectionType): string {
  const storyDir = path.dirname(storyPath);
  return path.join(storyDir, SECTION_FILES[section]);
}

/**
 * Read section content from section file, with fallback to story.md for backward compatibility.
 *
 * Lookup order:
 * 1. Section file (e.g., research.md) - preferred
 * 2. Extract from story.md section (e.g., ## Research) - backward compat
 * 3. Return empty string if neither exists
 *
 * @param storyPath - Path to the story.md file
 * @param section - Section type (research, plan, review)
 * @returns Section content or empty string
 */
export async function readSectionContent(storyPath: string, section: SectionType): Promise<string> {
  const sectionFilePath = getSectionFilePath(storyPath, section);

  // Try section file first (new architecture)
  if (fs.existsSync(sectionFilePath)) {
    return fs.readFileSync(sectionFilePath, 'utf-8');
  }

  // Fall back to extracting from story.md (backward compatibility)
  const sectionHeaders: Record<SectionType, string> = {
    research: 'Research',
    plan: 'Implementation Plan',
    plan_review: 'Plan Review',
    review: 'Review Notes',
  };

  try {
    const storyContent = fs.readFileSync(storyPath, 'utf-8');
    const { content } = matter(storyContent, {});
    const sectionHeader = `## ${sectionHeaders[section]}`;
    const sectionIndex = content.indexOf(sectionHeader);

    if (sectionIndex === -1) {
      return '';
    }

    // Find the section content
    const afterHeader = sectionIndex + sectionHeader.length;
    const nextSectionMatch = content.substring(afterHeader).match(/\n## /);
    const endIndex = nextSectionMatch
      ? afterHeader + nextSectionMatch.index!
      : content.length;

    return content.substring(afterHeader, endIndex).trim();
  } catch {
    return '';
  }
}

/**
 * Format iteration header for retry/rework scenarios.
 *
 * @param iteration - Iteration number (1-based)
 * @param isRework - Whether this is a rework iteration (vs initial or retry)
 * @returns Formatted header string
 */
export function formatIterationHeader(iteration: number, isRework?: boolean): string {
  const timestamp = new Date().toISOString().split('T')[0];
  if (iteration === 1 && !isRework) {
    return `---\n*Generated: ${timestamp}*\n\n`;
  }
  const label = isRework ? 'Rework' : 'Iteration';
  return `\n\n---\n\n## ${label} ${iteration}\n*Generated: ${timestamp}*\n\n`;
}

/**
 * Write or append content to a section file.
 *
 * Creates the section file if it doesn't exist. When appending,
 * adds an iteration header for clarity.
 *
 * @param storyPath - Path to the story.md file
 * @param section - Section type (research, plan, review)
 * @param content - Content to write
 * @param options - Write options
 * @param options.append - If true, append to existing content
 * @param options.iteration - Iteration number for header formatting
 * @param options.isRework - If true, format as rework iteration
 */
export async function writeSectionContent(
  storyPath: string,
  section: SectionType,
  content: string,
  options?: { append?: boolean; iteration?: number; isRework?: boolean }
): Promise<void> {
  const sectionFilePath = getSectionFilePath(storyPath, section);
  const append = options?.append ?? false;
  const iteration = options?.iteration ?? 1;
  const isRework = options?.isRework ?? false;

  let finalContent: string;

  if (append && fs.existsSync(sectionFilePath)) {
    // Append with iteration header
    const existing = fs.readFileSync(sectionFilePath, 'utf-8');
    const header = formatIterationHeader(iteration, isRework);
    finalContent = existing + header + content;
  } else {
    // Write fresh content with initial header
    const header = formatIterationHeader(1, false);
    finalContent = header + content;
  }

  fs.writeFileSync(sectionFilePath, finalContent);
}
