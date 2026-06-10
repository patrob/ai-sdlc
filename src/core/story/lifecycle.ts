import path from 'path';

import { getMostCommonError } from '../../services/error-fingerprint.js';
import { type Config, type FailureDiagnostic,type ReviewAttempt, ReviewDecision, type ReviewResult, type Story } from '../../types/index.js';
import { appendToSection } from './fields.js';
import { parseStory,updateStoryStatus, writeStory } from './io.js';
import { sanitizeReasonText } from './lookup.js';

/**
 * Options for moveToBlocked function
 */
export interface MoveToBlockedOptions {
  /** Whether identical errors were detected during retries */
  identicalErrorsDetected?: boolean;
  /** Number of consecutive identical errors */
  consecutiveIdenticalCount?: number;
  /** Suggested fix or next step */
  suggestedFix?: string;
}

/**
 * Determine the last phase based on story completion flags
 */
function determineLastPhase(story: Story): string {
  if (story.frontmatter.reviews_complete) return 'review';
  if (story.frontmatter.implementation_complete) return 'review';
  if (story.frontmatter.plan_complete) return 'implement';
  if (story.frontmatter.research_complete) return 'plan';
  return 'research';
}

/**
 * Calculate total error count from various retry counters
 */
function calculateErrorCount(story: Story): number {
  const implRetries = story.frontmatter.implementation_retry_count || 0;
  const reviewRetries = story.frontmatter.retry_count || 0;
  const refinements = story.frontmatter.refinement_count || 0;
  const totalRecovery = story.frontmatter.total_recovery_attempts || 0;

  // Use total_recovery_attempts if available, otherwise sum the others
  return totalRecovery || (implRetries + reviewRetries + refinements);
}

/**
 * Generate a failure diagnostic summary for a blocked story.
 *
 * Provides human-readable context for debugging stuck stories:
 * - What phase was the story in
 * - How many errors occurred
 * - What the most common error was
 * - Whether identical errors were detected (stuck loop indicator)
 */
export function generateFailureDiagnostic(
  story: Story,
  reason: string,
  options?: MoveToBlockedOptions
): FailureDiagnostic {
  const errorHistory = story.frontmatter.error_history || [];
  const mostCommonError = getMostCommonError(errorHistory);

  // Build diagnostic object, only including defined optional fields
  // YAML serialization fails on undefined values
  const diagnostic: FailureDiagnostic = {
    blockedAt: new Date().toISOString(),
    reason: sanitizeReasonText(reason),
    lastPhase: determineLastPhase(story),
    errorCount: calculateErrorCount(story),
    mostCommonError: mostCommonError || sanitizeReasonText(reason).substring(0, 200),
  };

  // Only add optional fields if they have values
  if (options?.suggestedFix !== undefined) {
    diagnostic.suggestedFix = options.suggestedFix;
  }
  if (options?.identicalErrorsDetected !== undefined) {
    diagnostic.identicalErrorsDetected = options.identicalErrorsDetected;
  }
  if (options?.consecutiveIdenticalCount !== undefined) {
    diagnostic.consecutiveIdenticalCount = options.consecutiveIdenticalCount;
  }

  return diagnostic;
}

/**
 * Move a story to blocked status with reason, timestamp, and diagnostic summary
 * In the new architecture, this only updates frontmatter - file path remains unchanged
 *
 * @param storyPath - Absolute path to the story file
 * @param reason - Reason for blocking (e.g., "Max refinement attempts (2/2) reached")
 * @param options - Optional additional context for diagnostics
 */
export async function moveToBlocked(
  storyPath: string,
  reason: string,
  options?: MoveToBlockedOptions
): Promise<void> {
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

  // Generate diagnostic summary
  const diagnostic = generateFailureDiagnostic(story, reason, options);

  // Update frontmatter only - no file moves in new architecture
  story.frontmatter.status = 'blocked';
  story.frontmatter.blocked_reason = sanitizeReasonText(reason);
  story.frontmatter.blocked_at = new Date().toISOString();
  story.frontmatter.blocked_diagnostic = diagnostic;
  story.frontmatter.updated = new Date().toISOString().split('T')[0];

  // Write back to same location
  await writeStory(story);
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
 * Check if a story's PR has been merged
 */
export function isPRMerged(story: Story): boolean {
  return story.frontmatter.pr_merged === true;
}

/**
 * Mark a story's PR as merged and record the merge details
 *
 * @param story - The story to update
 * @param mergeSha - The SHA of the merge commit (optional)
 * @returns Updated story with merge metadata
 */
export async function markPRMerged(story: Story, mergeSha?: string): Promise<Story> {
  story.frontmatter.pr_merged = true;
  story.frontmatter.merged_at = new Date().toISOString();
  if (mergeSha) {
    story.frontmatter.merge_sha = mergeSha;
  }
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

