/**
 * Security Reviewer Agent
 *
 * Reviews stories/plans from a security perspective:
 * - Security vulnerability assessment (OWASP Top 10)
 * - Authentication and authorization concerns
 * - Data protection and privacy requirements
 * - Input validation and sanitization
 * - Compliance requirements (GDPR, PCI, etc.)
 * - Dependency security
 *
 * @module agents/perspectives/security-reviewer
 */

import { parseStory, readSectionContent } from '../../core/story.js';
import { runAgentQuery } from '../../core/client.js';
import { getLogger } from '../../core/logger.js';
import type { IProvider } from '../../providers/types.js';
import type { Story } from '../../types/index.js';
import type { AgentOutput, Concern, ConcernSeverity } from '../../types/workflow-config.js';
import type { AgentOptions } from '../research.js';

const SECURITY_SYSTEM_PROMPT = `You are a Security Engineer reviewing a story and its implementation plan from a security perspective.

Your responsibilities:
1. **Vulnerability Assessment**: Identify potential security vulnerabilities (OWASP Top 10)
2. **Authentication/Authorization**: Review auth mechanisms and access control
3. **Data Protection**: Ensure sensitive data is properly handled and protected
4. **Input Validation**: Check for proper input sanitization and validation
5. **Compliance**: Flag any regulatory compliance concerns (GDPR, PCI, HIPAA, etc.)
6. **Dependency Security**: Identify risks from external dependencies

For each concern you raise, categorize it as:
- **blocker**: Critical security vulnerability that must be fixed (data exposure, auth bypass, injection)
- **warning**: Security issue that should be addressed (weak validation, missing rate limiting)
- **suggestion**: Security best practice improvement (additional logging, defense in depth)

Output your review in the following JSON format:
\`\`\`json
{
  "approved": true/false,
  "summary": "Brief summary of your security assessment",
  "riskLevel": "low|medium|high|critical",
  "concerns": [
    {
      "severity": "blocker|warning|suggestion",
      "category": "security",
      "description": "Clear description of the security concern",
      "file": "optional file path if location-specific",
      "cwe": "optional CWE ID (e.g., CWE-79 for XSS)",
      "suggestedFix": "recommended remediation"
    }
  ],
  "positives": ["List of security measures done well"],
  "complianceNotes": ["Any relevant compliance observations"]
}
\`\`\``;

/**
 * Options specific to Security reviewer
 */
export interface SecurityReviewerOptions extends AgentOptions {
  /** Compliance frameworks to consider */
  complianceFrameworks?: ('gdpr' | 'pci' | 'hipaa' | 'soc2' | 'owasp')[];
  /** Whether to do a deep security review (takes longer) */
  deepReview?: boolean;
}

/**
 * Result from Security review
 */
export interface SecurityReviewResult {
  output: AgentOutput;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  positives: string[];
  complianceNotes: string[];
  rawResponse: string;
}

/**
 * Run the Security reviewer agent
 *
 * @param storyPath - Path to the story file
 * @param sdlcRoot - Path to the .ai-sdlc directory
 * @param options - Optional configuration
 * @param provider - Optional AI provider
 * @returns Security review result
 */
export async function runSecurityReviewer(
  storyPath: string,
  sdlcRoot: string,
  options: SecurityReviewerOptions = {},
  provider?: IProvider
): Promise<SecurityReviewResult> {
  const logger = getLogger();
  const startTime = Date.now();
  const story = parseStory(storyPath);

  logger.info('security-reviewer', 'Starting security review', {
    storyId: story.frontmatter.id,
    deepReview: options.deepReview ?? false,
  });

  try {
    // Build the review prompt
    const prompt = await buildReviewPrompt(story, sdlcRoot, options);

    // Execute the query
    const response = provider
      ? await runAgentQuery({
          prompt,
          systemPrompt: SECURITY_SYSTEM_PROMPT,
          workingDirectory: sdlcRoot,
          onProgress: options.onProgress,
        }, provider)
      : await runAgentQuery({
          prompt,
          systemPrompt: SECURITY_SYSTEM_PROMPT,
          workingDirectory: sdlcRoot,
          onProgress: options.onProgress,
        });

    // Parse the response
    const result = parseReviewResponse(response, story.frontmatter.id);

    logger.info('security-reviewer', 'Security review complete', {
      storyId: story.frontmatter.id,
      approved: result.output.approved,
      riskLevel: result.riskLevel,
      concernCount: result.output.concerns.length,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('security-reviewer', 'Security review failed', {
      storyId: story.frontmatter.id,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    });

    // Return a failed result with the error as a blocker
    return {
      output: {
        agentId: 'security',
        role: 'security_reviewer',
        content: `Review failed: ${errorMessage}`,
        concerns: [{
          severity: 'blocker',
          category: 'security',
          description: `Security review failed: ${errorMessage}`,
        }],
        approved: false,
      },
      riskLevel: 'high',
      positives: [],
      complianceNotes: [],
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
  options: SecurityReviewerOptions
): Promise<string> {
  const parts: string[] = [];

  parts.push('# Story to Review (Security Perspective)');
  parts.push(`\n**ID**: ${story.frontmatter.id}`);
  parts.push(`**Title**: ${story.frontmatter.title}`);
  parts.push(`**Type**: ${story.frontmatter.type}`);
  parts.push(`**Status**: ${story.frontmatter.status}`);

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

  // Add compliance frameworks if specified
  if (options.complianceFrameworks && options.complianceFrameworks.length > 0) {
    parts.push('\n## Compliance Frameworks to Consider');
    for (const framework of options.complianceFrameworks) {
      parts.push(`- ${formatFramework(framework)}`);
    }
  }

  // Add deep review instructions if enabled
  if (options.deepReview) {
    parts.push('\n## Deep Review Mode');
    parts.push('This is a deep security review. Please:');
    parts.push('- Analyze potential attack vectors in detail');
    parts.push('- Consider both obvious and subtle security implications');
    parts.push('- Review data flows for potential information leakage');
    parts.push('- Check for security anti-patterns');
  }

  parts.push('\n## Instructions');
  parts.push('Please provide your security review in the JSON format specified in the system prompt.');

  return parts.join('\n');
}

/**
 * Format compliance framework for display
 */
function formatFramework(framework: string): string {
  const frameworkDescriptions: Record<string, string> = {
    gdpr: 'GDPR (General Data Protection Regulation)',
    pci: 'PCI DSS (Payment Card Industry Data Security Standard)',
    hipaa: 'HIPAA (Health Insurance Portability and Accountability Act)',
    soc2: 'SOC 2 (Service Organization Control 2)',
    owasp: 'OWASP Top 10 Security Risks',
  };
  return frameworkDescriptions[framework] || framework;
}

/**
 * Parse the review response from the agent
 */
function parseReviewResponse(response: string, storyId: string): SecurityReviewResult {
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
          agentId: 'security',
          role: 'security_reviewer',
          content: response,
          concerns: [],
          approved: true, // Assume approved if we can't parse
        },
        riskLevel: 'low',
        positives: [],
        complianceNotes: [],
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
        agentId: 'security',
        role: 'security_reviewer',
        content: response,
        concerns: [],
        approved: true,
      },
      riskLevel: 'low',
      positives: [],
      complianceNotes: [],
      rawResponse: response,
    };
  }
}

/**
 * Format parsed JSON result into SecurityReviewResult
 */
function formatParsedResult(
  parsed: Record<string, unknown>,
  storyId: string,
  rawResponse: string
): SecurityReviewResult {
  const concerns: Concern[] = [];

  if (Array.isArray(parsed.concerns)) {
    for (const c of parsed.concerns) {
      if (c && typeof c === 'object') {
        const concern = c as Record<string, unknown>;
        let description = String(concern.description || 'No description provided');

        // Include CWE ID if provided
        if (concern.cwe) {
          description = `[${concern.cwe}] ${description}`;
        }

        concerns.push({
          severity: validateSeverity(concern.severity),
          category: 'security',
          description,
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

  const complianceNotes: string[] = [];
  if (Array.isArray(parsed.complianceNotes)) {
    for (const n of parsed.complianceNotes) {
      if (typeof n === 'string') {
        complianceNotes.push(n);
      }
    }
  }

  return {
    output: {
      agentId: 'security',
      role: 'security_reviewer',
      content: String(parsed.summary || 'No summary provided'),
      concerns,
      approved: Boolean(parsed.approved),
    },
    riskLevel: validateRiskLevel(parsed.riskLevel),
    positives,
    complianceNotes,
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
 * Validate risk level value
 */
function validateRiskLevel(value: unknown): 'low' | 'medium' | 'high' | 'critical' {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value;
  }
  return 'medium'; // Default to medium for unknown values
}
