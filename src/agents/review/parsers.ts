import { getLogger } from '../../core/logger.js';
import { extractStructuredResponseSync } from '../../core/llm-utils.js';
import type { ReviewIssue, ReviewIssueSeverity } from '../../types/index.js';
import { ReviewSeverity } from '../../types/index.js';
import { ReviewResponseSchema } from './schemas.js';

/**
 * Parse review response and extract structured issues
 * Uses extractStructuredResponseSync for robust parsing with multiple strategies:
 * 1. Direct JSON parse
 * 2. JSON within markdown code blocks
 * 3. JSON with leading/trailing text stripped
 * 4. YAML format fallback
 *
 * Security: Uses zod schema validation to prevent malicious JSON
 */
export function parseReviewResponse(response: string, reviewType: string): { passed: boolean; issues: ReviewIssue[] } {
  const logger = getLogger();

  // Use the robust extraction utility with all strategies
  const extractionResult = extractStructuredResponseSync(response, ReviewResponseSchema, false);

  if (extractionResult.success && extractionResult.data) {
    const validated = extractionResult.data;

    logger.debug('review', `Successfully parsed review response using strategy: ${extractionResult.strategy}`, {
      reviewType,
      strategy: extractionResult.strategy,
      issueCount: validated.issues.length,
    });

    // Map validated data to ReviewIssue format (additional sanitization)
    const issues: ReviewIssue[] = validated.issues.map((issue) => ({
      severity: issue.severity as ReviewIssueSeverity,
      category: issue.category,
      description: issue.description,
      file: issue.file,
      line: issue.line,
      suggestedFix: issue.suggestedFix,
      perspectives: issue.perspectives,
    }));

    return {
      passed: validated.passed !== false && issues.filter(i => i.severity === 'blocker' || i.severity === 'critical').length === 0,
      issues,
    };
  }

  // All extraction strategies failed - log raw response for debugging and use text fallback
  logger.warn('review', 'All extraction strategies failed for review response', {
    reviewType,
    error: extractionResult.error,
    responsePreview: response.substring(0, 200),
  });

  return parseTextReview(response, reviewType);
}

/**
 * Fallback: Parse text-based review response (for when LLM doesn't return JSON)
 */
export function parseTextReview(response: string, reviewType: string): { passed: boolean; issues: ReviewIssue[] } {
  const lowerResponse = response.toLowerCase();
  const issues: ReviewIssue[] = [];

  // Check for blocking keywords
  if (lowerResponse.includes('block') || lowerResponse.includes('must fix') || lowerResponse.includes('critical security')) {
    issues.push({
      severity: 'blocker',
      category: reviewType.toLowerCase().replace(' ', '_'),
      description: response.substring(0, 500), // First 500 chars as description
    });
  } else if (lowerResponse.includes('critical') || lowerResponse.includes('major issue') || lowerResponse.includes('reject')) {
    issues.push({
      severity: 'critical',
      category: reviewType.toLowerCase().replace(' ', '_'),
      description: response.substring(0, 500),
    });
  } else if (lowerResponse.includes('should fix') || lowerResponse.includes('improvement needed')) {
    issues.push({
      severity: 'major',
      category: reviewType.toLowerCase().replace(' ', '_'),
      description: response.substring(0, 500),
    });
  }

  // Determine pass/fail
  const passed = lowerResponse.includes('approve') ||
                 lowerResponse.includes('looks good') ||
                 lowerResponse.includes('pass') ||
                 issues.length === 0;

  return { passed: passed && issues.length === 0, issues };
}

/**
 * Determine the overall severity of review issues
 */
export function determineReviewSeverity(issues: ReviewIssue[]): ReviewSeverity {
  const blockerCount = issues.filter(i => i.severity === 'blocker').length;
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const majorCount = issues.filter(i => i.severity === 'major').length;

  if (blockerCount > 0) {
    return ReviewSeverity.CRITICAL;
  } else if (criticalCount >= 2) {
    return ReviewSeverity.HIGH;
  } else if (criticalCount === 1 || majorCount > 0) {
    return ReviewSeverity.MEDIUM;
  } else {
    return ReviewSeverity.LOW;
  }
}

/**
 * Derive individual perspective pass/fail status from issues
 *
 * For backward compatibility with ReviewAttempt structure, determines whether
 * each perspective (code, security, po) would pass based on issues flagged
 * for that perspective.
 *
 * A perspective fails if it has any blocker or critical issues.
 *
 * @param issues - Array of review issues with perspectives field
 * @returns Object with pass/fail status for each perspective
 */
export function deriveIndividualPassFailFromPerspectives(issues: ReviewIssue[]): {
  codeReviewPassed: boolean;
  securityReviewPassed: boolean;
  poReviewPassed: boolean;
} {
  // Check if any blocker/critical issues exist for each perspective
  const codeIssues = issues.filter(i =>
    i.perspectives?.includes('code') &&
    (i.severity === 'blocker' || i.severity === 'critical')
  );

  const securityIssues = issues.filter(i =>
    i.perspectives?.includes('security') &&
    (i.severity === 'blocker' || i.severity === 'critical')
  );

  const poIssues = issues.filter(i =>
    i.perspectives?.includes('po') &&
    (i.severity === 'blocker' || i.severity === 'critical')
  );

  return {
    codeReviewPassed: codeIssues.length === 0,
    securityReviewPassed: securityIssues.length === 0,
    poReviewPassed: poIssues.length === 0,
  };
}

/**
 * Aggregate issues from multiple reviews and determine overall pass/fail
 * @deprecated No longer used with unified review. Kept for reference only.
 */
export function aggregateReviews(
  codeResult: { passed: boolean; issues: ReviewIssue[] },
  securityResult: { passed: boolean; issues: ReviewIssue[] },
  poResult: { passed: boolean; issues: ReviewIssue[] }
): { passed: boolean; allIssues: ReviewIssue[]; severity: ReviewSeverity } {
  const allIssues = [...codeResult.issues, ...securityResult.issues, ...poResult.issues];

  // Count blocking issues
  const blockerCount = allIssues.filter(i => i.severity === 'blocker').length;
  const criticalCount = allIssues.filter(i => i.severity === 'critical').length;

  // Fail if any blockers or 2+ critical issues
  const passed = blockerCount === 0 && criticalCount < 2;

  // Determine severity
  const severity = determineReviewSeverity(allIssues);

  return { passed, allIssues, severity };
}

/**
 * Format issues for display in review notes
 * Shows perspectives (code, security, po) when available
 */
export function formatIssuesForDisplay(issues: ReviewIssue[]): string {
  if (issues.length === 0) {
    return '✅ No issues found';
  }

  const grouped = {
    blocker: issues.filter(i => i.severity === 'blocker'),
    critical: issues.filter(i => i.severity === 'critical'),
    major: issues.filter(i => i.severity === 'major'),
    minor: issues.filter(i => i.severity === 'minor'),
  };

  let output = '';

  for (const [severity, issueList] of Object.entries(grouped)) {
    if (issueList.length === 0) continue;

    const icon = severity === 'blocker' ? '🛑' : severity === 'critical' ? '⚠️' : severity === 'major' ? '📋' : 'ℹ️';
    output += `\n#### ${icon} ${severity.toUpperCase()} (${issueList.length})\n\n`;

    for (const issue of issueList) {
      // Format perspectives indicator if present
      const perspectivesTag = issue.perspectives && issue.perspectives.length > 0
        ? ` [${issue.perspectives.join(', ')}]`
        : '';

      output += `**${issue.category}**${perspectivesTag}: ${issue.description}\n`;
      if (issue.file) {
        output += `  - File: \`${issue.file}\`${issue.line ? `:${issue.line}` : ''}\n`;
      }
      if (issue.suggestedFix) {
        output += `  - Suggested fix: ${issue.suggestedFix}\n`;
      }
      output += '\n';
    }
  }

  return output;
}
