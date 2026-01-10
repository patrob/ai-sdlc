import { execSync } from 'child_process';
import path from 'path';
import { parseStory, writeStory, moveStory, appendToSection, updateStoryField, isAtMaxRetries, appendReviewHistory, snapshotMaxRetries, getEffectiveMaxRetries } from '../core/story.js';
import { runAgentQuery } from '../core/client.js';
import { loadConfig } from '../core/config.js';
import { Story, AgentResult, ReviewResult, ReviewIssue, ReviewIssueSeverity, ReviewDecision, ReviewSeverity, ReviewAttempt, Config } from '../types/index.js';

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
 * Run build and test commands before review
 * Returns structured results that can be included in review context
 */
function runVerification(workingDir: string, config: Config): VerificationResult {
  const result: VerificationResult = {
    buildPassed: true,
    buildOutput: '',
    testsPassed: true,
    testsOutput: '',
  };

  // Run build command if configured
  if (config.buildCommand) {
    try {
      result.buildOutput = execSync(config.buildCommand, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 120000, // 2 minute timeout
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      result.buildPassed = true;
    } catch (error: any) {
      result.buildPassed = false;
      result.buildOutput = error.stdout || error.stderr || error.message || 'Build failed';
    }
  }

  // Run test command if configured
  if (config.testCommand) {
    try {
      result.testsOutput = execSync(config.testCommand, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 300000, // 5 minute timeout for tests
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      result.testsPassed = true;
    } catch (error: any) {
      result.testsPassed = false;
      // Capture both stdout and stderr for test output
      result.testsOutput = [error.stdout, error.stderr, error.message]
        .filter(Boolean)
        .join('\n') || 'Tests failed';
    }
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

    // Validate and normalize the structure
    const issues: ReviewIssue[] = (parsed.issues || []).map((issue: any) => ({
      severity: (issue.severity || 'major') as ReviewIssueSeverity,
      category: issue.category || reviewType.toLowerCase().replace(' ', '_'),
      description: issue.description || String(issue),
      file: issue.file,
      line: issue.line,
      suggestedFix: issue.suggestedFix,
    }));

    return {
      passed: parsed.passed !== false && issues.filter(i => i.severity === 'blocker' || i.severity === 'critical').length === 0,
      issues,
    };
  } catch (error) {
    // Fallback to text analysis if JSON parsing fails
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
 * Review Agent
 *
 * Orchestrates code review, security review, and PO acceptance.
 * Now returns structured ReviewResult with pass/fail and issues.
 */
export async function runReviewAgent(
  storyPath: string,
  sdlcRoot: string
): Promise<ReviewResult> {
  const story = parseStory(storyPath);
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);
  const config = loadConfig(workingDir);

  try {
    // Snapshot max_retries from config (protects against mid-cycle config changes)
    snapshotMaxRetries(story, config);

    // Check if story has reached max retries
    if (isAtMaxRetries(story, config)) {
      const retryCount = story.frontmatter.retry_count || 0;
      const maxRetries = getEffectiveMaxRetries(story, config);
      const errorMsg = `Story has reached maximum retry limit (${retryCount}/${maxRetries}). Manual intervention required.`;

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

    // Run build and tests BEFORE reviews
    changesMade.push('Running build and test verification...');
    const verification = runVerification(workingDir, config);

    // Create verification issues if build/tests failed
    const verificationIssues: ReviewIssue[] = [];
    let verificationContext = '';

    if (config.buildCommand) {
      if (verification.buildPassed) {
        changesMade.push(`Build passed: ${config.buildCommand}`);
        verificationContext += `\n## Build Results ✅\nBuild command \`${config.buildCommand}\` passed successfully.\n`;
      } else {
        changesMade.push(`Build FAILED: ${config.buildCommand}`);
        verificationIssues.push({
          severity: 'blocker',
          category: 'build',
          description: `Build failed. Command: ${config.buildCommand}`,
          suggestedFix: 'Fix build errors before review can proceed.',
        });
        verificationContext += `\n## Build Results ❌\nBuild command \`${config.buildCommand}\` FAILED:\n\`\`\`\n${verification.buildOutput.substring(0, 2000)}\n\`\`\`\n`;
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
        verificationIssues.push({
          severity: 'blocker',
          category: 'testing',
          description: `Tests failed. Command: ${config.testCommand}`,
          suggestedFix: 'Fix failing tests before review can proceed.',
        });
        verificationContext += `\n## Test Results ❌\nTest command \`${config.testCommand}\` FAILED:\n\`\`\`\n${verification.testsOutput.substring(0, 3000)}\n\`\`\`\n`;
      }
    }

    // Run all reviews in parallel, passing verification context
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
  const story = parseStory(storyPath);
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);

  try {
    const branchName = story.frontmatter.branch || `agentic-sdlc/${story.slug}`;

    // Check if gh CLI is available
    try {
      execSync('gh --version', { stdio: 'pipe' });
    } catch {
      changesMade.push('GitHub CLI not available - PR creation skipped');

      // Still move to done for MVP
      moveStory(story, 'done', sdlcRoot);
      changesMade.push('Moved story to done/');

      return {
        success: true,
        story: parseStory(storyPath),
        changesMade,
      };
    }

    // Create PR using gh CLI
    try {
      // First, ensure we're on the right branch and have changes committed
      execSync(`git checkout ${branchName}`, { cwd: workingDir, stdio: 'pipe' });

      // Check for uncommitted changes and commit them
      const status = execSync('git status --porcelain', { cwd: workingDir, encoding: 'utf-8' });
      if (status.trim()) {
        execSync('git add -A', { cwd: workingDir, stdio: 'pipe' });
        execSync(`git commit -m "feat: ${story.frontmatter.title}"`, { cwd: workingDir, stdio: 'pipe' });
        changesMade.push('Committed changes');
      }

      // Push branch
      execSync(`git push -u origin ${branchName}`, { cwd: workingDir, stdio: 'pipe' });
      changesMade.push(`Pushed branch: ${branchName}`);

      // Create PR
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
*Created by agentic-sdlc*`;

      const prOutput = execSync(
        `gh pr create --title "${story.frontmatter.title}" --body "${prBody.replace(/"/g, '\\"')}"`,
        { cwd: workingDir, encoding: 'utf-8' }
      );

      const prUrl = prOutput.trim();
      updateStoryField(story, 'pr_url', prUrl);
      changesMade.push(`Created PR: ${prUrl}`);
    } catch (error) {
      changesMade.push(`PR creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Move story to done
    moveStory(story, 'done', sdlcRoot);
    changesMade.push('Moved story to done/');

    return {
      success: true,
      story: parseStory(storyPath),
      changesMade,
    };
  } catch (error) {
    return {
      success: false,
      story,
      changesMade,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
