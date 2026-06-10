import path from 'path';
import { parseStory, writeStory, updateStoryStatus, updateStoryField, isAtMaxRetries, appendReviewHistory, snapshotMaxRetries, getEffectiveMaxRetries, getEffectiveMaxImplementationRetries, writeSectionContent } from '../../core/story.js';
import type { IProvider } from '../../providers/types.js';
import { getLogger } from '../../core/logger.js';
import { loadConfig } from '../../core/config.js';
import type { ReviewResult, ReviewDecision, ReviewSeverity, ReviewAttempt, ReviewIssue } from '../../types/index.js';
import { ReviewDecision as ReviewDecisionEnum, ReviewSeverity as ReviewSeverityEnum } from '../../types/index.js';
import { detectTestDuplicationPatterns } from '../test-pattern-detector.js';
import { validateWorkingDirectory, sanitizeCommandOutput } from './security.js';
import { MAX_TEST_OUTPUT_SIZE, runVerificationAsync, type VerificationProgressCallback } from './verification.js';
import { validateTDDCycles, generateTDDIssues } from './tdd-validation.js';
import { parseReviewResponse, determineReviewSeverity, deriveIndividualPassFailFromPerspectives, formatIssuesForDisplay } from './parsers.js';
import { determineEffectiveContentType } from './diff-analysis.js';
import { generateReviewSummary } from './summary.js';
import { UNIFIED_REVIEW_PROMPT } from './prompts.js';
import { createPullRequest } from './pr.js';
import { runSubReview } from './sub-review.js';
import { runPreChecks, runTestFileCheck } from './pre-check.js';

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
  options?: ReviewAgentOptions,
  provider?: IProvider
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
      decision: ReviewDecisionEnum.FAILED,
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
        decision: ReviewDecisionEnum.FAILED,
        reviewType: 'combined',
        issues: [{
          severity: 'blocker',
          category: 'max_retries_reached',
          description: errorMsg,
        }],
        feedback: errorMsg,
      };
    }

    // PRE-CHECK GATE: Content type-aware validation before running expensive LLM reviews
    const preCheckResult = await runPreChecks(story, workingDir, storyPath);
    const { contentType, validationFailed, validationReason, validationCategory } = preCheckResult;

    // Handle validation failure (if any)
    if (validationFailed) {
      const retryCount = story.frontmatter.implementation_retry_count || 0;
      const maxRetries = getEffectiveMaxImplementationRetries(story, config);

      if (retryCount < maxRetries) {
        // RECOVERABLE: Trigger implementation recovery
        logger.warn('review', 'Validation failed - triggering implementation recovery', {
          storyId: story.frontmatter.id,
          retryCount,
          maxRetries,
          contentType,
        });

        await updateStoryField(story, 'implementation_complete', false);

        // Set restart reason based on content type
        const restartReason = contentType === 'configuration'
          ? 'Configuration story requires changes to config files (.claude/, .github/, or root config files). No configuration changes detected.'
          : contentType === 'mixed'
            ? 'Mixed story requires both source AND configuration changes - no source code was modified.'
            : contentType === 'documentation'
              ? 'Documentation story requires changes to markdown files (.md) or docs/ directory. No documentation changes detected.'
              : 'No source code changes detected. Implementation wrote documentation only.';

        await updateStoryField(story, 'last_restart_reason', restartReason);

        // Create user-friendly recovery description
        const recoveryDescription = contentType === 'configuration'
          ? 'No configuration file modifications detected. Re-running implementation phase.'
          : contentType === 'mixed'
            ? 'No source code modifications detected. Re-running implementation phase.'
            : contentType === 'documentation'
              ? 'No documentation file modifications detected. Re-running implementation phase.'
              : 'No source code modifications detected. Re-running implementation phase.';

        return {
          success: true,
          story: parseStory(storyPath),
          changesMade: ['Detected incomplete implementation', 'Triggered implementation recovery'],
          passed: false,
          decision: ReviewDecisionEnum.RECOVERY,
          reviewType: 'pre-check' as any,
          issues: [{
            severity: 'critical',
            category: validationCategory,
            description: recoveryDescription,
          }],
          feedback: `Implementation recovery triggered - ${validationReason}`,
        };
      } else {
        // NON-RECOVERABLE: Max retries reached
        const maxRetriesDisplay = Number.isFinite(maxRetries) ? maxRetries : '∞';
        logger.error('review', 'Validation failed and max implementation retries reached', {
          storyId: story.frontmatter.id,
          retryCount,
          maxRetries,
          contentType,
        });

        return {
          success: true,
          story: parseStory(storyPath),
          changesMade: ['Detected incomplete implementation', 'Max retries reached'],
          passed: false,
          decision: ReviewDecisionEnum.FAILED,
          severity: ReviewSeverityEnum.CRITICAL,
          reviewType: 'pre-check' as any,
          issues: [{
            severity: 'blocker',
            category: validationCategory,
            description: `${validationReason} This has occurred ${retryCount} time(s) (max: ${maxRetriesDisplay}). Manual intervention required.`,
            suggestedFix: 'Review the story requirements and implementation plan. Verify the content_type field matches the expected implementation. Consider simplifying the story or providing more explicit guidance.',
          }],
          feedback: 'Implementation failed validation after multiple attempts.',
        };
      }
    }

    // Validation passed - proceed with normal review flow
    logger.info('review', 'Content validation passed - proceeding with verification', {
      storyId: story.frontmatter.id,
      contentType,
    });

    // PRE-CHECK GATE: Check if test files exist (only for code/mixed types)
    const testFileCheckResult = await runTestFileCheck(story, workingDir, contentType, storyPath);
    if (!testFileCheckResult.passed && testFileCheckResult.reviewResult) {
      return testFileCheckResult.reviewResult;
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
          suggestedFix: 'Fix failing tests before review can proceed. If tests are failing after implementation changes, verify that tests were updated to match the new behavior (not just the old behavior).',
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
        decision: ReviewDecisionEnum.REJECTED,
        severity: ReviewSeverityEnum.CRITICAL,
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
      verificationContext,
      provider
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

    // Determine if this is a retry (retry_count > 0)
    const retryCount = story.frontmatter.retry_count || 0;
    const isRetry = retryCount > 0;

    // Write review notes to section file
    await writeSectionContent(storyPath, 'review', reviewNotes, {
      append: isRetry,
      iteration: retryCount + 1,
      isRework: isRetry,
    });
    changesMade.push('Added unified collaborative review notes');

    // Determine decision
    const decision = passed ? ReviewDecisionEnum.APPROVED : ReviewDecisionEnum.REJECTED;

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

      // Auto-create PR after review approval
      logger.info('review', 'Reviews passed - creating PR', {
        storyId: story.frontmatter.id,
      });
      const prResult = await createPullRequest(storyPath, sdlcRoot);
      if (prResult.success) {
        changesMade.push(...prResult.changesMade);
      } else {
        changesMade.push(`PR creation failed: ${prResult.error || 'unknown error'}`);
        // Return failure - PR creation is required for completion
        return {
          success: false,
          story: prResult.story,
          changesMade,
          passed: true, // Reviews passed but PR failed
          decision,
          reviewType: 'combined',
          issues: allIssues,
          feedback: 'Reviews passed but PR creation failed',
        };
      }
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
      decision: ReviewDecisionEnum.FAILED,
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
