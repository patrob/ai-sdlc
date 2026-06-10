import path from 'path';

import { determineTargetPhase } from '../../agents/rework.js';
import { type Action, type StateAssessment } from '../../types/index.js';
import { loadConfig } from '../config.js';
import { canRetryRefinement, getEffectiveMaxRetries, getLatestReviewAttempt, isAtMaxRetries, moveToBlocked, sanitizeReasonText } from '../story.js';
import { calculateCompletionScore, hasFailedReview } from './completion-score.js';
import { findStoriesByStatus } from './discovery.js';

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
    } else if (!story.frontmatter.pr_url) {
      const completionScore = calculateCompletionScore(story);
      recommendedActions.push({
        type: 'create_pr',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" is ready for PR`,
        priority: story.frontmatter.priority + 150 - completionScore,
      });
    } else if (config.merge?.enabled && !story.frontmatter.pr_merged) {
      const completionScore = calculateCompletionScore(story);
      recommendedActions.push({
        type: 'merge',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" has PR ready to merge`,
        priority: story.frontmatter.priority + 155 - completionScore,
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
    } else if (!story.frontmatter.plan_review_complete) {
      // Plan review: evaluate plan from Tech Lead, Security, and PO perspectives
      recommendedActions.push({
        type: 'plan_review',
        storyId: story.frontmatter.id,
        storyPath: story.path,
        reason: `Story "${story.frontmatter.title}" needs plan review`,
        priority: story.frontmatter.priority + 350 - completionScore,
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
