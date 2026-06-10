import { sanitizeInput, truncateText } from '../../cli/formatting.js';
import type { ReviewIssue } from '../../types/index.js';

/**
 * Generate executive summary from review issues (1-3 sentences)
 *
 * Prioritizes by severity: blocker > critical > major > minor
 * Shows top 2-3 issues with file names when available
 * Truncates gracefully if many issues exist
 *
 * @param issues - Array of review issues to summarize
 * @param terminalWidth - Terminal width for text wrapping
 * @returns Executive summary string (1-3 sentences)
 */
export function generateReviewSummary(issues: ReviewIssue[], terminalWidth: number): string {
  // Validate terminal width (ensure minimum viable width)
  if (terminalWidth <= 0 || !Number.isFinite(terminalWidth)) {
    terminalWidth = 80;
  }

  // Edge case: no issues but still rejected (system error)
  if (issues.length === 0) {
    return 'Review rejected due to system error or policy violation.';
  }

  // Sort issues by severity priority
  const severityOrder: Record<string, number> = {
    blocker: 0,
    critical: 1,
    major: 2,
    minor: 3,
  };

  const sortedIssues = [...issues].sort((a, b) => {
    const severityA = severityOrder[a.severity] ?? 3;
    const severityB = severityOrder[b.severity] ?? 3;
    return severityA - severityB;
  });

  // Select top 2-3 issues to include in summary
  const maxIssuesToShow = 3;
  const topIssues = sortedIssues.slice(0, maxIssuesToShow);
  const remainingCount = sortedIssues.length - topIssues.length;

  // Calculate available width per issue (leave room for "...and X more issues")
  // Terminal width - indent (2 spaces) - "Summary: " (9 chars) = available
  const summaryPrefix = 'Summary: ';
  const indent = 2;
  const availableWidth = Math.max(40, terminalWidth - indent - summaryPrefix.length);

  // Build summary sentences
  const sentences: string[] = [];
  // Calculate maxCharsPerIssue based on availableWidth to ensure 3 issues fit
  const moreIndicatorLength = remainingCount > 0 ? 30 : 0; // Approximate length of "...and X more issues."
  const maxCharsPerIssue = Math.max(40, Math.floor((availableWidth - moreIndicatorLength) / 3));

  for (const issue of topIssues) {
    // Sanitize description for security
    let description = sanitizeInput(issue.description || '');

    // Remove code blocks and excessive whitespace for conciseness
    description = description.replace(/```[\s\S]*?```/g, '');
    description = description.replace(/\n+/g, ' ');
    description = description.replace(/\s+/g, ' '); // Collapse multiple spaces
    description = description.trim();

    // Skip empty descriptions
    if (!description) {
      continue;
    }

    // Add file reference if available
    let sentence = description;
    if (issue.file) {
      const fileName = issue.file.split('/').pop() || issue.file;
      sentence = `${description} (${fileName}${issue.line ? `:${issue.line}` : ''})`;
    }

    // Truncate individual issue to max chars
    if (sentence.length > maxCharsPerIssue) {
      sentence = truncateText(sentence, maxCharsPerIssue);
    }

    sentences.push(sentence);
  }

  // Edge case: all issues had empty descriptions after sanitization
  if (sentences.length === 0) {
    return 'Review rejected (no actionable issue details available).';
  }

  // Combine sentences
  let summary = sentences.join('. ');
  if (!summary.endsWith('.')) {
    summary += '.';
  }

  // Add "more issues" indicator if needed
  if (remainingCount > 0) {
    summary += ` ...and ${remainingCount} more issue${remainingCount > 1 ? 's' : ''}.`;
  }

  // Final truncation to respect terminal width
  const maxSummaryLength = availableWidth - 10; // Leave some margin
  if (summary.length > maxSummaryLength) {
    summary = truncateText(summary, maxSummaryLength);
  }

  return summary;
}
