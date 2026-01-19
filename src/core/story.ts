import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import * as properLockfile from 'proper-lockfile';
import { Story, StoryFrontmatter, StoryStatus, FOLDER_TO_STATUS, ReviewAttempt, Config, BLOCKED_DIR, STORIES_FOLDER, STORY_FILENAME, DEFAULT_PRIORITY_GAP, LockOptions, ReviewResult, ReviewDecision } from '../types/index.js';

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

  // For new files (file doesn't exist yet), write directly without locking
  // No race condition possible when creating a new file
  if (!fs.existsSync(story.path)) {
    fs.writeFileSync(story.path, content);
    return;
  }

  // For existing files, use locking to prevent concurrent write corruption
  const timeout = options?.lockTimeout ?? 5000;
  const retries = options?.retries ?? 3;
  const stale = options?.stale ?? timeout;

  // Acquire lock with retry logic and exponential backoff
  let release;
  try {
    release = await properLockfile.lock(story.path, {
      retries: {
        retries,
        minTimeout: 100,
        maxTimeout: 1000,
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
 */
export async function updateStoryStatus(story: Story, newStatus: StoryStatus): Promise<Story> {
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
 * Move a story to blocked status with reason and timestamp
 * In the new architecture, this only updates frontmatter - file path remains unchanged
 *
 * @param storyPath - Absolute path to the story file
 * @param reason - Reason for blocking (e.g., "Max refinement attempts (2/2) reached")
 */
export async function moveToBlocked(storyPath: string, reason: string): Promise<void> {
  // Security: Validate path BEFORE any file I/O operations
  const resolvedPath = path.resolve(storyPath);
  const storyDir = path.dirname(resolvedPath);
  const storiesFolder = path.dirname(storyDir);
  const sdlcRoot = path.dirname(storiesFolder);
  const resolvedRoot = path.resolve(sdlcRoot);

  // Validate that the path is within an SDLC root
  if (!resolvedPath.startsWith(resolvedRoot)) {
    throw new Error('Invalid story path: outside SDLC root');
  }
  if (!sdlcRoot.endsWith('.ai-sdlc')) {
    throw new Error('Invalid story path: not within .ai-sdlc folder');
  }

  // Parse the story (after security validation passes)
  const story = parseStory(storyPath);

  // Update frontmatter only - no file moves in new architecture
  story.frontmatter.status = 'blocked';
  story.frontmatter.blocked_reason = sanitizeReasonText(reason);
  story.frontmatter.blocked_at = new Date().toISOString();
  story.frontmatter.updated = new Date().toISOString().split('T')[0];

  // Write back to same location
  await writeStory(story);
}

/**
 * Generate a unique story ID in sequential format (S-0001, S-0002, etc.)
 * Scans the stories folder to find the highest existing number.
 *
 * @param storiesFolder - Path to the stories directory
 * @returns Sequential story ID like "S-0001"
 */
export function generateStoryId(storiesFolder?: string): string {
  let maxNum = 0;

  if (storiesFolder && fs.existsSync(storiesFolder)) {
    try {
      const dirs = fs.readdirSync(storiesFolder, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        // Match both S-XXXX format (new) and fall back to checking for any existing
        const match = dir.name.match(/^S-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    } catch {
      // If we can't read, start from 0
    }
  }

  // Generate next ID with zero-padded 4 digits
  const nextId = `S-${String(maxNum + 1).padStart(4, '0')}`;
  return nextId;
}

/**
 * Generate a legacy story ID (for backwards compatibility/fallback)
 * @deprecated Use generateStoryId() instead
 */
export function generateLegacyStoryId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `story-${timestamp}-${random}`;
}

/**
 * Create a slug from a title
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Sanitize a title string for safe use in file paths and display.
 * Removes dangerous characters that could be used for injection attacks.
 *
 * SECURITY: This function prevents command injection and path traversal through titles.
 *
 * @param title - Title string to sanitize
 * @returns Sanitized title safe for use in paths and commands
 */
export function sanitizeTitle(title: string): string {
  if (!title) return '';

  let sanitized = title
    // Remove shell metacharacters that could be used for command injection
    .replace(/[`$()\\|&;<>]/g, '')
    // Remove ANSI escape codes (colors, cursor control)
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    // Remove OSC sequences (hyperlinks, window titles)
    .replace(/\x1B\][^\x07]*\x07/g, '')
    .replace(/\x1B\][^\x1B]*\x1B\\/g, '')
    // Remove null bytes and control characters
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  // Normalize Unicode to prevent homograph attacks
  sanitized = sanitized.normalize('NFC');

  // Limit length to prevent storage issues
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200);
  }

  return sanitized.trim();
}

/**
 * Extract title from file content using safe parsing.
 * Priority: YAML frontmatter > H1 heading > null
 *
 * SECURITY: Uses regex-only approach to avoid YAML parser vulnerabilities.
 *
 * @param content - File content to extract title from
 * @returns Extracted title or null if not found
 */
export function extractTitleFromContent(content: string): string | null {
  if (!content || content.trim().length === 0) {
    return null;
  }

  // Try to extract from YAML frontmatter using safe regex (no full YAML parsing)
  // Match: --- at start, then look for title: field, then --- to close
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/m);
  if (frontmatterMatch) {
    // Look for title: field in the frontmatter block
    const titleMatch = frontmatterMatch[1].match(/^title:\s*['"]?([^'"\n]+?)['"]?\s*$/m);
    if (titleMatch && titleMatch[1]) {
      const title = titleMatch[1].trim();
      if (title.length > 0) {
        return sanitizeTitle(title);
      }
    }
  }

  // Fall back to first H1 heading (# Title)
  // Use non-greedy matching with length limit to prevent ReDoS
  const h1Match = content.match(/^#\s+(.{1,200}?)$/m);
  if (h1Match && h1Match[1]) {
    const title = h1Match[1].trim();
    if (title.length > 0) {
      return sanitizeTitle(title);
    }
  }

  // No title found
  return null;
}

/**
 * Create a new story in the folder-per-story structure
 *
 * Creates stories/{id}/story.md with slug and priority in frontmatter.
 * Priority uses gaps (10, 20, 30...) for easy insertion without renumbering.
 *
 * @param title - Story title
 * @param sdlcRoot - Root path of .ai-sdlc folder
 * @param options - Optional frontmatter fields
 * @param content - Optional custom story content (if not provided, uses default template)
 */
export async function createStory(
  title: string,
  sdlcRoot: string,
  options: Partial<StoryFrontmatter> = {},
  content?: string
): Promise<Story> {
  const storiesFolder = path.join(sdlcRoot, STORIES_FOLDER);

  // Validate parent stories/ directory exists
  if (!fs.existsSync(storiesFolder)) {
    throw new Error(`Stories folder does not exist: ${storiesFolder}. Run 'ai-sdlc init' first.`);
  }

  // Generate unique ID and slug
  const id = generateStoryId(storiesFolder);
  const slug = slugify(title);

  // Create story folder: stories/{id}/
  const storyFolder = path.join(storiesFolder, id);
  fs.mkdirSync(storyFolder, { recursive: true });

  // Create story file path: stories/{id}/story.md
  const filePath = path.join(storyFolder, STORY_FILENAME);

  // Calculate priority using gaps - find max priority and add DEFAULT_PRIORITY_GAP
  let priority = DEFAULT_PRIORITY_GAP; // Start at 10 for first story
  try {
    const existingDirs = fs.readdirSync(storiesFolder, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory());

    if (existingDirs.length > 0) {
      let maxPriority = 0;
      for (const dir of existingDirs) {
        const storyPath = path.join(storiesFolder, dir.name, STORY_FILENAME);
        if (fs.existsSync(storyPath)) {
          try {
            const existingStory = parseStory(storyPath);
            if (existingStory.frontmatter.priority > maxPriority) {
              maxPriority = existingStory.frontmatter.priority;
            }
          } catch (err) {
            // Skip malformed stories
            continue;
          }
        }
      }
      priority = maxPriority + DEFAULT_PRIORITY_GAP;
    }
  } catch (err) {
    // If we can't read existing stories, start at DEFAULT_PRIORITY_GAP
    priority = DEFAULT_PRIORITY_GAP;
  }

  const frontmatter: StoryFrontmatter = {
    id,
    title,
    slug,
    priority,
    status: 'backlog',
    type: options.type || 'feature',
    created: new Date().toISOString().split('T')[0],
    labels: options.labels || [],
    research_complete: false,
    plan_complete: false,
    implementation_complete: false,
    reviews_complete: false,
    // Default content_type to 'code' for backward compatibility
    // Stories that don't modify src/ should explicitly set content_type: 'configuration' or 'documentation'
    content_type: 'code',
    ...options,
  };

  // Use custom content if provided, otherwise use default template
  let storyContent: string;
  if (content) {
    // Security: Strip dangerous HTML tags from custom content
    storyContent = content
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<iframe[^>]*>.*?<\/iframe>/gis, '');
  } else {
    // Default template
    storyContent = `# ${title}

## Summary

(Describe the feature, bug, or task here)

## Acceptance Criteria

- [ ] (Define acceptance criteria)

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->`;
  }

  const story: Story = {
    path: filePath,
    slug,
    frontmatter,
    content: storyContent,
  };

  await writeStory(story);

  // Return story with canonical path for consistency
  const canonicalPath = fs.realpathSync(filePath);
  return { ...story, path: canonicalPath };
}

/**
 * Update story frontmatter field
 */
export async function updateStoryField<K extends keyof StoryFrontmatter>(
  story: Story,
  field: K,
  value: StoryFrontmatter[K]
): Promise<Story> {
  story.frontmatter[field] = value;
  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  await writeStory(story);
  return story;
}

/**
 * Append content to a section in the story
 */
export async function appendToSection(story: Story, section: string, content: string): Promise<Story> {
  const sectionHeader = `## ${section}`;
  const sectionIndex = story.content.indexOf(sectionHeader);

  if (sectionIndex === -1) {
    // Section doesn't exist, add it at the end
    story.content += `\n\n${sectionHeader}\n\n${content}`;
  } else {
    // Find the next section or end of content
    const afterHeader = sectionIndex + sectionHeader.length;
    const nextSectionMatch = story.content.substring(afterHeader).match(/\n## /);
    const insertPoint = nextSectionMatch
      ? afterHeader + nextSectionMatch.index!
      : story.content.length;

    // Insert content before next section
    story.content =
      story.content.substring(0, insertPoint).trimEnd() +
      '\n\n' +
      content +
      '\n' +
      story.content.substring(insertPoint);
  }

  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  await writeStory(story);
  return story;
}

/**
 * Record a refinement attempt in the story's frontmatter
 */
export async function recordRefinementAttempt(
  story: Story,
  agentType: string,
  reviewFeedback: string
): Promise<Story> {
  // Initialize refinement tracking if not present
  if (!story.frontmatter.refinement_iterations) {
    story.frontmatter.refinement_iterations = [];
    story.frontmatter.refinement_count = 0;
  }

  const iteration = (story.frontmatter.refinement_count || 0) + 1;
  const refinementRecord = {
    iteration,
    agentType,
    startedAt: new Date().toISOString(),
    reviewFeedback,
    result: 'in_progress' as const,
  };

  story.frontmatter.refinement_iterations.push(refinementRecord);
  story.frontmatter.refinement_count = iteration;
  story.frontmatter.updated = new Date().toISOString().split('T')[0];

  await writeStory(story);
  return story;
}

/**
 * Get the current refinement count for a story
 */
export function getRefinementCount(story: Story): number {
  return story.frontmatter.refinement_count || 0;
}

/**
 * Check if a story can retry refinement based on iteration limit
 */
export function canRetryRefinement(story: Story, maxAttempts: number): boolean {
  const currentCount = getRefinementCount(story);
  const storyMax = story.frontmatter.max_refinement_attempts;
  const effectiveMax = storyMax !== undefined ? storyMax : maxAttempts;
  return currentCount < effectiveMax;
}

/**
 * Reset phase completion flags for rework
 */
export async function resetPhaseCompletion(
  story: Story,
  phase: 'research' | 'plan' | 'implement'
): Promise<Story> {
  switch (phase) {
    case 'research':
      story.frontmatter.research_complete = false;
      break;
    case 'plan':
      story.frontmatter.plan_complete = false;
      break;
    case 'implement':
      story.frontmatter.implementation_complete = false;
      break;
  }

  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  await writeStory(story);
  return story;
}

/**
 * Get the latest review feedback from the story content
 */
export function getLatestReviewFeedback(story: Story): string | null {
  const reviewSection = story.content.match(/## Review Notes\n\n([\s\S]*?)(?=\n## |$)/);
  if (!reviewSection) {
    return null;
  }

  // Extract the most recent review (look for latest "### Review" or similar heading)
  const reviews = reviewSection[1].split(/### /);
  return reviews.length > 1 ? reviews[reviews.length - 1].trim() : null;
}

/**
 * Append refinement feedback to the story content
 */
export async function appendRefinementNote(
  story: Story,
  iteration: number,
  feedback: string
): Promise<Story> {
  const refinementNote = `### Refinement Iteration ${iteration}\n\n${feedback}`;
  return await appendToSection(story, 'Review Notes', refinementNote);
}

/**
 * Get the effective maximum retries for a story (story-specific or config default)
 */
export function getEffectiveMaxRetries(story: Story, config: Config): number {
  return story.frontmatter.max_retries !== undefined
    ? story.frontmatter.max_retries
    : config.reviewConfig.maxRetries;
}

/**
 * Check if a story has reached its maximum retry limit
 * @param maxIterationsOverride Optional CLI override for max iterations (takes precedence)
 */
export function isAtMaxRetries(story: Story, config: Config, maxIterationsOverride?: number): boolean {
  const currentRetryCount = story.frontmatter.retry_count || 0;
  // CLI override takes precedence, then story-specific, then config default
  const maxRetries = maxIterationsOverride !== undefined
    ? maxIterationsOverride
    : getEffectiveMaxRetries(story, config);
  // Infinity means no limit
  if (!Number.isFinite(maxRetries)) {
    return false;
  }
  return currentRetryCount >= maxRetries;
}

/**
 * Increment the retry count for a story
 */
export async function incrementRetryCount(story: Story): Promise<Story> {
  const currentCount = story.frontmatter.retry_count || 0;
  story.frontmatter.retry_count = currentCount + 1;
  story.frontmatter.last_restart_timestamp = new Date().toISOString();
  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  await writeStory(story);
  return story;
}

/**
 * Reset RPIV cycle for a story (keep research, reset plan/implementation/reviews)
 */
export async function resetRPIVCycle(story: Story, reason: string): Promise<Story> {
  // Keep research_complete as true, reset other flags
  story.frontmatter.plan_complete = false;
  story.frontmatter.implementation_complete = false;
  story.frontmatter.reviews_complete = false;
  story.frontmatter.last_restart_reason = reason;
  story.frontmatter.last_restart_timestamp = new Date().toISOString();
  story.frontmatter.updated = new Date().toISOString().split('T')[0];

  // Increment retry count
  const currentCount = story.frontmatter.retry_count || 0;
  story.frontmatter.retry_count = currentCount + 1;

  await writeStory(story);
  return story;
}

/**
 * Append a review attempt to the story's review history
 */
export async function appendReviewHistory(story: Story, attempt: ReviewAttempt): Promise<Story> {
  if (!story.frontmatter.review_history) {
    story.frontmatter.review_history = [];
  }

  // Add new attempt
  story.frontmatter.review_history.push(attempt);

  // Keep only the last 10 attempts to prevent unbounded growth
  if (story.frontmatter.review_history.length > 10) {
    story.frontmatter.review_history = story.frontmatter.review_history.slice(-10);
  }

  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  await writeStory(story);
  return story;
}

/**
 * Get the latest review attempt from a story's history
 */
export function getLatestReviewAttempt(story: Story): ReviewAttempt | null {
  if (!story.frontmatter.review_history || story.frontmatter.review_history.length === 0) {
    return null;
  }
  return story.frontmatter.review_history[story.frontmatter.review_history.length - 1];
}

/**
 * Mark a story as complete (all workflow flags set to true)
 */
export async function markStoryComplete(story: Story): Promise<Story> {
  story.frontmatter.research_complete = true;
  story.frontmatter.plan_complete = true;
  story.frontmatter.implementation_complete = true;
  story.frontmatter.reviews_complete = true;
  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  await writeStory(story);
  return story;
}

/**
 * Auto-complete story after review approval
 * Handles marking story as complete and transitioning to done status
 *
 * @param story - The story to auto-complete
 * @param config - The configuration containing reviewConfig settings
 * @param reviewResult - The result from the review agent
 * @returns Updated story if auto-completion occurred, original story otherwise
 */
export async function autoCompleteStoryAfterReview(
  story: Story,
  config: Config,
  reviewResult: ReviewResult
): Promise<Story> {
  // Only auto-complete if review was approved and config allows it
  if (reviewResult.decision !== ReviewDecision.APPROVED) {
    return story;
  }

  if (!config.reviewConfig.autoCompleteOnApproval) {
    return story;
  }

  try {
    // Mark all workflow flags as complete
    story = await markStoryComplete(story);

    // Update status to done if currently in-progress
    if (story.frontmatter.status === 'in-progress') {
      story = await updateStoryStatus(story, 'done');
    }

    return story;
  } catch (error) {
    // Log error but don't fail the entire review operation
    console.error('Failed to auto-complete story after review:', error);
    return story;
  }
}

/**
 * Snapshot max_retries from config to story frontmatter (for mid-cycle config change protection)
 */
export async function snapshotMaxRetries(story: Story, config: Config): Promise<Story> {
  if (story.frontmatter.max_retries === undefined) {
    story.frontmatter.max_retries = config.reviewConfig.maxRetries;
    story.frontmatter.updated = new Date().toISOString().split('T')[0];
    await writeStory(story);
  }
  return story;
}

/**
 * Get the current implementation retry count for a story
 */
export function getImplementationRetryCount(story: Story): number {
  return story.frontmatter.implementation_retry_count || 0;
}

/**
 * Get the effective maximum implementation retries for a story (story-specific or config default)
 * Story-specific overrides are capped at the upper bound to prevent resource exhaustion
 */
export function getEffectiveMaxImplementationRetries(story: Story, config: Config): number {
  const storyMax = story.frontmatter.max_implementation_retries;
  const configMax = config.implementation.maxRetries;
  const upperBound = config.implementation.maxRetriesUpperBound;

  if (storyMax !== undefined) {
    // Cap story override at upper bound
    return Math.min(storyMax, upperBound);
  }

  return configMax;
}

/**
 * Check if a story has reached its maximum implementation retry limit.
 * maxRetries represents the number of RETRY attempts allowed after the initial attempt.
 * So with maxRetries=1, you get 1 initial attempt + 1 retry = 2 total attempts.
 */
export function isAtMaxImplementationRetries(story: Story, config: Config): boolean {
  const currentRetryCount = getImplementationRetryCount(story);
  const maxRetries = getEffectiveMaxImplementationRetries(story, config);

  // Infinity means no limit
  if (!Number.isFinite(maxRetries)) {
    return false;
  }

  // Use > instead of >= because maxRetries is the number of retries allowed,
  // not the total number of attempts. With maxRetries=1, we allow 1 retry
  // (so 2 total attempts before being considered "at max").
  return currentRetryCount > maxRetries;
}

/**
 * Reset implementation retry count to 0
 */
export async function resetImplementationRetryCount(story: Story): Promise<Story> {
  story.frontmatter.implementation_retry_count = 0;
  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  await writeStory(story);
  return story;
}

/**
 * Increment the implementation retry count for a story
 */
export async function incrementImplementationRetryCount(story: Story): Promise<Story> {
  const currentCount = story.frontmatter.implementation_retry_count || 0;
  story.frontmatter.implementation_retry_count = currentCount + 1;
  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  await writeStory(story);
  return story;
}

/**
 * Global recovery circuit breaker limit
 */
const GLOBAL_RECOVERY_LIMIT = 10;

/**
 * Get the current total recovery attempts for a story
 */
export function getTotalRecoveryAttempts(story: Story): number {
  return story.frontmatter.total_recovery_attempts || 0;
}

/**
 * Check if a story has reached the global recovery limit
 */
export function isAtGlobalRecoveryLimit(story: Story): boolean {
  const currentAttempts = getTotalRecoveryAttempts(story);
  return currentAttempts >= GLOBAL_RECOVERY_LIMIT;
}

/**
 * Increment the total recovery attempts counter for a story
 */
export async function incrementTotalRecoveryAttempts(story: Story): Promise<Story> {
  const currentCount = story.frontmatter.total_recovery_attempts || 0;
  story.frontmatter.total_recovery_attempts = currentCount + 1;
  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  await writeStory(story);
  return story;
}

/**
 * Reset the total recovery attempts counter to 0
 */
export async function resetTotalRecoveryAttempts(story: Story): Promise<Story> {
  story.frontmatter.total_recovery_attempts = 0;
  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  await writeStory(story);
  return story;
}

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
  // Use the centralized getStory() function for lookup
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
