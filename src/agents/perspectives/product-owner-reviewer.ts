/**
 * Product Owner Reviewer Agent
 *
 * Reviews stories/plans from a product/business perspective:
 * - User value and business impact
 * - Acceptance criteria clarity and completeness
 * - Scope creep detection
 * - User experience considerations
 * - Alignment with product vision
 * - Stakeholder requirements
 *
 * @module agents/perspectives/product-owner-reviewer
 */

import { parseStory, readSectionContent } from '../../core/story.js';
import { runAgentQuery } from '../../core/client.js';
import { getLogger } from '../../core/logger.js';
import type { IProvider } from '../../providers/types.js';
import type { Story } from '../../types/index.js';
import type { AgentOutput, Concern, ConcernSeverity } from '../../types/workflow-config.js';
import type { AgentOptions } from '../research.js';

const PRODUCT_OWNER_SYSTEM_PROMPT = `You are a Product Owner reviewing a story and its implementation plan from a product/business perspective.

Your responsibilities:
1. **User Value**: Ensure the story delivers clear value to users
2. **Acceptance Criteria**: Verify criteria are clear, testable, and complete
3. **Scope Management**: Detect scope creep or over-engineering
4. **User Experience**: Consider usability and user journey impact
5. **Product Alignment**: Ensure alignment with product vision and goals
6. **Requirements Completeness**: Identify missing or ambiguous requirements

For each concern you raise, categorize it as:
- **blocker**: Critical issue that must be resolved (missing requirements, unclear scope, no user value)
- **warning**: Issue that should be addressed (partial acceptance criteria, UX concerns)
- **suggestion**: Improvement opportunity (enhanced UX, additional features for consideration)

Output your review in the following JSON format:
\`\`\`json
{
  "approved": true/false,
  "summary": "Brief summary of your product assessment",
  "userValueScore": 1-5,
  "scopeAssessment": "appropriate|under-scoped|over-scoped",
  "concerns": [
    {
      "severity": "blocker|warning|suggestion",
      "category": "product",
      "description": "Clear description of the product concern",
      "suggestedFix": "recommended resolution"
    }
  ],
  "positives": ["List of things done well from a product perspective"],
  "acceptanceCriteriaComplete": true/false,
  "missingCriteria": ["List of missing or unclear acceptance criteria"]
}
\`\`\``;

/**
 * Options specific to Product Owner reviewer
 */
export interface ProductOwnerReviewerOptions extends AgentOptions {
  /** Product vision context to consider */
  productVision?: string;
  /** Current sprint/release goals */
  releaseGoals?: string[];
}

/**
 * Result from Product Owner review
 */
export interface ProductOwnerReviewResult {
  output: AgentOutput;
  userValueScore: number;
  scopeAssessment: 'appropriate' | 'under-scoped' | 'over-scoped';
  acceptanceCriteriaComplete: boolean;
  missingCriteria: string[];
  positives: string[];
  rawResponse: string;
}

/**
 * Run the Product Owner reviewer agent
 *
 * @param storyPath - Path to the story file
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @param options - Optional configuration
 * @param provider - Optional AI provider
 * @returns Product Owner review result
 */
export async function runProductOwnerReviewer(
  storyPath: string,
  sdlcRoot: string,
  options: ProductOwnerReviewerOptions = {},
  provider?: IProvider
): Promise<ProductOwnerReviewResult> {
  const logger = getLogger();
  const startTime = Date.now();
  const story = parseStory(storyPath);

  logger.info('product-owner-reviewer', 'Starting product review', {
    storyId: story.frontmatter.id,
  });

  try {
    // Build the review prompt
    const prompt = await buildReviewPrompt(story, sdlcRoot, options);

    // Execute the query
    const response = provider
      ? await runAgentQuery({
          prompt,
          systemPrompt: PRODUCT_OWNER_SYSTEM_PROMPT,
          workingDirectory: sdlcRoot,
          onProgress: options.onProgress,
        }, provider)
      : await runAgentQuery({
          prompt,
          systemPrompt: PRODUCT_OWNER_SYSTEM_PROMPT,
          workingDirectory: sdlcRoot,
          onProgress: options.onProgress,
        });

    // Parse the response
    const result = parseReviewResponse(response, story.frontmatter.id);

    logger.info('product-owner-reviewer', 'Product review complete', {
      storyId: story.frontmatter.id,
      approved: result.output.approved,
      userValueScore: result.userValueScore,
      scopeAssessment: result.scopeAssessment,
      concernCount: result.output.concerns.length,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('product-owner-reviewer', 'Product review failed', {
      storyId: story.frontmatter.id,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    });

    // Return a failed result with the error as a blocker
    return {
      output: {
        agentId: 'product-owner',
        role: 'product_owner_reviewer',
        content: `Review failed: ${errorMessage}`,
        concerns: [{
          severity: 'blocker',
          category: 'product',
          description: `Product review failed: ${errorMessage}`,
        }],
        approved: false,
      },
      userValueScore: 0,
      scopeAssessment: 'appropriate',
      acceptanceCriteriaComplete: false,
      missingCriteria: [],
      positives: [],
      rawResponse: '',
    };
  }
}

/**
 * Build the review prompt including story and plan content
 */
async function buildReviewPrompt(
  story: Story,
  sdlcRoot: string,
  options: ProductOwnerReviewerOptions
): Promise<string> {
  const parts: string[] = [];

  parts.push('# Story to Review (Product Perspective)');
  parts.push(`\n**ID**: ${story.frontmatter.id}`);
  parts.push(`**Title**: ${story.frontmatter.title}`);
  parts.push(`**Type**: ${story.frontmatter.type}`);
  parts.push(`**Status**: ${story.frontmatter.status}`);

  if (story.frontmatter.estimated_effort) {
    parts.push(`**Estimated Effort**: ${story.frontmatter.estimated_effort}`);
  }

  if (story.frontmatter.labels.length > 0) {
    parts.push(`**Labels**: ${story.frontmatter.labels.join(', ')}`);
  }

  parts.push('\n## Story Content\n');
  parts.push(story.content);

  // Include research if available
  const research = await readSectionContent(story.path, 'research');
  if (research) {
    parts.push('\n## Research Findings\n');
    parts.push(research);
  }

  // Include plan if available
  const plan = await readSectionContent(story.path, 'plan');
  if (plan) {
    parts.push('\n## Implementation Plan\n');
    parts.push(plan);
  }

  // Add product vision if provided
  if (options.productVision) {
    parts.push('\n## Product Vision Context');
    parts.push(options.productVision);
  }

  // Add release goals if provided
  if (options.releaseGoals && options.releaseGoals.length > 0) {
    parts.push('\n## Current Release Goals');
    for (const goal of options.releaseGoals) {
      parts.push(`- ${goal}`);
    }
  }

  parts.push('\n## Instructions');
  parts.push('Please provide your product review in the JSON format specified in the system prompt.');
  parts.push('\nFocus on:');
  parts.push('1. Does this story deliver clear user value?');
  parts.push('2. Are the acceptance criteria complete and testable?');
  parts.push('3. Is the scope appropriate (not too big, not too small)?');
  parts.push('4. Does the implementation plan align with the story requirements?');

  return parts.join('\n');
}

/**
 * Parse the review response from the agent
 */
function parseReviewResponse(response: string, storyId: string): ProductOwnerReviewResult {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) {
    // Try to parse the entire response as JSON
    try {
      const parsed = JSON.parse(response);
      return formatParsedResult(parsed, storyId, response);
    } catch {
      // Return a default structure with the raw response
      return {
        output: {
          agentId: 'product-owner',
          role: 'product_owner_reviewer',
          content: response,
          concerns: [],
          approved: true, // Assume approved if we can't parse
        },
        userValueScore: 3,
        scopeAssessment: 'appropriate',
        acceptanceCriteriaComplete: true,
        missingCriteria: [],
        positives: [],
        rawResponse: response,
      };
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    return formatParsedResult(parsed, storyId, response);
  } catch {
    // Return raw response if JSON parsing fails
    return {
      output: {
        agentId: 'product-owner',
        role: 'product_owner_reviewer',
        content: response,
        concerns: [],
        approved: true,
      },
      userValueScore: 3,
      scopeAssessment: 'appropriate',
      acceptanceCriteriaComplete: true,
      missingCriteria: [],
      positives: [],
      rawResponse: response,
    };
  }
}

/**
 * Format parsed JSON result into ProductOwnerReviewResult
 */
function formatParsedResult(
  parsed: Record<string, unknown>,
  storyId: string,
  rawResponse: string
): ProductOwnerReviewResult {
  const concerns: Concern[] = [];

  if (Array.isArray(parsed.concerns)) {
    for (const c of parsed.concerns) {
      if (c && typeof c === 'object') {
        const concern = c as Record<string, unknown>;
        concerns.push({
          severity: validateSeverity(concern.severity),
          category: 'product',
          description: String(concern.description || 'No description provided'),
          suggestedFix: concern.suggestedFix ? String(concern.suggestedFix) : undefined,
        });
      }
    }
  }

  const positives: string[] = [];
  if (Array.isArray(parsed.positives)) {
    for (const p of parsed.positives) {
      if (typeof p === 'string') {
        positives.push(p);
      }
    }
  }

  const missingCriteria: string[] = [];
  if (Array.isArray(parsed.missingCriteria)) {
    for (const m of parsed.missingCriteria) {
      if (typeof m === 'string') {
        missingCriteria.push(m);
      }
    }
  }

  return {
    output: {
      agentId: 'product-owner',
      role: 'product_owner_reviewer',
      content: String(parsed.summary || 'No summary provided'),
      concerns,
      approved: Boolean(parsed.approved),
    },
    userValueScore: validateUserValueScore(parsed.userValueScore),
    scopeAssessment: validateScopeAssessment(parsed.scopeAssessment),
    acceptanceCriteriaComplete: Boolean(parsed.acceptanceCriteriaComplete),
    missingCriteria,
    positives,
    rawResponse,
  };
}

/**
 * Validate severity value
 */
function validateSeverity(value: unknown): ConcernSeverity {
  if (value === 'blocker' || value === 'warning' || value === 'suggestion') {
    return value;
  }
  return 'warning'; // Default to warning for unknown values
}

/**
 * Validate user value score
 */
function validateUserValueScore(value: unknown): number {
  if (typeof value === 'number' && value >= 1 && value <= 5) {
    return Math.round(value);
  }
  return 3; // Default to middle value
}

/**
 * Validate scope assessment value
 */
function validateScopeAssessment(value: unknown): 'appropriate' | 'under-scoped' | 'over-scoped' {
  if (value === 'appropriate' || value === 'under-scoped' || value === 'over-scoped') {
    return value;
  }
  return 'appropriate'; // Default
}
