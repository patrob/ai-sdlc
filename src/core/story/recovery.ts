import { Story, Config } from '../../types/index.js';
import { writeStory } from './io.js';

/**
 * Global recovery circuit breaker limit
 */
export const GLOBAL_RECOVERY_LIMIT = 10;

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
