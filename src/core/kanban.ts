import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { Story, StateAssessment, Action, KANBAN_FOLDERS, KanbanFolder, ReviewDecision, BLOCKED_DIR, STORIES_FOLDER, STORY_FILENAME, StoryStatus } from '../types/index.js';
import { parseStory, isAtMaxRetries, canRetryRefinement, getLatestReviewAttempt, moveToBlocked, getEffectiveMaxRetries, sanitizeReasonText, findStoryById } from './story.js';
import { loadConfig } from './config.js';
import { determineTargetPhase } from '../agents/rework.js';

/**
 * Find all stories in the stories/ folder structure
 * Globs stories/*\u200B/story.md and returns all story objects
 * Skips malformed folders (folders without story.md)
 */
export function findAllStories(sdlcRoot: string): Story[] {
  const storiesFolder = path.join(sdlcRoot, STORIES_FOLDER);

  if (!fs.existsSync(storiesFolder)) {
    return [];
  }

  const stories: Story[] = [];
  const pattern = path.join(storiesFolder, '*', STORY_FILENAME);

  try {
    const storyPaths = glob.sync(pattern);

    for (const storyPath of storyPaths) {
      try {
        const canonicalPath = fs.realpathSync(storyPath);
        const story = parseStory(canonicalPath);
        stories.push({ ...story, path: canonicalPath });
      } catch (err) {
        // Skip malformed stories or symlinks that can't be resolved
        continue;
      }
    }
  } catch (err) {
    // If glob fails, return empty array
    return [];
  }

  return stories;
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

// findStoryById has been moved to story.ts and is now imported above
// This consolidates story lookup logic in one place (DRY principle)

/**
 * Find a story by slug across all folders
 */
export function findStoryBySlug(sdlcRoot: string, slug: string): Story | null {
  const allStories = findAllStories(sdlcRoot);
  return allStories.find(s => s.slug === slug) || null;
}

/**
 * Calculate completion score for a story based on workflow progress.
 * Higher scores indicate more progress toward completion.
 * Used to prioritize nearly-complete stories over early-stage ones.
 */
export function calculateCompletionScore(story: Story): number {
  let score = 0;
  if (story.frontmatter.reviews_complete) score += 40;
  if (story.frontmatter.implementation_complete) score += 30;
  if (story.frontmatter.plan_complete) score += 20;
  if (story.frontmatter.research_complete) score += 10;
  return score;
}

/**
 * Check if a story has a failed review that needs rework
 */
function hasFailedReview(story: Story): boolean {
  const latestReview = getLatestReviewAttempt(story);
  if (!latestReview) {
    return false;
  }

  // Check if the latest review was rejected (not failed - that's a review agent error)
  return latestReview.decision === ReviewDecision.REJECTED;
}

/**
 * Assess the current state of the kanban board and recommend actions
 */
export async function assessState(sdlcRoot: string): Promise<StateAssessment> {
  const backlogItems = findStoriesByStatus(sdlcRoot, 'backlog');
  const readyItems = findStoriesByStatus(sdlcRoot, 'ready');
  const inProgressItems = findStoriesByStatus(sdlcRoot, 'in-progress');
  const doneItems = findStoriesByStatus(sdlcRoot, 'done');

  const recommendedActions: Action[] = [];
  const workingDir = path.dirname(sdlcRoot);
  const config = loadConfig(workingDir);

  // Priority order: In-Progress (0-150) > Ready (200-400) > Backlog (500+)

  // Check in-progress items FIRST (highest priority)
  for (const story of inProgressItems) {
    // Check if implementation is complete but review failed
    if (story.frontmatter.implementation_complete && !story.frontmatter.reviews_complete) {
      // Check if there's a failed review that needs rework
      if (hasFailedReview(story)) {
        // Check if we can still retry refinement (circuit breaker)
        if (canRetryRefinement(story, config.refinement.maxIterations)) {
          const latestReview = getLatestReviewAttempt(story);
          const refinementCount = story.frontmatter.refinement_count || 0;

          // Create a mock ReviewResult for determineTargetPhase
          const reviewResult = {
            issues: latestReview?.blockers.map(b => ({
              severity: 'blocker' as const,
              category: 'review_failure',
              description: b,
            })) || [],
          };

          // Determine which phase to rework (research, plan, or implement)
          const targetPhase = determineTargetPhase(reviewResult as any);

          recommendedActions.push({
            type: 'rework',
            storyId: story.frontmatter.id,
            storyPath: story.path,
            reason: `⟳ Story "${story.frontmatter.title}" needs rework (iteration ${refinementCount + 1}, target: ${targetPhase})`,
            priority: story.frontmatter.priority, // Highest priority (0-based)
            context: {
              reviewFeedback: latestReview,
              targetPhase,
              iteration: refinementCount + 1,
            },
          });
        } else {
          // Circuit breaker: max refinement attempts reached - move to blocked
          // Bounds checking for numeric values (prevent display issues with malicious frontmatter)
          const refinementCount = Math.max(0, Math.min(Number(story.frontmatter.refinement_count) || 0, 999));
          const maxAttempts = Math.max(0, Math.min(Number(story.frontmatter.max_refinement_attempts || config.refinement.maxIterations) || 0, 999));
          const reason = `Max refinement attempts (${refinementCount}/${maxAttempts}) reached`;

          try {
            // Move story to blocked folder
            await moveToBlocked(story.path, reason);

            // Log blocking action with sanitized output
            const sanitizedStoryId = sanitizeReasonText(story.frontmatter.id || 'unknown');
            console.log(`Story ${sanitizedStoryId} blocked: Max refinement attempts (${refinementCount}/${maxAttempts}) reached`);
          } catch (error) {
            // Log error but don't crash daemon - sanitize error message
            const sanitizedStoryId = sanitizeReasonText(story.frontmatter.id || 'unknown');
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Failed to move story ${sanitizedStoryId} to blocked: ${sanitizeReasonText(errorMsg)}`);

            // Fall back to high-priority action as before
            recommendedActions.push({
              type: 'review',
              storyId: story.frontmatter.id,
              storyPath: story.path,
              reason: `🛑 Story "${story.frontmatter.title}" reached max refinement attempts (${refinementCount}/${maxAttempts}) - manual intervention required`,
              priority: story.frontmatter.priority + 10000,
              context: { blockedByMaxRefinements: true },
            });
          }
        }
        continue; // Skip other checks for this story
      }
    }

    // Check if story is at max retries
    const atMaxRetries = isAtMaxRetries(story, config);

    if (atMaxRetries) {
      // Circuit breaker: max review retries reached - move to blocked
      // Bounds checking for numeric values (prevent display issues with malicious frontmatter)
      const retryCount = Math.max(0, Math.min(Number(story.frontmatter.retry_count) || 0, 999));
      const maxRetries = Math.max(0, Math.min(Number(getEffectiveMaxRetries(story, config)) || 0, 999));

      // Sanitize feedback for safe storage and display
      const latestReview = getLatestReviewAttempt(story);
      const rawFeedback = latestReview?.feedback || 'unknown';
      const lastFailureSummary = sanitizeReasonText(rawFeedback).substring(0, 100);
      const reason = `Max review retries (${retryCount}/${maxRetries}) reached - last failure: ${lastFailureSummary}`;

      try {
        // Move story to blocked folder
        await moveToBlocked(story.path, reason);

        // Log blocking action with sanitized output
        const sanitizedStoryId = sanitizeReasonText(story.frontmatter.id || 'unknown');
        console.log(`Story ${sanitizedStoryId} blocked: Max review retries (${retryCount}/${maxRetries}) reached`);
      } catch (error) {
        // Log error but don't crash daemon - sanitize error message
        const sanitizedStoryId = sanitizeReasonText(story.frontmatter.id || 'unknown');
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to move story ${sanitizedStoryId} to blocked: ${sanitizeReasonText(errorMsg)}`);

        // Fall back to high-priority action as before
        recommendedActions.push({
          type: 'review',
          storyId: story.frontmatter.id,
          storyPath: story.path,
          reason: `⚠️  Story "${story.frontmatter.title}" requires manual intervention (max retries: ${retryCount})`,
          priority: story.frontmatter.priority + 10000,
          context: { blockedByMaxRetries: true },
        });
      }
    } else if (!story.frontmatter.implementation_complete) {
      const completionScore = calculateCompletionScore(story);
      recommendedActions.push({
        type: 'implement',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" implementation in progress`,
        priority: story.frontmatter.priority + 50 - completionScore,
      });
    } else if (!story.frontmatter.reviews_complete) {
      // Deprioritize stories with high retry counts
      const retryCount = story.frontmatter.retry_count || 0;
      const priorityPenalty = retryCount * 50; // Add 50 to priority per retry
      const completionScore = calculateCompletionScore(story);

      recommendedActions.push({
        type: 'review',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" needs review${retryCount > 0 ? ` (retry ${retryCount})` : ''}`,
        priority: story.frontmatter.priority + 100 + priorityPenalty - completionScore,
      });
    } else {
      const completionScore = calculateCompletionScore(story);
      recommendedActions.push({
        type: 'create_pr',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" is ready for PR`,
        priority: story.frontmatter.priority + 150 - completionScore,
      });
    }
  }

  // Check ready items SECOND (medium priority)
  for (const story of readyItems) {
    const completionScore = calculateCompletionScore(story);
    if (!story.frontmatter.research_complete) {
      recommendedActions.push({
        type: 'research',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" needs research`,
        priority: story.frontmatter.priority + 200 - completionScore,
      });
    } else if (!story.frontmatter.plan_complete) {
      recommendedActions.push({
        type: 'plan',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" needs implementation plan`,
        priority: story.frontmatter.priority + 300 - completionScore,
      });
    } else {
      recommendedActions.push({
        type: 'implement',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" is ready for implementation`,
        priority: story.frontmatter.priority + 400 - completionScore,
      });
    }
  }

  // Check backlog items LAST (lowest priority)
  for (const story of backlogItems) {
    recommendedActions.push({
      type: 'refine',
      storyId: story.frontmatter.id,
      storyPath: story.path,
      reason: `Story "${story.frontmatter.title}" needs refinement`,
      priority: story.frontmatter.priority + 500,
    });
  }

  // Sort actions by priority (lower number = higher priority)
  recommendedActions.sort((a, b) => a.priority - b.priority);

  return {
    backlogItems,
    readyItems,
    inProgressItems,
    doneItems,
    recommendedActions,
  };
}

/**
 * Initialize the kanban folder structure
 */
export function initializeKanban(sdlcRoot: string): void {
  // Create stories/ folder for new architecture
  const storiesFolder = path.join(sdlcRoot, STORIES_FOLDER);
  if (!fs.existsSync(storiesFolder)) {
    fs.mkdirSync(storiesFolder, { recursive: true });
  }
}

/**
 * Check if kanban structure exists
 */
export function kanbanExists(sdlcRoot: string): boolean {
  // Check for new stories/ folder architecture
  const storiesFolder = path.join(sdlcRoot, STORIES_FOLDER);
  return fs.existsSync(storiesFolder);
}

/**
 * Get board statistics
 */
export function getBoardStats(sdlcRoot: string): Record<KanbanFolder, number> {
  const stats: Record<KanbanFolder, number> = {
    backlog: 0,
    ready: 0,
    'in-progress': 0,
    done: 0,
  };

  for (const folder of KANBAN_FOLDERS) {
    stats[folder] = findStoriesByStatus(sdlcRoot, folder).length;
  }

  return stats;
}
