/**
 * Core retry attempt loop
 */

import path from 'path';
import { Story, AgentResult } from '../../types/index.js';
import { AgentProgressCallback, runAgentQuery } from '../../core/client.js';
import { parseStory, writeStory, updateStoryField, readSectionContent, moveToBlocked } from '../../core/story.js';
import { verifyImplementation } from '../verification.js';
import { getContentTypeGuidance } from './prompts.js';
import {
  checkForIdenticalErrors,
  updateErrorHistory,
  DEFAULT_IDENTICAL_ERROR_THRESHOLD,
} from '../../services/error-fingerprint.js';
import { captureCurrentDiffHash, extractChangedFiles, buildRetryPrompt } from './retry.js';

/**
 * Outcome type for retry attempts
 */
export type AttemptOutcome = 'failed_tests' | 'failed_build' | 'no_change';

/**
 * Result from a single retry attempt
 */
export interface AttemptHistoryEntry {
  attempt: number;
  testFailures: number;
  buildFailures: number;
  testSnippet: string;
  buildSnippet: string;
  changesSummary: string;
  outcome: AttemptOutcome;
}

/**
 * Options for the retry loop
 */
export interface RetryAttemptOptions {
  story: Story;
  storyPath: string;
  workingDir: string;
  maxRetries: number;
  reworkContext?: string;
  onProgress?: AgentProgressCallback;
  runAgentQuery?: typeof runAgentQuery;
}

/**
 * Attempt implementation with retry logic
 *
 * Runs the implementation loop indefinitely until tests pass.
 * Safety mechanisms prevent true infinite loops:
 * - Identical error fingerprinting blocks after same error 3+ consecutive times
 * - No-change detection exits if agent makes no file changes
 * - Global recovery limit (10 attempts) enforced in runner.ts
 *
 * Note: maxRetries parameter is still used for retry prompt context but
 * does NOT limit iterations. Retry counting only happens in runner.ts
 * when REVIEW returns RECOVERY decision.
 *
 * @param options Retry attempt options
 * @param changesMade Array to track changes (mutated in place)
 * @returns AgentResult with success/failure status
 */
export async function attemptImplementationWithRetries(
  options: RetryAttemptOptions,
  changesMade: string[]
): Promise<AgentResult> {
  const { story, storyPath, workingDir, maxRetries, reworkContext, onProgress } = options;
  const agentQuery = options.runAgentQuery || runAgentQuery;

  let attemptNumber = 0;
  let lastVerification: { passed: boolean; failures: number; testsOutput: string; buildOutput: string; timestamp: string } | null = null;
  let lastDiffHash = ''; // Initialize to empty string, will capture after first failure
  const attemptHistory: AttemptHistoryEntry[] = [];

  // Read plan and research from section files (with backward compat fallback)
  const planContent = await readSectionContent(storyPath, 'plan');
  const researchContent = await readSectionContent(storyPath, 'research');

  // Iterate indefinitely until tests pass. Safety mechanisms:
  // 1. Identical error fingerprinting blocks after same error 3+ consecutive times
  // 2. No-change detection exits if agent makes no file changes
  // 3. Global recovery limit in runner.ts (10 total recovery attempts across all phases)
  while (true) {
    attemptNumber++;

    const contentType = story.frontmatter.content_type || 'code';
    const contentTypeGuidance = getContentTypeGuidance(contentType);

    // Build prompt with story content plus separate section files
    let prompt = `Implement this story based on the plan:

Title: ${story.frontmatter.title}
${contentTypeGuidance}

Story content:
${story.content}`;

    // Include research findings if available
    if (researchContent.trim()) {
      prompt += `

## Research Findings
${researchContent}`;
    }

    // Include rework context BEFORE plan so agent sees feedback first
    if (reworkContext) {
      prompt += `

## REWORK REQUIRED - READ FIRST

---
${reworkContext}
---

**CRITICAL:** Fix ALL issues above BEFORE following the plan.`;
    }

    // Include implementation plan if available
    if (planContent.trim()) {
      const planHeader = reworkContext
        ? '## Implementation Plan (Review for conflicts with feedback above)'
        : '## Implementation Plan';
      prompt += `

${planHeader}
${planContent}`;
    }

    // Add rework-specific instructions after the plan
    if (reworkContext) {
      prompt += `

IMPORTANT: This is a refinement iteration. The previous implementation did not pass review.
You MUST fix all the issues listed in the REWORK REQUIRED section. Pay special attention to
blocker and critical severity issues - these must be resolved. Review the specific feedback
and make targeted fixes.`;
    }

    // Add retry context if this is a retry attempt
    if (attemptNumber > 1 && lastVerification) {
      prompt += '\n\n' + buildRetryPrompt(
        lastVerification.testsOutput,
        lastVerification.buildOutput,
        attemptNumber,
        maxRetries,
        attemptHistory
      );
    } else {
      prompt += `

Execute the implementation plan. For each task:
1. Read relevant existing files
2. Make the required changes per IMPLEMENTATION REQUIREMENTS above
3. Write tests if applicable (for code content_type)
4. Verify the changes work

Your implementation will be validated by checking git diff for the required file types.
Files in .ai-sdlc/ do not count toward validation.

Use the available tools to read files, write code, and run commands as needed.`;
    }

    // Send progress callback for all attempts (not just retries)
    if (onProgress) {
      if (attemptNumber === 1) {
        onProgress({ type: 'assistant_message', content: `Starting implementation attempt 1...` });
      } else {
        onProgress({ type: 'assistant_message', content: `Analyzing test failures, retrying implementation (attempt ${attemptNumber})...` });
      }
    }

    const implementationResult = await agentQuery({
      prompt,
      systemPrompt: `You are a senior software engineer implementing features based on a detailed plan. Your job is to execute each phase of the implementation plan.

IMPORTANT: Each story has a content_type that determines what files you must modify.
The specific requirements will be provided in the prompt. Follow them exactly or
your implementation will fail validation.

When implementing:
1. Follow the plan step by step
2. Write clean, maintainable code
3. Follow existing patterns in the codebase
4. Write tests alongside implementation (TDD when possible)
5. Update the plan checkboxes as you complete tasks
6. Do NOT create temporary files, shell scripts, or documentation files - keep all notes in the story file
7. Follow the Testing Pyramid: prioritize unit tests (colocated with source, e.g., src/foo.test.ts), then integration tests (in tests/integration/)

CRITICAL RULES ABOUT TESTS:
- Test updates are PART of implementation, not a separate phase
- If you change ANY function's behavior, update its tests IMMEDIATELY in the same step
- If you add new functionality, write tests for it IMMEDIATELY
- NEVER mark implementation complete if tests are failing
- Implementation is not done until all tests pass

You have access to tools for reading and writing files, running commands, and searching the codebase.`,
      workingDirectory: workingDir,
      onProgress,
    });

    // Add implementation notes to the story
    const notePrefix = attemptNumber > 1 ? `Implementation Notes - Retry ${attemptNumber - 1}` : 'Implementation Notes';
    const implementationNotes = `
### ${notePrefix} (${new Date().toISOString().split('T')[0]})

${implementationResult}
`;

    // Append to story content
    const updatedStory = parseStory(storyPath);
    updatedStory.content += '\n\n' + implementationNotes;
    await writeStory(updatedStory);
    changesMade.push(attemptNumber > 1 ? `Added retry ${attemptNumber - 1} notes` : 'Added implementation notes');

    // PRE-FLIGHT CHECK: Capture diff hash BEFORE verification to detect no-change scenarios early
    const currentDiffHash = captureCurrentDiffHash(workingDir);
    const changesSummary = extractChangedFiles(workingDir);

    // Check for no-change scenario BEFORE running verification (saves ~30 seconds)
    if (attemptNumber > 1 && lastDiffHash && lastDiffHash === currentDiffHash) {
      changesMade.push('No changes detected since last attempt - skipping verification');

      // Record this no-change attempt in history
      attemptHistory.push({
        attempt: attemptNumber,
        testFailures: 0,
        buildFailures: 0,
        testSnippet: '',
        buildSnippet: '',
        changesSummary: 'No changes detected',
        outcome: 'no_change',
      });

      return {
        success: false,
        story: parseStory(storyPath),
        changesMade,
        error: 'No progress detected - agent made no file changes',
      };
    }

    // Update lastDiffHash for next iteration
    lastDiffHash = currentDiffHash;

    changesMade.push('Running verification before marking complete...');
    const verification = await verifyImplementation(updatedStory, workingDir);

    await updateStoryField(updatedStory, 'last_test_run', {
      passed: verification.passed,
      failures: verification.failures,
      timestamp: verification.timestamp,
    });

    if (verification.passed) {
      // Success! Clear error history and return success
      changesMade.push('Verification passed - implementation successful');

      // Clear error history on success (prevent stale fingerprints from affecting future cycles)
      const successStory = parseStory(storyPath);
      successStory.frontmatter.error_history = [];
      await writeStory(successStory);

      // Send success progress callback
      if (onProgress) {
        onProgress({ type: 'assistant_message', content: `Implementation succeeded on attempt ${attemptNumber}` });
      }

      return {
        success: true,
        story: parseStory(storyPath),
        changesMade,
      };
    }

    // Verification failed - check for retry conditions
    lastVerification = verification;

    // NOTE: Retry counting is NOT done here during internal iterations.
    // Retry count is only incremented in runner.ts when REVIEW returns RECOVERY decision.
    // This allows unlimited internal iterations until tests pass.

    // Extract first 100 chars of test and build output for history
    const testSnippet = verification.testsOutput.substring(0, 100).replace(/\n/g, ' ');
    const buildSnippet = verification.buildOutput.substring(0, 100).replace(/\n/g, ' ');

    // Determine if there are build failures (build output contains error indicators)
    const hasBuildErrors = verification.buildOutput &&
      (verification.buildOutput.includes('error') ||
       verification.buildOutput.includes('Error') ||
       verification.buildOutput.includes('failed'));
    const buildFailures = hasBuildErrors ? 1 : 0;

    // Determine outcome based on what failed
    const outcome = hasBuildErrors ? 'failed_build' : 'failed_tests';

    // --- ERROR FINGERPRINTING: Detect identical error loops ---
    // Combine test and build output for fingerprinting
    const combinedErrorOutput = `${verification.buildOutput}\n---\n${verification.testsOutput}`;
    const errorHistory = updatedStory.frontmatter.error_history || [];
    const fingerprintCheck = checkForIdenticalErrors(
      combinedErrorOutput,
      errorHistory,
      DEFAULT_IDENTICAL_ERROR_THRESHOLD
    );

    // Update error history in story
    const newErrorHistory = updateErrorHistory(errorHistory, fingerprintCheck);
    updatedStory.frontmatter.error_history = newErrorHistory;
    await writeStory(updatedStory);

    // Check for identical error loop - block early to prevent wasted cycles
    if (fingerprintCheck.isIdentical) {
      changesMade.push(`Identical error detected ${fingerprintCheck.consecutiveCount} times - blocking early`);

      // Block the story with diagnostic information
      await moveToBlocked(storyPath, `Identical error loop detected: same error occurred ${fingerprintCheck.consecutiveCount} consecutive times`, {
        identicalErrorsDetected: true,
        consecutiveIdenticalCount: fingerprintCheck.consecutiveCount,
        suggestedFix: 'The implementation is stuck on the same error. Manual investigation needed to fix the root cause.',
      });

      return {
        success: false,
        story: parseStory(storyPath),
        changesMade,
        error: `Implementation blocked: Identical error occurred ${fingerprintCheck.consecutiveCount} consecutive times.\n\nError preview:\n${fingerprintCheck.errorPreview}\n\nThis indicates a stuck retry loop. Manual intervention required.`,
      };
    }
    // --- END ERROR FINGERPRINTING ---

    // Record this attempt in history with both test and build failures
    attemptHistory.push({
      attempt: attemptNumber,
      testFailures: verification.failures,
      buildFailures,
      testSnippet,
      buildSnippet,
      changesSummary,
      outcome,
    });

    // Add structured retry entry to changes array
    changesMade.push(`Attempt ${attemptNumber}: ${verification.failures} test(s) failing`);

    // Continue to next retry attempt - send progress update
    if (onProgress) {
      onProgress({ type: 'assistant_message', content: `Attempt ${attemptNumber} failed: ${verification.failures} test(s) failing, continuing...` });
    }
  }

  // Note: This code is unreachable since we use while(true) with explicit returns.
  // Kept for TypeScript compiler satisfaction.
  return {
    success: false,
    story: parseStory(storyPath),
    changesMade,
    error: 'Implementation failed unexpectedly.',
  };
}
