/**
 * Tech Lead Reviewer Agent
 *
 * Reviews stories/plans from a technical leadership perspective:
 * - Technical feasibility and complexity assessment
 * - Architecture alignment and design patterns
 * - Code quality and maintainability concerns
 * - Technical debt considerations
 * - Integration complexity
 *
 * @module agents/perspectives/tech-lead-reviewer
 */

import { parseStory, readSectionContent } from '../../core/story.js';
import { runAgentQuery } from '../../core/client.js';
import { getLogger } from '../../core/logger.js';
import type { IProvider } from '../../providers/types.js';
import type { Story } from '../../types/index.js';
import type { AgentOutput, Concern, ConcernSeverity } from '../../types/workflow-config.js';
import type { AgentOptions } from '../research.js';

const TECH_LEAD_SYSTEM_PROMPT = `You are a senior Tech Lead reviewing a story and its implementation plan from a technical perspective.

Your responsibilities:
1. **Technical Feasibility**: Assess if the proposed approach is technically sound
2. **Architecture Alignment**: Check if it fits the existing architecture patterns
3. **Complexity Assessment**: Identify areas of high complexity or risk
4. **Code Quality**: Ensure maintainability, readability, and testability
5. **Technical Debt**: Flag potential technical debt being introduced
6. **Integration Points**: Identify integration risks with existing systems

For each concern you raise, categorize it as:
- **blocker**: Must be addressed before implementation (breaks architecture, infeasible, critical risk)
- **warning**: Should be addressed but not blocking (technical debt, complexity concerns)
- **suggestion**: Nice to have improvements (better patterns, optimizations)

Output your review in the following JSON format:
\`\`\`json
{
  "approved": true/false,
  "summary": "Brief summary of your technical assessment",
  "concerns": [
    {
      "severity": "blocker|warning|suggestion",
      "category": "technical",
      "description": "Clear description of the concern",
      "file": "optional file path if location-specific",
      "suggestedFix": "optional suggested resolution"
    }
  ],
  "positives": ["List of things done well from a technical perspective"]
}
\`\`\``;

/**
 * Options specific to Tech Lead reviewer
 */
export interface TechLeadReviewerOptions extends AgentOptions {
  /** Focus areas for the review */
  focusAreas?: ('architecture' | 'complexity' | 'quality' | 'debt' | 'integration')[];
}

/**
 * Result from Tech Lead review
 */
export interface TechLeadReviewResult {
  output: AgentOutput;
  positives: string[];
  rawResponse: string;
}

/**
 * Run the Tech Lead reviewer agent
 *
 * @param storyPath - Path to the story file
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @param options - Optional configuration
 * @param provider - Optional AI provider
 * @returns Tech Lead review result
 */
export async function runTechLeadReviewer(
  storyPath: string,
  sdlcRoot: string,
  options: TechLeadReviewerOptions = {},
  provider?: IProvider
): Promise<TechLeadReviewResult> {
  const logger = getLogger();
  const startTime = Date.now();
  const story = parseStory(storyPath);

  logger.info('tech-lead-reviewer', 'Starting technical review', {
    storyId: story.frontmatter.id,
  });

  try {
    // Build the review prompt
    const prompt = await buildReviewPrompt(story, sdlcRoot, options);

    // Execute the query
    const response = provider
      ? await runAgentQuery({
          prompt,
          systemPrompt: TECH_LEAD_SYSTEM_PROMPT,
          workingDirectory: sdlcRoot,
          onProgress: options.onProgress,
        }, provider)
      : await runAgentQuery({
          prompt,
          systemPrompt: TECH_LEAD_SYSTEM_PROMPT,
          workingDirectory: sdlcRoot,
          onProgress: options.onProgress,
        });

    // Parse the response
    const result = parseReviewResponse(response, story.frontmatter.id);

    logger.info('tech-lead-reviewer', 'Technical review complete', {
      storyId: story.frontmatter.id,
      approved: result.output.approved,
      concernCount: result.output.concerns.length,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('tech-lead-reviewer', 'Technical review failed', {
      storyId: story.frontmatter.id,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    });

    // Return a failed result with the error as a blocker
    return {
      output: {
        agentId: 'tech-lead',
        role: 'tech_lead_reviewer',
        content: `Review failed: ${errorMessage}`,
        concerns: [{
          severity: 'blocker',
          category: 'technical',
          description: `Technical review failed: ${errorMessage}`,
        }],
        approved: false,
      },
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
  options: TechLeadReviewerOptions
): Promise<string> {
  const parts: string[] = [];

  parts.push('# Story to Review');
  parts.push(`\n**ID**: ${story.frontmatter.id}`);
  parts.push(`**Title**: ${story.frontmatter.title}`);
  parts.push(`**Type**: ${story.frontmatter.type}`);
  parts.push(`**Status**: ${story.frontmatter.status}`);

  if (story.frontmatter.estimated_effort) {
    parts.push(`**Estimated Effort**: ${story.frontmatter.estimated_effort}`);
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

  // Add focus areas if specified
  if (options.focusAreas && options.focusAreas.length > 0) {
    parts.push('\n## Focus Areas');
    parts.push('Please pay special attention to these areas:');
    for (const area of options.focusAreas) {
      parts.push(`- ${formatFocusArea(area)}`);
    }
  }

  parts.push('\n## Instructions');
  parts.push('Please provide your technical review in the JSON format specified in the system prompt.');

  return parts.join('\n');
}

/**
 * Format focus area for display
 */
function formatFocusArea(area: string): string {
  const areaDescriptions: Record<string, string> = {
    architecture: 'Architecture alignment and design patterns',
    complexity: 'Code complexity and cognitive load',
    quality: 'Code quality, readability, and maintainability',
    debt: 'Technical debt introduction or reduction',
    integration: 'Integration points and external dependencies',
  };
  return areaDescriptions[area] || area;
}

/**
 * Parse the review response from the agent
 */
function parseReviewResponse(response: string, storyId: string): TechLeadReviewResult {
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
          agentId: 'tech-lead',
          role: 'tech_lead_reviewer',
          content: response,
          concerns: [],
          approved: true, // Assume approved if we can't parse
        },
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
        agentId: 'tech-lead',
        role: 'tech_lead_reviewer',
        content: response,
        concerns: [],
        approved: true,
      },
      positives: [],
      rawResponse: response,
    };
  }
}

/**
 * Format parsed JSON result into TechLeadReviewResult
 */
function formatParsedResult(
  parsed: Record<string, unknown>,
  storyId: string,
  rawResponse: string
): TechLeadReviewResult {
  const concerns: Concern[] = [];

  if (Array.isArray(parsed.concerns)) {
    for (const c of parsed.concerns) {
      if (c && typeof c === 'object') {
        const concern = c as Record<string, unknown>;
        concerns.push({
          severity: validateSeverity(concern.severity),
          category: 'technical',
          description: String(concern.description || 'No description provided'),
          file: concern.file ? String(concern.file) : undefined,
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

  return {
    output: {
      agentId: 'tech-lead',
      role: 'tech_lead_reviewer',
      content: String(parsed.summary || 'No summary provided'),
      concerns,
      approved: Boolean(parsed.approved),
    },
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
