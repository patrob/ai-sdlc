import { ReviewDecision, type Story } from '../../types/index.js';
import { getLatestReviewAttempt } from '../story.js';

/**
 * Calculate completion score for a story based on workflow progress.
 * Higher scores indicate more progress toward completion.
 * Used to prioritize nearly-complete stories over early-stage ones.
 */
export function calculateCompletionScore(story: Story): number {
  let score = 0;
  if (story.frontmatter.reviews_complete) score += 40;
  if (story.frontmatter.implementation_complete) score += 30;
  if (story.frontmatter.plan_review_complete) score += 25;
  if (story.frontmatter.plan_complete) score += 20;
  if (story.frontmatter.research_complete) score += 10;
  return score;
}

/**
 * Check if a story has a failed review that needs rework
 */
export function hasFailedReview(story: Story): boolean {
  const latestReview = getLatestReviewAttempt(story);
  if (!latestReview) {
    return false;
  }

  // Check if the latest review was rejected (not failed - that's a review agent error)
  return latestReview.decision === ReviewDecision.REJECTED;
}
