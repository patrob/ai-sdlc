import { z } from 'zod';
import { parseStory, updateStoryField, writeStory, writeSectionContent, readSectionContent } from '../core/story.js';
import { runAgentQuery } from '../core/client.js';
import { getLogger } from '../core/logger.js';
import { Story, AgentResult } from '../types/index.js';
import path from 'path';
import type { AgentOptions } from './research.js';
import type { IProvider } from '../providers/types.js';

/**
 * Individual suggestion from plan review
 */
export interface PlanReviewSuggestion {
  perspective: 'techLead' | 'security' | 'productOwner';
  category: string;
  description: string;
  severity: 'blocking' | 'important' | 'suggestion';
  suggestedChange?: string;
}

/**
 * Plan review result with perspective satisfaction
 */
export interface PlanReviewResult extends AgentResult {
  perspectivesSatisfied: {
    techLead: boolean;
    security: boolean;
    productOwner: boolean;
  };
  overallReady: boolean;
  suggestions: PlanReviewSuggestion[];
  iteration: number;
}

/**
 * Zod schema for validating LLM plan review responses
 */
const PlanReviewSuggestionSchema = z.object({
  perspective: z.enum(['techLead', 'security', 'productOwner']),
  category: z.string().max(100),
  description: z.string().max(2000),
  severity: z.enum(['blocking', 'important', 'suggestion']),
  suggestedChange: z.string().max(2000).optional(),
});

const PlanReviewResponseSchema = z.object({
  perspectivesSatisfied: z.object({
    techLead: z.boolean(),
    security: z.boolean(),
    productOwner: z.boolean(),
  }),
  suggestions: z.array(PlanReviewSuggestionSchema),
});

/**
 * System prompt for the plan review agent
 */
export const PLAN_REVIEW_SYSTEM_PROMPT = `You are a multi-perspective plan reviewer. Your job is to evaluate implementation plans from three distinct perspectives before implementation begins. This "shifts left" by catching issues early when they're cheaper to fix.

## Your Three Perspectives

### 1. Tech Lead Perspective
Evaluate the plan's technical soundness:
- Is the task breakdown logical and complete?
- Are dependencies between tasks correctly identified?
- Does it follow established codebase patterns?
- Is the scope appropriate (not too big, not missing pieces)?
- Are there any architectural concerns?
- Is the testing strategy adequate?

### 2. Security Engineer Perspective
Evaluate security implications:
- Are there input validation considerations?
- Does it handle authentication/authorization properly?
- Are there data exposure risks?
- Does it follow secure coding practices?
- Are sensitive operations properly protected?
- Should threat modeling be done for any part?

### 3. Product Owner Perspective
Evaluate alignment with requirements:
- Does the plan cover ALL acceptance criteria?
- Are edge cases accounted for?
- Is the user experience considered?
- Are error states handled appropriately?
- Does it deliver the intended user value?

## Response Format

You MUST respond with valid JSON in this exact format:

\`\`\`json
{
  "perspectivesSatisfied": {
    "techLead": true,
    "security": true,
    "productOwner": false
  },
  "suggestions": [
    {
      "perspective": "productOwner",
      "category": "acceptance_criteria",
      "description": "The plan doesn't include handling for the edge case where...",
      "severity": "blocking",
      "suggestedChange": "Add a task to handle the case when..."
    }
  ]
}
\`\`\`

## Severity Levels

- **blocking**: The plan cannot proceed without addressing this. Critical security issues, missing core functionality.
- **important**: Should be addressed for a solid implementation. Significant gaps but not showstoppers.
- **suggestion**: Nice-to-have improvements. Can proceed without but would improve quality.

## Rules

1. Be constructive - shape the plan, don't just reject
2. Provide specific, actionable suggestions
3. Only mark a perspective as "not satisfied" if there are blocking or important issues
4. Consider the iterative nature - subsequent implementation review will catch more
5. Focus on what CAN'T be easily fixed later (architecture, security design)`;

/**
 * Build the plan review prompt
 */
export function buildPlanReviewPrompt(
  story: Story,
  planContent: string,
  iteration: number,
  previousFeedback?: string
): string {
  let prompt = `## Story Requirements

**Title:** ${story.frontmatter.title}

**Story Content:**
${story.content}

## Implementation Plan to Review

${planContent}

---

Please evaluate this implementation plan from all three perspectives (Tech Lead, Security Engineer, Product Owner).`;

  if (iteration > 1 && previousFeedback) {
    prompt += `

## Previous Review Feedback (Iteration ${iteration - 1})

The plan was previously reviewed and refined. Here is the feedback that was addressed:

${previousFeedback}

Please verify that the previous concerns have been adequately addressed, and identify any new or remaining issues.`;
  }

  prompt += `

Respond with a JSON object containing your evaluation. Remember:
- Mark perspectivesSatisfied as true/false for each perspective
- Provide specific suggestions for any issues found
- A perspective should be satisfied if there are no blocking or important issues from that viewpoint`;

  return prompt;
}

/**
 * Parse the LLM response into structured PlanReviewResult
 */
export function parsePlanReviewResponse(
  response: string,
  story: Story,
  iteration: number
): PlanReviewResult {
  // Extract JSON from response (may be wrapped in markdown code blocks)
  let jsonStr = response;

  // Try to extract from code block
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try to extract JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const validated = PlanReviewResponseSchema.parse(parsed);

    // Calculate overall readiness
    const allSatisfied =
      validated.perspectivesSatisfied.techLead &&
      validated.perspectivesSatisfied.security &&
      validated.perspectivesSatisfied.productOwner;

    // Even if all perspectives are satisfied, check for blocking issues
    const hasBlockingIssues = validated.suggestions.some(s => s.severity === 'blocking');

    return {
      success: true,
      story,
      changesMade: [],
      perspectivesSatisfied: validated.perspectivesSatisfied,
      overallReady: allSatisfied && !hasBlockingIssues,
      suggestions: validated.suggestions as PlanReviewSuggestion[],
      iteration,
    };
  } catch (error) {
    // If parsing fails, return a conservative result
    const logger = getLogger();
    logger.warn('plan-review', 'Failed to parse plan review response', {
      error: error instanceof Error ? error.message : String(error),
      responseLength: response.length,
    });

    return {
      success: true,
      story,
      changesMade: [],
      perspectivesSatisfied: {
        techLead: false,
        security: false,
        productOwner: false,
      },
      overallReady: false,
      suggestions: [{
        perspective: 'techLead',
        category: 'parsing_error',
        description: 'Failed to parse plan review response. Manual review recommended.',
        severity: 'blocking',
      }],
      iteration,
    };
  }
}

/**
 * Format suggestions for display/storage
 */
export function formatSuggestions(suggestions: PlanReviewSuggestion[]): string {
  if (suggestions.length === 0) {
    return 'No suggestions - plan approved!';
  }

  const grouped: Record<string, PlanReviewSuggestion[]> = {
    techLead: [],
    security: [],
    productOwner: [],
  };

  for (const suggestion of suggestions) {
    grouped[suggestion.perspective].push(suggestion);
  }

  const perspectiveLabels: Record<string, string> = {
    techLead: 'Tech Lead Perspective',
    security: 'Security Engineer Perspective',
    productOwner: 'Product Owner Perspective',
  };

  const sections: string[] = [];

  for (const [key, label] of Object.entries(perspectiveLabels)) {
    const items = grouped[key];
    if (items.length > 0) {
      sections.push(`### ${label}\n` +
        items.map(s =>
          `- **[${s.severity}]** ${s.description}${s.suggestedChange ? `\n  - Suggested: ${s.suggestedChange}` : ''}`
        ).join('\n'));
    }
  }

  return sections.join('\n\n');
}

/**
 * Plan Review Agent
 *
 * Single-pass enrichment step that evaluates implementation plans from three
 * perspectives (Tech Lead, Security, PO) before implementation begins.
 * Perspectives and suggestions are written to plan_review.md as documentation
 * for the implementer. Always proceeds to implementation after capture.
 */
export async function runPlanReviewAgent(
  storyPath: string,
  sdlcRoot: string,
  options: AgentOptions = {},
  provider?: IProvider
): Promise<PlanReviewResult> {
  const logger = getLogger();
  const startTime = Date.now();
  const story = parseStory(storyPath);
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);

  // Get current iteration
  const iteration = (story.frontmatter.plan_review_iteration ?? 0) + 1;

  logger.info('plan-review', 'Starting plan review phase', {
    storyId: story.frontmatter.id,
    iteration,
  });

  try {
    // Read the existing plan
    const planContent = await readSectionContent(storyPath, 'plan');
    if (!planContent) {
      return {
        success: false,
        story,
        changesMade,
        error: 'No plan found to review. Run planning phase first.',
        perspectivesSatisfied: { techLead: false, security: false, productOwner: false },
        overallReady: false,
        suggestions: [],
        iteration,
      };
    }

    // Read previous feedback if this is a refinement iteration
    let previousFeedback: string | undefined;
    if (iteration > 1) {
      previousFeedback = await readSectionContent(storyPath, 'plan_review');
    }

    // Build prompt and run review
    const prompt = buildPlanReviewPrompt(story, planContent, iteration, previousFeedback);

    const queryOptions = {
      prompt,
      systemPrompt: PLAN_REVIEW_SYSTEM_PROMPT,
      workingDirectory: workingDir,
      onProgress: options.onProgress,
    };

    const response = provider
      ? await runAgentQuery(queryOptions, provider)
      : await runAgentQuery(queryOptions);

    // Parse the response
    const result = parsePlanReviewResponse(response, story, iteration);

    // Write feedback to section file
    const feedbackContent = `## Plan Review - Iteration ${iteration}

**Date:** ${new Date().toISOString()}

### Perspectives Satisfied
- Tech Lead: ${result.perspectivesSatisfied.techLead ? '✅' : '❌'}
- Security: ${result.perspectivesSatisfied.security ? '✅' : '❌'}
- Product Owner: ${result.perspectivesSatisfied.productOwner ? '✅' : '❌'}

### Overall Ready: ${result.overallReady ? '✅ Yes' : '❌ No'}

### Feedback

${formatSuggestions(result.suggestions)}
`;

    await writeSectionContent(storyPath, 'plan_review', feedbackContent, {
      append: iteration > 1,
      iteration,
    });
    changesMade.push(`Wrote plan review feedback (iteration ${iteration})`);

    // Update story: set iteration counter and mark complete (enrichment, not a gate)
    let updatedStory = await updateStoryField(story, 'plan_review_iteration', iteration);
    updatedStory = await updateStoryField(updatedStory, 'plan_review_complete', true);
    await writeStory(updatedStory);
    changesMade.push('Marked plan_review_complete: true');

    logger.info('plan-review', 'Plan review complete - perspectives captured', {
      storyId: story.frontmatter.id,
      iteration,
      perspectivesSatisfied: result.perspectivesSatisfied,
      suggestionsCount: result.suggestions.length,
      durationMs: Date.now() - startTime,
    });

    // Re-read story to return updated state
    const finalStory = parseStory(storyPath);

    return {
      ...result,
      success: true,
      story: finalStory,
      changesMade,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('plan-review', 'Plan review phase failed', {
      storyId: story.frontmatter.id,
      iteration,
      durationMs: Date.now() - startTime,
      error: errorMessage,
    });

    return {
      success: false,
      story,
      changesMade,
      error: errorMessage,
      perspectivesSatisfied: { techLead: false, security: false, productOwner: false },
      overallReady: false,
      suggestions: [],
      iteration,
    };
  }
}
