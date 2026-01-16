import { execSync, spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { parseStory, writeStory, updateStoryStatus, appendToSection, updateStoryField, isAtMaxRetries, appendReviewHistory, snapshotMaxRetries, getEffectiveMaxRetries, getEffectiveMaxImplementationRetries } from '../core/story.js';
import { runAgentQuery } from '../core/client.js';
import { getLogger } from '../core/logger.js';
import { loadConfig, DEFAULT_TIMEOUTS } from '../core/config.js';
import { Story, AgentResult, ReviewResult, ReviewIssue, ReviewIssueSeverity, ReviewDecision, ReviewSeverity, ReviewAttempt, Config, TDDTestCycle } from '../types/index.js';
import { sanitizeInput, truncateText } from '../cli/formatting.js';
import { detectTestDuplicationPatterns } from './test-pattern-detector.js';

/**
 * Security: Validate Git branch name to prevent command injection
 * Only allows alphanumeric characters, hyphens, underscores, and forward slashes
 */
function validateGitBranchName(branchName: string): boolean {
  return /^[a-zA-Z0-9/_-]+$/.test(branchName);
}

/**
 * Security: Escape shell arguments for safe use in commands
 * For use with execSync when shell execution is required
 */
function escapeShellArg(arg: string): string {
  // Replace single quotes with '\'' and wrap in single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Security: Validate and normalize working directory path
 * Prevents path traversal attacks
 */
function validateWorkingDirectory(workingDir: string): void {
  // Normalize the path
  const normalized = path.resolve(workingDir);

  // Check if it's an absolute path
  if (!path.isAbsolute(normalized)) {
    throw new Error(`Invalid working directory: must be absolute path (got: ${workingDir})`);
  }

  // Check for path traversal patterns
  if (workingDir.includes('../') || workingDir.includes('..\\')) {
    throw new Error(`Invalid working directory: path traversal detected (${workingDir})`);
  }

  // Verify directory exists
  if (!fs.existsSync(normalized)) {
    throw new Error(`Invalid working directory: does not exist (${normalized})`);
  }

  // Verify it's actually a directory
  if (!fs.statSync(normalized).isDirectory()) {
    throw new Error(`Invalid working directory: not a directory (${normalized})`);
  }
}

/**
 * Security: Sanitize error messages to prevent information leakage
 * Removes absolute paths, environment details, and stack traces
 */
function sanitizeErrorMessage(message: string, workingDir: string): string {
  let sanitized = message;

  // Replace absolute paths with [PROJECT_ROOT]
  const normalizedWorkingDir = path.resolve(workingDir);
  sanitized = sanitized.replace(new RegExp(normalizedWorkingDir, 'g'), '[PROJECT_ROOT]');

  // Remove home directory paths
  if (process.env.HOME) {
    sanitized = sanitized.replace(new RegExp(process.env.HOME, 'g'), '~');
  }

  // Strip stack traces (keep only first line of error)
  const lines = sanitized.split('\n');
  if (lines.length > 3) {
    sanitized = lines.slice(0, 3).join('\n') + '\n... (stack trace removed)';
  }

  return sanitized;
}

/**
 * Security: Sanitize command output before display
 * Strips ANSI codes, control characters, and potential secrets
 */
function sanitizeCommandOutput(output: string): string {
  let sanitized = output;

  // Strip ANSI escape codes
  sanitized = sanitized.replace(/\x1b\[[0-9;]*m/g, '');

  // Strip other control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Redact potential secrets (basic patterns)
  // API keys: long alphanumeric strings after key= or token=
  sanitized = sanitized.replace(/(api[_-]?key|token|password|secret)[\s=:]+[a-zA-Z0-9_-]{20,}/gi, '$1=[REDACTED]');

  return sanitized;
}

/**
 * Security: Zod schema for validating LLM review responses
 * Prevents malicious or malformed JSON from causing issues
 */
const ReviewIssueSchema = z.object({
  severity: z.enum(['blocker', 'critical', 'major', 'minor']),
  category: z.string().max(100),
  description: z.string().max(5000),
  // Use .nullish() to accept both null and undefined, then transform to undefined for consistency
  // This handles LLM responses that return {"line": null} instead of omitting the field
  file: z.string().nullish().transform(v => v ?? undefined),
  line: z.number().int().positive().nullish().transform(v => v ?? undefined),
  suggestedFix: z.string().max(5000).nullish().transform(v => v ?? undefined),
  // Perspectives field for unified review (optional for backward compatibility)
  perspectives: z.array(z.enum(['code', 'security', 'po'])).optional(),
});

const ReviewResponseSchema = z.object({
  passed: z.boolean(),
  issues: z.array(ReviewIssueSchema),
});

/**
 * Validate TDD cycles for completeness
 *
 * Checks that each TDD cycle has completed all three phases:
 * RED (failing test) → GREEN (passing test) → REFACTOR (improved code)
 *
 * @param cycles - Array of TDD test cycles to validate
 * @returns Array of violation messages (empty if all cycles are valid)
 */
export function validateTDDCycles(cycles: TDDTestCycle[]): string[] {
  const violations: string[] = [];

  for (const cycle of cycles) {
    // Check RED phase (must always have red_timestamp since that's when cycle starts)
    if (!cycle.red_timestamp) {
      violations.push(`TDD cycle ${cycle.cycle_number}: Missing RED phase timestamp`);
    }

    // Check GREEN phase
    if (!cycle.green_timestamp) {
      violations.push(`TDD cycle ${cycle.cycle_number}: Missing GREEN phase timestamp - implementation not completed`);
    }

    // Check REFACTOR phase
    if (!cycle.refactor_timestamp) {
      violations.push(`TDD cycle ${cycle.cycle_number}: Missing REFACTOR phase timestamp - refactoring step skipped`);
    }

    // Check for regression (all tests should be green after cycle completes)
    if (!cycle.all_tests_green) {
      violations.push(`TDD cycle ${cycle.cycle_number}: Tests not all green - regression detected`);
    }
  }

  return violations;
}

/**
 * Generate review issues from TDD violations
 *
 * Converts TDD validation violations into structured ReviewIssue objects
 * that can be included in the review results.
 *
 * @param violations - Array of violation messages from validateTDDCycles
 * @returns Array of ReviewIssue objects for the violations
 */
export function generateTDDIssues(violations: string[]): ReviewIssue[] {
  return violations.map((violation) => ({
    severity: 'critical' as ReviewIssueSeverity,
    category: 'tdd_violation',
    description: violation,
    suggestedFix: 'Complete the TDD cycle by ensuring all phases (RED → GREEN → REFACTOR) are executed and all tests pass.',
  }));
}

/**
 * Result of running build/test commands
 */
interface VerificationResult {
  buildPassed: boolean;
  buildOutput: string;
  testsPassed: boolean;
  testsOutput: string;
}

/**
 * Maximum size for test output before truncation (10KB)
 */
const MAX_TEST_OUTPUT_SIZE = 10000;

/**
 * Progress callback for verification steps
 */
export type VerificationProgressCallback = (phase: 'build' | 'test', status: 'starting' | 'running' | 'passed' | 'failed', message?: string) => void;

/**
 * Run a command asynchronously with timeout and progress updates
 */
async function runCommandAsync(
  command: string,
  workingDir: string,
  timeout: number,
  onProgress?: (output: string) => void
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const outputChunks: string[] = [];
    let killed = false;

    // Parse command into executable and args (simple split, handles most cases)
    const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [command];
    const executable = parts[0];
    const args = parts.slice(1).map(arg => arg.replace(/^"|"$/g, ''));

    // Security: Use spawn without shell to prevent command injection
    // Commands must be parseable as: executable + space-separated args
    const child = spawn(executable, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      // Force kill after 5 seconds if SIGTERM didn't work
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, timeout);

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      outputChunks.push(text);
      onProgress?.(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      outputChunks.push(text);
      onProgress?.(text);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      const output = outputChunks.join('');
      if (killed) {
        resolve({
          success: false,
          output: output + `\n[Command timed out after ${Math.round(timeout / 1000)} seconds]`,
        });
      } else {
        resolve({
          success: code === 0,
          output,
        });
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      const sanitizedError = sanitizeErrorMessage(error.message, workingDir);
      resolve({
        success: false,
        output: outputChunks.join('') + `\n[Command error: ${sanitizedError}]`,
      });
    });
  });
}

/**
 * Run build and test commands before review (async version with progress)
 * Returns structured results that can be included in review context
 */
async function runVerificationAsync(
  workingDir: string,
  config: Config,
  onProgress?: VerificationProgressCallback
): Promise<VerificationResult> {
  const result: VerificationResult = {
    buildPassed: true,
    buildOutput: '',
    testsPassed: true,
    testsOutput: '',
  };

  const buildTimeout = config.timeouts?.buildTimeout ?? DEFAULT_TIMEOUTS.buildTimeout;
  const testTimeout = config.timeouts?.testTimeout ?? DEFAULT_TIMEOUTS.testTimeout;

  // Run build command if configured
  if (config.buildCommand) {
    onProgress?.('build', 'starting', config.buildCommand);

    const buildResult = await runCommandAsync(
      config.buildCommand,
      workingDir,
      buildTimeout,
      (output) => onProgress?.('build', 'running', output)
    );

    result.buildPassed = buildResult.success;
    result.buildOutput = buildResult.output;
    onProgress?.('build', buildResult.success ? 'passed' : 'failed');
  }

  // Run test command if configured
  if (config.testCommand) {
    onProgress?.('test', 'starting', config.testCommand);

    const testResult = await runCommandAsync(
      config.testCommand,
      workingDir,
      testTimeout,
      (output) => onProgress?.('test', 'running', output)
    );

    result.testsPassed = testResult.success;
    result.testsOutput = testResult.output;
    onProgress?.('test', testResult.success ? 'passed' : 'failed');
  }

  return result;
}


const REVIEW_OUTPUT_FORMAT = `
Output your review as a JSON object with this structure:
{
  "passed": true/false,
  "issues": [
    {
      "severity": "blocker" | "critical" | "major" | "minor",
      "category": "code_quality" | "security" | "requirements" | "testing" | "test_alignment" | etc,
      "description": "Detailed description of the issue",
      "file": "path/to/file.ts" (if applicable),
      "line": 42 (if applicable),
      "suggestedFix": "How to fix this issue",
      "perspectives": ["code", "security", "po"] (which perspectives this issue relates to)
    }
  ]
}

Severity guidelines:
- blocker: Must be fixed before merging (security holes, broken functionality, test misalignment)
- critical: Should be fixed before merging (major bugs, poor practices)
- major: Should be addressed soon (code quality, maintainability)
- minor: Nice to have improvements (style, optimizations)

If no issues found, return: {"passed": true, "issues": []}
`;

/**
 * Unified Review Prompt - combines code, security, and product owner perspectives
 * into a single collaborative review to eliminate duplicate issues.
 */
const UNIFIED_REVIEW_PROMPT = `You are a senior engineering team conducting a comprehensive collaborative review.

You must evaluate the implementation from THREE perspectives simultaneously, but produce ONE unified set of issues:

## Perspective 1: Code Quality (Senior Developer)
Evaluate:
- Code quality and maintainability
- Following best practices and design patterns
- Potential bugs or logic errors
- Test coverage adequacy and test quality
- Error handling completeness
- Performance considerations

## Perspective 2: Security (Security Engineer)
Evaluate:
- OWASP Top 10 vulnerabilities
- Input validation and sanitization
- Authentication and authorization issues
- Data exposure risks
- Command injection vulnerabilities
- Secure coding practices

## Perspective 3: Requirements (Product Owner)
Evaluate:
- Does it meet the acceptance criteria stated in the story?
- Is the user experience appropriate and intuitive?
- Are edge cases and error scenarios handled?
- Is documentation adequate for users and maintainers?
- Does the implementation align with the story goals?

## Test-Implementation Alignment (BLOCKER category)

**CRITICAL PRE-REVIEW REQUIREMENT**: Tests have already been executed and passed. However, passing tests don't guarantee correctness if they verify outdated behavior.

During code review, you MUST verify test alignment:

1. **For each changed production file, identify its test file**
   - Check if tests exist for modified functions/modules
   - Read the test assertions carefully

2. **Verify tests match NEW behavior, not OLD**
   - Do test assertions expect the current implementation behavior?
   - If production code changed from sync to async, do tests use await?
   - If function signature changed, do tests call it correctly?
   - If return values changed, do tests expect the new values?

3. **Flag misalignment as BLOCKER**
   - If tests reference changed code but still expect old behavior:
     - This is a **BLOCKER** severity issue
     - Category MUST be: \`"test_alignment"\`
     - Specify which test files need updating and why
     - Provide example of correct assertion for new behavior

**Example of misaligned test (BLOCKER):**
\`\`\`typescript
// Production code changed from sync to async
async function loadConfig(): Promise<Config> {
  return await fetchConfig();
}

// Test still expects sync behavior - MISSING await (BLOCKER)
test('loads config', () => {
  const config = loadConfig(); // ❌ Missing await! Returns Promise<Config>, not Config
  expect(config.port).toBe(3000); // ❌ Checking Promise.port, not config.port
});

// Correct aligned test:
test('loads config', async () => {
  const config = await loadConfig(); // ✅ Awaits async function
  expect(config.port).toBe(3000);     // ✅ Checks actual config
});
\`\`\`

**When to flag test_alignment issues:**
- Tests verify old function signatures that no longer exist
- Tests expect old return value formats that changed
- Tests miss new error conditions introduced
- Tests pass but don't exercise the new code paths
- Mock expectations don't match the new implementation calls

## CRITICAL DEDUPLICATION INSTRUCTIONS:

1. **DO NOT repeat the same underlying issue from different perspectives**
   - If multiple perspectives notice the same problem, list it ONCE
   - Use the \`perspectives\` array to indicate which perspectives it affects

2. **Prioritize by actual impact, not by how many perspectives notice it**
   - A issue seen by all 3 perspectives is still just ONE issue
   - Focus on the distinct, actionable problems that need fixing

3. **If the fundamental problem is "no implementation exists" or "functionality completely missing":**
   - Report this as ONE blocker issue, not three separate issues
   - Use perspectives: ["code", "security", "po"] to show all perspectives agree

4. **Combine related issues into single, comprehensive descriptions:**
   - Instead of: "No tests" (code) + "Untested security" (security) + "No validation tests" (po)
   - Write: "No tests exist for the implementation" with perspectives: ["code", "security", "po"]

5. **Each issue should have a clear, single suggested fix**
   - Avoid vague suggestions like "improve everything"
   - Be specific and actionable

${REVIEW_OUTPUT_FORMAT}

Remember: Your goal is to produce a clean, deduplicated list of actual distinct problems, not to maximize issue count.`;

/**
 * Legacy prompts - kept for reference only
 * @deprecated These are replaced by UNIFIED_REVIEW_PROMPT which combines all three perspectives.
 * The unified prompt reduces LLM calls from 3 to 1 and eliminates duplicate issues.
 */
const CODE_REVIEW_PROMPT = `You are a senior code reviewer. Review the implementation for:
1. Code quality and maintainability
2. Following best practices
3. Potential bugs or issues
4. Test coverage adequacy

${REVIEW_OUTPUT_FORMAT}`;

/**
 * @deprecated Use UNIFIED_REVIEW_PROMPT instead
 */
const SECURITY_REVIEW_PROMPT = `You are a security specialist. Review the implementation for:
1. OWASP Top 10 vulnerabilities
2. Input validation issues
3. Authentication/authorization problems
4. Data exposure risks

${REVIEW_OUTPUT_FORMAT}`;

/**
 * @deprecated Use UNIFIED_REVIEW_PROMPT instead
 */
const PO_REVIEW_PROMPT = `You are a product owner validating the implementation. Check:
1. Does it meet the acceptance criteria?
2. Is the user experience appropriate?
3. Are edge cases handled?
4. Is documentation adequate?

${REVIEW_OUTPUT_FORMAT}`;

/**
 * Parse review response and extract structured issues
 * Security: Uses zod schema validation to prevent malicious JSON
 */
function parseReviewResponse(response: string, reviewType: string): { passed: boolean; issues: ReviewIssue[] } {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Fallback: no JSON found, analyze text
      return parseTextReview(response, reviewType);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Security: Validate against zod schema before using the data
    const validationResult = ReviewResponseSchema.safeParse(parsed);

    if (!validationResult.success) {
      // Log validation errors for debugging
      console.warn('Review response failed schema validation:', validationResult.error);
      // Fallback to text analysis
      return parseTextReview(response, reviewType);
    }

    const validated = validationResult.data;

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
  } catch (error) {
    // Fallback to text analysis if JSON parsing fails
    console.warn('Review response parsing error:', error);
    return parseTextReview(response, reviewType);
  }
}

/**
 * Fallback: Parse text-based review response (for when LLM doesn't return JSON)
 */
function parseTextReview(response: string, reviewType: string): { passed: boolean; issues: ReviewIssue[] } {
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
function determineReviewSeverity(issues: ReviewIssue[]): ReviewSeverity {
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
function aggregateReviews(
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
function formatIssuesForDisplay(issues: ReviewIssue[]): string {
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

/**
 * Get source code changes from git diff
 *
 * Returns list of source files that have been modified (excludes tests and story files).
 * Uses spawnSync for security (prevents command injection).
 *
 * @param workingDir - Working directory to run git diff in
 * @returns Array of source file paths that have changed, or ['unknown'] if git fails
 */
export function getSourceCodeChanges(workingDir: string): string[] {
  try {
    // Security: Use spawnSync with explicit args (not shell) to prevent injection
    const result = spawnSync('git', ['diff', '--name-only', 'HEAD~1'], {
      cwd: workingDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      // Git command failed - fail open (assume changes exist)
      return ['unknown'];
    }

    const output = result.stdout.toString();

    return output
      .split('\n')
      .filter(f => f.trim())
      .filter(f => /\.(ts|tsx|js|jsx)$/.test(f))      // Source files only
      .filter(f => !f.includes('.test.'))              // Exclude test files
      .filter(f => !f.includes('.spec.'))              // Exclude spec files
      .filter(f => !f.startsWith('.ai-sdlc/'));        // Exclude story files
  } catch {
    // If git diff fails, assume there are changes (fail open, not closed)
    return ['unknown'];
  }
}

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
  const severityOrder: Record<ReviewIssueSeverity, number> = {
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

/**
 * Options for running the review agent
 */
export interface ReviewAgentOptions {
  /** Callback for verification progress updates */
  onVerificationProgress?: VerificationProgressCallback;
}

/**
 * Review Agent
 *
 * Orchestrates code review, security review, and PO acceptance.
 * Now returns structured ReviewResult with pass/fail and issues.
 */
export async function runReviewAgent(
  storyPath: string,
  sdlcRoot: string,
  options?: ReviewAgentOptions
): Promise<ReviewResult> {
  const logger = getLogger();
  const startTime = Date.now();
  const story = parseStory(storyPath);
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);

  logger.info('review', 'Starting review phase', {
    storyId: story.frontmatter.id,
    retryCount: story.frontmatter.retry_count || 0,
  });

  // Security: Validate working directory before any operations
  try {
    validateWorkingDirectory(workingDir);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      story,
      changesMade,
      error: errorMsg,
      passed: false,
      decision: ReviewDecision.FAILED,
      reviewType: 'combined',
      issues: [{
        severity: 'blocker',
        category: 'security',
        description: `Working directory validation failed: ${errorMsg}`,
      }],
      feedback: errorMsg,
    };
  }

  const config = loadConfig(workingDir);

  try {
    // Snapshot max_retries from config (protects against mid-cycle config changes)
    await snapshotMaxRetries(story, config);

    // Check if story has reached max retries
    if (isAtMaxRetries(story, config)) {
      const retryCount = story.frontmatter.retry_count || 0;
      const maxRetries = getEffectiveMaxRetries(story, config);
      const maxRetriesDisplay = Number.isFinite(maxRetries) ? maxRetries : '∞';
      const errorMsg = `Story has reached maximum retry limit (${retryCount}/${maxRetriesDisplay}). Manual intervention required.`;

      await updateStoryField(story, 'last_error', errorMsg);
      changesMade.push(errorMsg);

      return {
        success: false,
        story: parseStory(storyPath),
        changesMade,
        error: errorMsg,
        passed: false,
        decision: ReviewDecision.FAILED,
        reviewType: 'combined',
        issues: [{
          severity: 'blocker',
          category: 'max_retries_reached',
          description: errorMsg,
        }],
        feedback: errorMsg,
      };
    }

    // PRE-CHECK GATE: Detect documentation-only implementations before running expensive LLM reviews
    const sourceChanges = getSourceCodeChanges(workingDir);

    if (sourceChanges.length === 0) {
      // No source code changes detected - check if we can recover
      const retryCount = story.frontmatter.implementation_retry_count || 0;
      const maxRetries = getEffectiveMaxImplementationRetries(story, config);

      if (retryCount < maxRetries) {
        // RECOVERABLE: Trigger implementation recovery
        logger.warn('review', 'No source code changes detected - triggering implementation recovery', {
          storyId: story.frontmatter.id,
          retryCount,
          maxRetries,
        });

        await updateStoryField(story, 'implementation_complete', false);
        await updateStoryField(story, 'last_restart_reason', 'No source code changes detected. Implementation wrote documentation only.');

        return {
          success: true,
          story: parseStory(storyPath),
          changesMade: ['Detected documentation-only implementation', 'Triggered implementation recovery'],
          passed: false,
          decision: ReviewDecision.RECOVERY,
          reviewType: 'pre-check' as any,
          issues: [{
            severity: 'critical',
            category: 'implementation',
            description: 'No source code modifications detected. Re-running implementation phase.',
          }],
          feedback: 'Implementation recovery triggered - no source changes found.',
        };
      } else {
        // NON-RECOVERABLE: Max retries reached
        const maxRetriesDisplay = Number.isFinite(maxRetries) ? maxRetries : '∞';
        logger.error('review', 'No source code changes detected and max implementation retries reached', {
          storyId: story.frontmatter.id,
          retryCount,
          maxRetries,
        });

        return {
          success: true,
          story: parseStory(storyPath),
          changesMade: ['Detected documentation-only implementation', 'Max retries reached'],
          passed: false,
          decision: ReviewDecision.FAILED,
          severity: ReviewSeverity.CRITICAL,
          reviewType: 'pre-check' as any,
          issues: [{
            severity: 'blocker',
            category: 'implementation',
            description: `Implementation phase wrote documentation/planning only - no source code was modified. This has occurred ${retryCount} time(s) (max: ${maxRetriesDisplay}). Manual intervention required.`,
            suggestedFix: 'Review the story requirements and implementation plan. The agent may be confused about what needs to be built. Consider simplifying the story or providing more explicit guidance.',
          }],
          feedback: 'Implementation failed to produce code changes after multiple attempts.',
        };
      }
    }

    // Source changes exist - proceed with normal review flow
    logger.info('review', 'Source code changes detected - proceeding with verification', {
      storyId: story.frontmatter.id,
      fileCount: sourceChanges.length,
    });

    // Run build and tests BEFORE reviews (async with progress)
    changesMade.push('Running build and test verification...');
    const verification = await runVerificationAsync(workingDir, config, options?.onVerificationProgress);

    // Create verification issues if build/tests failed
    const verificationIssues: ReviewIssue[] = [];
    let verificationContext = '';

    if (config.buildCommand) {
      if (verification.buildPassed) {
        changesMade.push(`Build passed: ${config.buildCommand}`);
        verificationContext += `\n## Build Results ✅\nBuild command \`${config.buildCommand}\` passed successfully.\n`;
      } else {
        changesMade.push(`Build FAILED: ${config.buildCommand}`);
        const sanitizedBuildOutput = sanitizeCommandOutput(verification.buildOutput);
        verificationIssues.push({
          severity: 'blocker',
          category: 'build',
          description: `Build failed. Command: ${config.buildCommand}`,
          suggestedFix: 'Fix build errors before review can proceed.',
        });
        verificationContext += `\n## Build Results ❌\nBuild command \`${config.buildCommand}\` FAILED:\n\`\`\`\n${sanitizedBuildOutput.substring(0, 2000)}\n\`\`\`\n`;
      }
    }

    if (config.testCommand) {
      if (verification.testsPassed) {
        changesMade.push(`Tests passed: ${config.testCommand}`);
        verificationContext += `\n## Test Results ✅\nTest command \`${config.testCommand}\` passed successfully.\n`;
        // Include summary of test output (last 500 chars typically has summary)
        const testSummary = verification.testsOutput.slice(-500);
        if (testSummary) {
          verificationContext += `\`\`\`\n${testSummary}\n\`\`\`\n`;
        }
      } else {
        changesMade.push(`Tests FAILED: ${config.testCommand}`);

        // Sanitize and truncate test output if too large, preserving readability
        let testOutput = sanitizeCommandOutput(verification.testsOutput);
        let truncationNote = '';
        if (testOutput.length > MAX_TEST_OUTPUT_SIZE) {
          testOutput = testOutput.substring(0, MAX_TEST_OUTPUT_SIZE);
          truncationNote = '\n\n... (output truncated - showing first 10KB)';
        }

        verificationIssues.push({
          severity: 'blocker',
          category: 'testing',
          description: `Tests must pass before code review can proceed.\n\nCommand: ${config.testCommand}\n\nTest output:\n\`\`\`\n${testOutput}${truncationNote}\n\`\`\``,
          suggestedFix: 'Fix failing tests before review can proceed.',
        });
        verificationContext += `\n## Test Results ❌\nTest command \`${config.testCommand}\` FAILED:\n\`\`\`\n${testOutput}${truncationNote}\n\`\`\`\n`;
      }
    }

    // OPTIMIZATION: If verification failed (build or tests), skip LLM-based reviews to save tokens and time.
    // Return immediately with BLOCKER issues - developers should fix verification issues before review feedback is useful.
    if (verificationIssues.length > 0) {
      changesMade.push('Skipping code/security/PO reviews - verification must pass first');

      return {
        success: true, // Agent executed successfully
        story: parseStory(storyPath),
        changesMade,
        passed: false, // Review did not pass
        decision: ReviewDecision.REJECTED,
        severity: ReviewSeverity.CRITICAL,
        reviewType: 'combined',
        issues: verificationIssues,
        feedback: formatIssuesForDisplay(verificationIssues),
      };
    }

    // Verification passed - proceed with unified collaborative review
    changesMade.push('Verification passed - proceeding with unified collaborative review');

    // Run test pattern detection if enabled
    let testPatternIssues: ReviewIssue[] = [];
    if (config.reviewConfig.detectTestAntipatterns !== false) {
      try {
        changesMade.push('Running test anti-pattern detection...');
        testPatternIssues = await detectTestDuplicationPatterns(workingDir);
        if (testPatternIssues.length > 0) {
          changesMade.push(`Detected ${testPatternIssues.length} test anti-pattern(s)`);
        } else {
          changesMade.push('No test anti-patterns detected');
        }
      } catch (error) {
        // Don't fail review if detection errors - just log and continue
        const errorMsg = error instanceof Error ? error.message : String(error);
        changesMade.push(`Test pattern detection error: ${errorMsg}`);
      }
    }

    const unifiedReviewResponse = await runSubReview(
      story,
      UNIFIED_REVIEW_PROMPT,
      'Unified Collaborative Review',
      workingDir,
      verificationContext
    );

    // Parse unified review response into structured issues
    const unifiedResult = parseReviewResponse(unifiedReviewResponse, 'Unified Review');

    // TDD Validation: Check TDD cycle completeness if TDD was enabled for this story
    const tddEnabled = story.frontmatter.tdd_enabled ?? config.tdd?.enabled ?? false;
    if (tddEnabled && story.frontmatter.tdd_test_history?.length) {
      const tddViolations = validateTDDCycles(story.frontmatter.tdd_test_history);
      if (tddViolations.length > 0) {
        const tddIssues = generateTDDIssues(tddViolations);
        unifiedResult.issues.push(...tddIssues);
        unifiedResult.passed = false;
        changesMade.push(`TDD validation: ${tddViolations.length} violation(s) detected`);
      } else {
        changesMade.push('TDD validation: All cycles completed correctly');
      }
    }

    // Add test pattern issues to unified result (they're code-quality related)
    if (testPatternIssues.length > 0) {
      unifiedResult.issues.push(...testPatternIssues);
      unifiedResult.passed = false;
    }

    // Add verification issues to unified result (they're code-quality related)
    unifiedResult.issues.unshift(...verificationIssues);
    if (verificationIssues.length > 0) {
      unifiedResult.passed = false;
    }

    // Determine overall pass/fail from unified review
    const allIssues = unifiedResult.issues;
    const blockerCount = allIssues.filter(i => i.severity === 'blocker').length;
    const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
    const passed = blockerCount === 0 && criticalCount < 2;
    const severity = determineReviewSeverity(allIssues);

    // Derive individual perspective pass/fail for backward compatibility
    const { codeReviewPassed, securityReviewPassed, poReviewPassed } =
      deriveIndividualPassFailFromPerspectives(allIssues);

    // Compile review notes with structured format for unified review
    const reviewNotes = `
### Unified Collaborative Review

${formatIssuesForDisplay(allIssues)}

### Perspective Summary
- Code Quality: ${codeReviewPassed ? '✅ Passed' : '❌ Failed'}
- Security: ${securityReviewPassed ? '✅ Passed' : '❌ Failed'}
- Requirements (PO): ${poReviewPassed ? '✅ Passed' : '❌ Failed'}

### Overall Result
${passed ? '✅ **PASSED** - All reviews approved' : '❌ **FAILED** - Issues must be addressed'}

---
*Review completed: ${new Date().toISOString().split('T')[0]}*
`;

    // Append reviews to story
    await appendToSection(story, 'Review Notes', reviewNotes);
    changesMade.push('Added unified collaborative review notes');

    // Determine decision
    const decision = passed ? ReviewDecision.APPROVED : ReviewDecision.REJECTED;

    // Create review attempt record (omit undefined fields to avoid YAML serialization errors)
    const reviewAttempt: ReviewAttempt = {
      timestamp: new Date().toISOString(),
      decision,
      ...(passed ? {} : { severity }),
      feedback: passed ? 'All reviews passed' : formatIssuesForDisplay(allIssues),
      blockers: allIssues.filter(i => i.severity === 'blocker').map(i => i.description),
      codeReviewPassed,
      securityReviewPassed,
      poReviewPassed,
    };

    // Append to review history
    await appendReviewHistory(story, reviewAttempt);
    changesMade.push('Recorded review attempt in history');

    if (passed) {
      await updateStoryField(story, 'reviews_complete', true);
      changesMade.push('Marked reviews_complete: true');
    } else {
      changesMade.push(`Reviews failed with ${allIssues.length} issue(s) - rework required`);
      // Don't mark reviews_complete, this will trigger rework
    }

    logger.info('review', 'Review phase complete', {
      storyId: story.frontmatter.id,
      durationMs: Date.now() - startTime,
      passed,
      decision,
      issueCount: allIssues.length,
    });

    return {
      success: true,
      story: parseStory(storyPath),
      changesMade,
      passed,
      decision,
      ...(passed ? {} : { severity }),
      reviewType: 'combined',
      issues: allIssues,
      feedback: passed ? 'All reviews passed' : formatIssuesForDisplay(allIssues),
    };
  } catch (error) {
    // Review agent failure - return FAILED decision (doesn't count as retry)
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('review', 'Review phase failed', {
      storyId: story.frontmatter.id,
      durationMs: Date.now() - startTime,
      error: errorMsg,
    });

    return {
      success: false,
      story,
      changesMade,
      error: errorMsg,
      passed: false,
      decision: ReviewDecision.FAILED,
      reviewType: 'combined',
      issues: [{
        severity: 'blocker',
        category: 'review_error',
        description: `Review process failed: ${errorMsg}`,
      }],
      feedback: `Review process failed: ${errorMsg}`,
    };
  }
}

/**
 * Parse story content into sections by level-2 headers (##)
 * Returns array of {title, content} objects
 */
export function parseContentSections(content: string): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  const lines = content.split('\n');
  let currentSection: { title: string; content: string } | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)$/);

    if (headerMatch) {
      if (currentSection) sections.push(currentSection);
      currentSection = { title: headerMatch[1], content: '' };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }

  if (currentSection) sections.push(currentSection);
  return sections;
}

/**
 * Remove unfinished checkboxes from content (per CLAUDE.md requirement)
 * Removes lines with `- [ ]` or `* [ ]` patterns
 * Preserves completed checkboxes `- [x]` and `- [X]`
 */
export function removeUnfinishedCheckboxes(content: string): string {
  const lines = content.split('\n');
  const filteredLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match unchecked boxes: - [ ] or * [ ] with optional leading whitespace
    const isUnchecked = /^\s*[-*] \[ \]/.test(line);

    if (!isUnchecked) {
      filteredLines.push(line);
    }
  }

  return filteredLines.join('\n');
}

/**
 * Generate GitHub blob URL for story file
 * Parses remote URL and constructs link to story in repository
 */
export function getStoryFileURL(storyPath: string, branch: string, workingDir: string): string {
  try {
    const remoteUrl = execSync('git remote get-url origin', { cwd: workingDir, encoding: 'utf-8' }).trim();

    // Parse owner/repo from URL
    // HTTPS: https://github.com/owner/repo.git
    // SSH: git@github.com:owner/repo.git
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    if (!match) return '';

    const [, owner, repo] = match;
    const relativePath = path.relative(workingDir, storyPath);

    return `https://github.com/${owner}/${repo}/blob/${branch}/${relativePath}`;
  } catch {
    return '';
  }
}

/**
 * Format PR description from story sections
 * Includes: Story ID, User Story, Summary, Acceptance Criteria, Implementation Summary
 * Removes unfinished checkboxes from all sections
 */
export function formatPRDescription(story: Story, storyFileUrl: string): string {
  const sections = parseContentSections(story.content);

  // Extract key sections
  const userStory = sections.find(s => s.title === 'User Story')?.content || '';
  const summary = sections.find(s => s.title === 'Summary')?.content || '';
  const acceptanceCriteria = sections.find(s => s.title === 'Acceptance Criteria')?.content || '';
  const implementationSummary = sections.find(s => s.title === 'Implementation Summary')?.content || '';

  // Remove unfinished checkboxes from all sections
  const cleanAcceptanceCriteria = removeUnfinishedCheckboxes(acceptanceCriteria);
  const cleanImplementationSummary = removeUnfinishedCheckboxes(implementationSummary);

  // Build PR body
  let prBody = `## Story ID\n\n${story.frontmatter.id}\n\n`;

  if (userStory.trim()) {
    prBody += `## User Story\n\n${userStory.trim()}\n\n`;
  }

  if (summary.trim()) {
    prBody += `## Summary\n\n${summary.trim()}\n\n`;
  }

  if (cleanAcceptanceCriteria.trim()) {
    prBody += `## Acceptance Criteria\n\n${cleanAcceptanceCriteria.trim()}\n\n`;
  }

  if (cleanImplementationSummary.trim()) {
    prBody += `## Implementation Summary\n\n${cleanImplementationSummary.trim()}\n\n`;
  }

  // Add story file link
  if (storyFileUrl) {
    prBody += `---\n\n📋 [View Full Story](${storyFileUrl})\n`;
  }

  return prBody;
}

/**
 * Truncate PR body to respect GitHub's 65K character limit
 * Truncates Implementation Summary first (most verbose section)
 * Adds clear truncation indicator with story link
 */
export function truncatePRBody(body: string, maxLength: number = 64000): string {
  // Check if truncation needed
  if (body.length <= maxLength) {
    return body;
  }

  // Find Implementation Summary section
  const implSummaryMatch = body.match(/(## Implementation Summary\n\n)([\s\S]*?)(\n\n##|\n\n---|\n\n📋|$)/);

  if (implSummaryMatch) {
    const [fullMatch, header, content, trailer] = implSummaryMatch;
    const beforeImpl = body.substring(0, body.indexOf(fullMatch));
    const afterImpl = body.substring(body.indexOf(fullMatch) + fullMatch.length);

    // Calculate how much we need to remove
    const overhead = beforeImpl.length + header.length + trailer.length + afterImpl.length;
    const truncationIndicator = '\n\n⚠️ Implementation Summary truncated due to length. See full story for complete details.\n';
    const availableForContent = maxLength - overhead - truncationIndicator.length;

    if (availableForContent > 100) {
      // Truncate Implementation Summary at paragraph boundary
      let truncatedContent = content.substring(0, availableForContent);
      const lastParagraph = truncatedContent.lastIndexOf('\n\n');
      if (lastParagraph > 0) {
        truncatedContent = truncatedContent.substring(0, lastParagraph);
      }

      return beforeImpl + header + truncatedContent + truncationIndicator + trailer + afterImpl;
    }
  }

  // Fallback: simple truncation if no Implementation Summary found
  const truncatedBody = body.substring(0, maxLength - 200);
  const lastParagraph = truncatedBody.lastIndexOf('\n\n');
  const finalBody = lastParagraph > 0 ? truncatedBody.substring(0, lastParagraph) : truncatedBody;

  return finalBody + '\n\n⚠️ Description truncated due to length. See full story for complete details.\n';
}

/**
 * Run a sub-review with a specific prompt
 */
async function runSubReview(
  story: Story,
  systemPrompt: string,
  reviewType: string,
  workingDir: string,
  verificationContext: string = ''
): Promise<string> {
  try {
    const prompt = `Review this story implementation:

Title: ${story.frontmatter.title}
${verificationContext ? `\n---\n# Build & Test Verification Results\n${verificationContext}\n---\n` : ''}
Full story content:
${story.content}

Provide your ${reviewType} feedback. Be specific and actionable.`;

    return await runAgentQuery({
      prompt,
      systemPrompt,
      workingDirectory: workingDir,
    });
  } catch (error) {
    return `${reviewType} failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Options for creating a pull request
 */
export interface CreatePROptions {
  /** Create as draft PR (if not specified, uses config github.createDraftPRs) */
  draft?: boolean;
}

/**
 * Create a pull request for the completed story
 */
export async function createPullRequest(
  storyPath: string,
  sdlcRoot: string,
  options?: CreatePROptions
): Promise<AgentResult> {
  let story = parseStory(storyPath);
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);

  // Security: Validate working directory
  try {
    validateWorkingDirectory(workingDir);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      story,
      changesMade,
      error: errorMsg,
    };
  }

  try {
    const branchName = story.frontmatter.branch || `ai-sdlc/${story.slug}`;

    // Security: Validate branch name to prevent command injection
    if (!validateGitBranchName(branchName)) {
      const errorMsg = `Invalid branch name: ${branchName} (only alphanumeric, hyphens, underscores, and slashes allowed)`;
      changesMade.push(errorMsg);
      return {
        success: false,
        story,
        changesMade,
        error: errorMsg,
      };
    }

    // Check if gh CLI is available
    try {
      execSync('gh --version', { stdio: 'pipe' });
    } catch {
      changesMade.push('GitHub CLI not available - PR creation skipped');

      // Still update to done for MVP
      story = await updateStoryStatus(story, 'done');
      changesMade.push('Updated status to done');

      return {
        success: true,
        story,
        changesMade,
      };
    }

    // Create PR using gh CLI
    try {
      // First, ensure we're on the right branch and have changes committed
      // Security: Branch name is already validated above
      execSync(`git checkout ${branchName}`, { cwd: workingDir, stdio: 'pipe' });

      // Check for uncommitted changes and commit them
      const status = execSync('git status --porcelain', { cwd: workingDir, encoding: 'utf-8' });
      if (status.trim()) {
        execSync('git add -A', { cwd: workingDir, stdio: 'pipe' });
        // Security: Escape shell arguments for commit message
        const commitMsg = `feat: ${story.frontmatter.title}`;
        execSync(`git commit -m ${escapeShellArg(commitMsg)}`, { cwd: workingDir, stdio: 'pipe' });
        changesMade.push('Committed changes');
      }

      // Push branch (already validated)
      execSync(`git push -u origin ${branchName}`, { cwd: workingDir, stdio: 'pipe' });
      changesMade.push(`Pushed branch: ${branchName}`);

      // Check if PR already exists for this branch
      try {
        const existingPROutput = execSync('gh pr view --json url', { cwd: workingDir, encoding: 'utf-8', stdio: 'pipe' });
        const prData = JSON.parse(existingPROutput);
        if (prData.url) {
          changesMade.push(`PR already exists: ${prData.url}`);
          // Update story with PR URL if missing
          if (!story.frontmatter.pr_url) {
            await updateStoryField(story, 'pr_url', prData.url);
            changesMade.push('Updated story with existing PR URL');
          }
          // Don't create duplicate - skip to status update
          story = await updateStoryStatus(story, 'done');
          changesMade.push('Updated status to done');
          return {
            success: true,
            story,
            changesMade,
          };
        }
      } catch {
        // No existing PR - proceed with creation
      }

      // Create PR using gh CLI with rich formatted body
      // Security: Use escaped arguments and heredoc to prevent shell injection
      const prTitle = story.frontmatter.title;

      // Generate story file URL
      const storyFileUrl = getStoryFileURL(storyPath, branchName, workingDir);

      // Format rich PR description
      let prBody = formatPRDescription(story, storyFileUrl);

      // Truncate if needed to respect GitHub's 65K limit
      prBody = truncatePRBody(prBody);

      // Determine if draft PR should be created
      // Options parameter takes precedence, then config, default is false
      const config = loadConfig(workingDir);
      const createAsDraft = options?.draft ?? config.github?.createDraftPRs ?? false;
      const draftFlag = createAsDraft ? ' --draft' : '';

      // Use heredoc pattern for multi-line body to preserve formatting
      const ghCommand = `gh pr create --title ${escapeShellArg(prTitle)}${draftFlag} --body "$(cat <<'EOF'
${prBody}
EOF
)"`;

      const prOutput = execSync(ghCommand, { cwd: workingDir, encoding: 'utf-8' });

      const prUrl = prOutput.trim();
      await updateStoryField(story, 'pr_url', prUrl);
      const prTypeLabel = createAsDraft ? 'draft PR' : 'PR';
      changesMade.push(`Created ${prTypeLabel}: ${prUrl}`);
    } catch (error) {
      const sanitizedError = sanitizeErrorMessage(
        error instanceof Error ? error.message : String(error),
        workingDir
      );

      // Provide actionable error messages for common issues
      let errorMessage = `PR creation failed: ${sanitizedError}`;

      if (sanitizedError.includes('authentication') || sanitizedError.includes('auth') || sanitizedError.includes('credentials')) {
        errorMessage = `GitHub authentication failed. Please authenticate using one of:
1. Set GITHUB_TOKEN env var: export GITHUB_TOKEN=ghp_xxx
2. Run: gh auth login
3. Check: gh auth status`;
      }

      changesMade.push(errorMessage);
    }

    // Update status to done
    story = await updateStoryStatus(story, 'done');
    changesMade.push('Updated status to done');

    return {
      success: true,
      story,
      changesMade,
    };
  } catch (error) {
    const sanitizedError = sanitizeErrorMessage(
      error instanceof Error ? error.message : String(error),
      workingDir
    );
    return {
      success: false,
      story,
      changesMade,
      error: sanitizedError,
    };
  }
}
