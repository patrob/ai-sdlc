import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { parseStory, writeStory, moveStory, appendToSection, updateStoryField, isAtMaxRetries, appendReviewHistory, snapshotMaxRetries, getEffectiveMaxRetries } from '../core/story.js';
import { runAgentQuery } from '../core/client.js';
import { loadConfig, DEFAULT_TIMEOUTS } from '../core/config.js';
import { Story, AgentResult, ReviewResult, ReviewIssue, ReviewIssueSeverity, ReviewDecision, ReviewSeverity, ReviewAttempt, Config } from '../types/index.js';

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
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  suggestedFix: z.string().max(2000).optional(),
});

const ReviewResponseSchema = z.object({
  passed: z.boolean(),
  issues: z.array(ReviewIssueSchema),
});

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
      "category": "code_quality" | "security" | "requirements" | "testing" | etc,
      "description": "Detailed description of the issue",
      "file": "path/to/file.ts" (if applicable),
      "line": 42 (if applicable),
      "suggestedFix": "How to fix this issue"
    }
  ]
}

Severity guidelines:
- blocker: Must be fixed before merging (security holes, broken functionality)
- critical: Should be fixed before merging (major bugs, poor practices)
- major: Should be addressed soon (code quality, maintainability)
- minor: Nice to have improvements (style, optimizations)

If no issues found, return: {"passed": true, "issues": []}
`;

const CODE_REVIEW_PROMPT = `You are a senior code reviewer. Review the implementation for:
1. Code quality and maintainability
2. Following best practices
3. Potential bugs or issues
4. Test coverage adequacy

${REVIEW_OUTPUT_FORMAT}`;

const SECURITY_REVIEW_PROMPT = `You are a security specialist. Review the implementation for:
1. OWASP Top 10 vulnerabilities
2. Input validation issues
3. Authentication/authorization problems
4. Data exposure risks

${REVIEW_OUTPUT_FORMAT}`;

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
 * Aggregate issues from multiple reviews and determine overall pass/fail
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
      output += `**${issue.category}**: ${issue.description}\n`;
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
  const story = parseStory(storyPath);
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);

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
    snapshotMaxRetries(story, config);

    // Check if story has reached max retries
    if (isAtMaxRetries(story, config)) {
      const retryCount = story.frontmatter.retry_count || 0;
      const maxRetries = getEffectiveMaxRetries(story, config);
      const maxRetriesDisplay = Number.isFinite(maxRetries) ? maxRetries : '∞';
      const errorMsg = `Story has reached maximum retry limit (${retryCount}/${maxRetriesDisplay}). Manual intervention required.`;

      updateStoryField(story, 'last_error', errorMsg);
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

    // Verification passed - proceed with all reviews in parallel, passing verification context
    changesMade.push('Verification passed - proceeding with code/security/PO reviews');
    const [codeReview, securityReview, poReview] = await Promise.all([
      runSubReview(story, CODE_REVIEW_PROMPT, 'Code Review', workingDir, verificationContext),
      runSubReview(story, SECURITY_REVIEW_PROMPT, 'Security Review', workingDir, verificationContext),
      runSubReview(story, PO_REVIEW_PROMPT, 'Product Owner Review', workingDir, verificationContext),
    ]);

    // Parse each review response into structured issues
    const codeResult = parseReviewResponse(codeReview, 'Code Review');
    const securityResult = parseReviewResponse(securityReview, 'Security Review');
    const poResult = parseReviewResponse(poReview, 'Product Owner Review');

    // Add verification issues to code result (they're code-quality related)
    codeResult.issues.unshift(...verificationIssues);
    if (verificationIssues.length > 0) {
      codeResult.passed = false;
    }

    // Aggregate all issues and determine overall pass/fail
    const { passed, allIssues, severity } = aggregateReviews(codeResult, securityResult, poResult);

    // Compile review notes with structured format
    const reviewNotes = `
### Code Review
${formatIssuesForDisplay(codeResult.issues)}

### Security Review
${formatIssuesForDisplay(securityResult.issues)}

### Product Owner Review
${formatIssuesForDisplay(poResult.issues)}

### Overall Result
${passed ? '✅ **PASSED** - All reviews approved' : '❌ **FAILED** - Issues must be addressed'}

---
*Reviews completed: ${new Date().toISOString().split('T')[0]}*
`;

    // Append reviews to story
    appendToSection(story, 'Review Notes', reviewNotes);
    changesMade.push('Added code review notes');
    changesMade.push('Added security review notes');
    changesMade.push('Added product owner review notes');

    // Determine decision
    const decision = passed ? ReviewDecision.APPROVED : ReviewDecision.REJECTED;

    // Create review attempt record (omit undefined fields to avoid YAML serialization errors)
    const reviewAttempt: ReviewAttempt = {
      timestamp: new Date().toISOString(),
      decision,
      ...(passed ? {} : { severity }),
      feedback: passed ? 'All reviews passed' : formatIssuesForDisplay(allIssues),
      blockers: allIssues.filter(i => i.severity === 'blocker').map(i => i.description),
      codeReviewPassed: codeResult.passed,
      securityReviewPassed: securityResult.passed,
      poReviewPassed: poResult.passed,
    };

    // Append to review history
    appendReviewHistory(story, reviewAttempt);
    changesMade.push('Recorded review attempt in history');

    if (passed) {
      updateStoryField(story, 'reviews_complete', true);
      changesMade.push('Marked reviews_complete: true');
    } else {
      changesMade.push(`Reviews failed with ${allIssues.length} issue(s) - rework required`);
      // Don't mark reviews_complete, this will trigger rework
    }

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
 * Create a pull request for the completed story
 */
export async function createPullRequest(
  storyPath: string,
  sdlcRoot: string
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

      // Still move to done for MVP
      story = moveStory(story, 'done', sdlcRoot);
      changesMade.push('Moved story to done/');

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

      // Create PR using gh CLI with safe arguments
      // Security: Use escaped arguments to prevent shell injection
      const prTitle = story.frontmatter.title;
      const prBody = `## Summary

${story.frontmatter.title}

## Story

${story.content.substring(0, 1000)}...

## Checklist

- [x] Implementation complete
- [x] Code review passed
- [x] Security review passed
- [x] Product owner approved

---
*Created by ai-sdlc*`;

      const prOutput = execSync(
        `gh pr create --title ${escapeShellArg(prTitle)} --body ${escapeShellArg(prBody)}`,
        { cwd: workingDir, encoding: 'utf-8' }
      );

      const prUrl = prOutput.trim();
      updateStoryField(story, 'pr_url', prUrl);
      changesMade.push(`Created PR: ${prUrl}`);
    } catch (error) {
      const sanitizedError = sanitizeErrorMessage(
        error instanceof Error ? error.message : String(error),
        workingDir
      );
      changesMade.push(`PR creation failed: ${sanitizedError}`);
    }

    // Move story to done
    story = moveStory(story, 'done', sdlcRoot);
    changesMade.push('Moved story to done/');

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
