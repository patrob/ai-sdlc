import path from 'path';
import {
  parseStory,
  recordRefinementAttempt,
  canRetryRefinement,
  resetPhaseCompletion,
  appendRefinementNote,
  getRefinementCount,
  incrementTotalRecoveryAttempts,
} from '../core/story.js';
import { loadConfig } from '../core/config.js';
import { getLogger } from '../core/logger.js';
import { AgentResult, ReviewResult, ReworkContext } from '../types/index.js';

/**
 * Rework Agent
 *
 * Coordinates sending failed work back to the appropriate agent for refinement.
 * Implements circuit breaker pattern to prevent infinite loops.
 */
export async function runReworkAgent(
  storyPath: string,
  sdlcRoot: string,
  context: ReworkContext
): Promise<AgentResult> {
  const logger = getLogger();
  const startTime = Date.now();
  const story = parseStory(storyPath);
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);
  const config = loadConfig(workingDir);

  logger.info('rework', 'Starting rework phase', {
    storyId: story.frontmatter.id,
    targetPhase: context.targetPhase,
    refinementCount: getRefinementCount(story),
  });

  try {
    const { reviewFeedback, targetPhase } = context;

    // Check circuit breaker - can we retry?
    if (!canRetryRefinement(story, config.refinement.maxIterations)) {
      const refinementCount = getRefinementCount(story);
      const maxAttempts = story.frontmatter.max_refinement_attempts || config.refinement.maxIterations;
      const errorMsg = `Circuit breaker activated: Story has reached maximum refinement attempts (${refinementCount}/${maxAttempts}). Manual intervention required.`;

      story.frontmatter.last_error = errorMsg;

      return {
        success: false,
        story,
        changesMade,
        error: errorMsg,
      };
    }

    // Record this refinement attempt
    const feedbackSummary = formatFeedbackSummary(reviewFeedback);
    await recordRefinementAttempt(story, targetPhase, feedbackSummary);
    const currentIteration = getRefinementCount(story);

    // Increment global recovery counter
    await incrementTotalRecoveryAttempts(story);

    changesMade.push(`Recorded refinement attempt ${currentIteration}`);

    // Append detailed feedback to Review Notes section
    const refinementNote = formatRefinementNote(currentIteration, targetPhase, reviewFeedback);
    await appendRefinementNote(story, currentIteration, refinementNote);
    changesMade.push(`Added refinement iteration ${currentIteration} notes to story`);

    // Reset the appropriate completion flag
    await resetPhaseCompletion(story, targetPhase);
    changesMade.push(`Reset ${targetPhase}_complete flag for rework`);

    // Clear any previous error
    if (story.frontmatter.last_error) {
      story.frontmatter.last_error = undefined;
      changesMade.push('Cleared previous error');
    }

    logger.info('rework', 'Rework phase complete', {
      storyId: story.frontmatter.id,
      durationMs: Date.now() - startTime,
      targetPhase: context.targetPhase,
      refinementIteration: getRefinementCount(story),
    });

    return {
      success: true,
      story: parseStory(storyPath), // Reload to get fresh state
      changesMade,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('rework', 'Rework phase failed', {
      storyId: story.frontmatter.id,
      durationMs: Date.now() - startTime,
      error: errorMsg,
    });

    return {
      success: false,
      story,
      changesMade,
      error: errorMsg,
    };
  }
}

/**
 * Determine which phase needs rework based on review feedback
 */
export function determineTargetPhase(reviewResult: ReviewResult): 'research' | 'plan' | 'implement' {
  // Check issue categories to determine which phase to target
  const issues = reviewResult.issues || [];
  const categories = issues.map(i => i.category.toLowerCase());

  // If missing research or requirements issues, go back to research
  if (
    categories.some(c =>
      c.includes('research') ||
      c.includes('requirement') ||
      c.includes('understanding') ||
      c.includes('missing information')
    )
  ) {
    return 'research';
  }

  // If architecture, design, or approach issues, go back to planning
  if (
    categories.some(c =>
      c.includes('plan') ||
      c.includes('architecture') ||
      c.includes('design') ||
      c.includes('approach')
    )
  ) {
    return 'plan';
  }

  // Default to implementation for code quality, security, testing issues
  return 'implement';
}

/**
 * Format feedback summary for frontmatter storage
 */
function formatFeedbackSummary(reviewResult: ReviewResult): string {
  const issues = reviewResult.issues || [];
  const blockerCount = issues.filter(i => i.severity === 'blocker').length;
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const majorCount = issues.filter(i => i.severity === 'major').length;

  const parts: string[] = [];
  if (blockerCount > 0) parts.push(`${blockerCount} blocker(s)`);
  if (criticalCount > 0) parts.push(`${criticalCount} critical`);
  if (majorCount > 0) parts.push(`${majorCount} major`);

  return `Review failed: ${parts.join(', ')}`;
}

/**
 * Format detailed refinement note for story content
 */
function formatRefinementNote(
  iteration: number,
  targetPhase: string,
  reviewResult: ReviewResult
): string {
  const timestamp = new Date().toISOString().split('T')[0];

  let note = `**Refinement Required** (Iteration ${iteration})\n\n`;
  note += `*Date: ${timestamp}*\n`;
  note += `*Target Phase: ${targetPhase}*\n\n`;
  note += `**Issues Identified:**\n\n`;
  note += reviewResult.feedback;
  note += `\n\n**Action Required:**\n`;
  note += `The ${targetPhase} phase needs to be reworked to address the above issues. `;
  note += `The workflow will automatically restart the ${targetPhase} agent with this feedback context.\n`;

  return note;
}

/**
 * Package rework context for the target agent
 */
export function packageReworkContext(
  story: any,
  reviewFeedback: ReviewResult
): string {
  const iteration = getRefinementCount(story);
  const previousAttempts = story.frontmatter.refinement_iterations || [];

  let context = `## Rework Context (Iteration ${iteration})\n\n`;
  context += `This is a refinement iteration. The previous work did not pass review.\n\n`;

  if (previousAttempts.length > 1) {
    context += `### Previous Attempts\n`;
    for (const attempt of previousAttempts.slice(0, -1)) {
      context += `- Iteration ${attempt.iteration}: ${attempt.result}\n`;
    }
    context += '\n';
  }

  context += `### Latest Review Feedback\n\n`;
  context += reviewFeedback.feedback;
  context += `\n\n### Instructions\n\n`;
  context += `Please address ALL of the issues identified above. `;
  context += `Pay special attention to blocker and critical severity issues as these must be resolved.\n`;

  return context;
}
