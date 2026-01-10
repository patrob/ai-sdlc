import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { Story, StoryFrontmatter, StoryStatus, FOLDER_TO_STATUS, ReviewAttempt, Config } from '../types/index.js';

/**
 * Parse a story markdown file into a Story object
 */
export function parseStory(filePath: string): Story {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { data, content: body } = matter(content);

  // Extract slug from filename (remove priority prefix and .md extension)
  const filename = path.basename(filePath, '.md');
  const slug = filename.replace(/^\d+-/, '');

  return {
    path: filePath,
    slug,
    frontmatter: data as StoryFrontmatter,
    content: body.trim(),
  };
}

/**
 * Write a story back to disk
 */
export function writeStory(story: Story): void {
  const content = matter.stringify(story.content, story.frontmatter);
  fs.writeFileSync(story.path, content);
}

/**
 * Move a story to a different kanban folder
 */
export function moveStory(story: Story, toFolder: string, sdlcRoot: string): Story {
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
  writeStory(story);

  // Remove old file
  if (fs.existsSync(oldPath) && oldPath !== newPath) {
    fs.unlinkSync(oldPath);
  }

  return story;
}

/**
 * Generate a unique story ID
 */
export function generateStoryId(): string {
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
 * Create a new story in the backlog
 */
export function createStory(
  title: string,
  sdlcRoot: string,
  options: Partial<StoryFrontmatter> = {}
): Story {
  const backlogFolder = path.join(sdlcRoot, 'backlog');

  // Ensure backlog folder exists
  if (!fs.existsSync(backlogFolder)) {
    fs.mkdirSync(backlogFolder, { recursive: true });
  }

  // Get existing stories to determine priority
  const existingFiles = fs.readdirSync(backlogFolder).filter(f => f.endsWith('.md'));
  const priority = existingFiles.length + 1;

  const slug = slugify(title);
  const filename = `${String(priority).padStart(2, '0')}-${slug}.md`;
  const filePath = path.join(backlogFolder, filename);

  const frontmatter: StoryFrontmatter = {
    id: generateStoryId(),
    title,
    priority,
    status: 'backlog',
    type: options.type || 'feature',
    created: new Date().toISOString().split('T')[0],
    labels: options.labels || [],
    research_complete: false,
    plan_complete: false,
    implementation_complete: false,
    reviews_complete: false,
    ...options,
  };

  const content = `# ${title}

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

  const story: Story = {
    path: filePath,
    slug,
    frontmatter,
    content,
  };

  writeStory(story);
  return story;
}

/**
 * Update story frontmatter field
 */
export function updateStoryField<K extends keyof StoryFrontmatter>(
  story: Story,
  field: K,
  value: StoryFrontmatter[K]
): Story {
  story.frontmatter[field] = value;
  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  writeStory(story);
  return story;
}

/**
 * Append content to a section in the story
 */
export function appendToSection(story: Story, section: string, content: string): Story {
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
  writeStory(story);
  return story;
}

/**
 * Record a refinement attempt in the story's frontmatter
 */
export function recordRefinementAttempt(
  story: Story,
  agentType: string,
  reviewFeedback: string
): Story {
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

  writeStory(story);
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
export function resetPhaseCompletion(
  story: Story,
  phase: 'research' | 'plan' | 'implement'
): Story {
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
  writeStory(story);
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
export function appendRefinementNote(
  story: Story,
  iteration: number,
  feedback: string
): Story {
  const refinementNote = `### Refinement Iteration ${iteration}\n\n${feedback}`;
  return appendToSection(story, 'Review Notes', refinementNote);
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
export function incrementRetryCount(story: Story): Story {
  const currentCount = story.frontmatter.retry_count || 0;
  story.frontmatter.retry_count = currentCount + 1;
  story.frontmatter.last_restart_timestamp = new Date().toISOString();
  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  writeStory(story);
  return story;
}

/**
 * Reset RPIV cycle for a story (keep research, reset plan/implementation/reviews)
 */
export function resetRPIVCycle(story: Story, reason: string): Story {
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

  writeStory(story);
  return story;
}

/**
 * Append a review attempt to the story's review history
 */
export function appendReviewHistory(story: Story, attempt: ReviewAttempt): Story {
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
  writeStory(story);
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
export function markStoryComplete(story: Story): Story {
  story.frontmatter.research_complete = true;
  story.frontmatter.plan_complete = true;
  story.frontmatter.implementation_complete = true;
  story.frontmatter.reviews_complete = true;
  story.frontmatter.updated = new Date().toISOString().split('T')[0];
  writeStory(story);
  return story;
}

/**
 * Snapshot max_retries from config to story frontmatter (for mid-cycle config change protection)
 */
export function snapshotMaxRetries(story: Story, config: Config): Story {
  if (story.frontmatter.max_retries === undefined) {
    story.frontmatter.max_retries = config.reviewConfig.maxRetries;
    story.frontmatter.updated = new Date().toISOString().split('T')[0];
    writeStory(story);
  }
  return story;
}
