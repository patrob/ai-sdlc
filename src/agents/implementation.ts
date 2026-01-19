import { execSync, spawn, spawnSync } from 'child_process';
import path from 'path';
import { ProcessManager } from '../core/process-manager.js';
import {
  parseStory,
  writeStory,
  updateStoryStatus,
  updateStoryField,
  resetImplementationRetryCount,
  incrementImplementationRetryCount,
  isAtMaxImplementationRetries,
  getEffectiveMaxImplementationRetries,
  incrementTotalRecoveryAttempts,
} from '../core/story.js';
import { runAgentQuery, AgentProgressCallback } from '../core/client.js';
import { getLogger } from '../core/logger.js';
import { Story, AgentResult, TDDTestCycle, TDDConfig } from '../types/index.js';
import { AgentOptions } from './research.js';
import { loadConfig, DEFAULT_TDD_CONFIG } from '../core/config.js';
import { verifyImplementation } from './verification.js';
import { createHash } from 'crypto';
import { parseTypeScriptErrors, classifyAndSortErrors } from '../services/error-classifier.js';

// Re-export for convenience
export type { AgentProgressCallback };

/**
 * Result from a TDD phase execution
 */
export interface TDDPhaseResult {
  testName: string;
  testFile: string;
  timestamp: string;
  output: string;
  success: boolean;
}

/**
 * Options for TDD phase execution (allows mocking for tests)
 */
export interface TDDPhaseOptions {
  workingDir: string;
  runAgentQuery?: typeof runAgentQuery;
  onProgress?: AgentProgressCallback;
}

/**
 * Options for full TDD implementation (allows mocking for tests)
 */
export interface TDDImplementationOptions {
  runAgentQuery?: typeof runAgentQuery;
  runSingleTest?: typeof runSingleTest;
  runAllTests?: typeof runAllTests;
  onProgress?: AgentProgressCallback;
}

export const TDD_SYSTEM_PROMPT = `You are practicing strict Test-Driven Development.

Your workflow MUST follow this exact cycle:

**RED Phase**:
1. Write ONE test that expresses the next acceptance criterion
2. The test MUST fail because the functionality doesn't exist
3. Run the test and verify it fails
4. Explain why it fails and what it's testing

**GREEN Phase**:
1. Write the MINIMUM code to make this ONE test pass
2. Do NOT add extra features
3. Run the test to verify it passes
4. Run ALL tests to ensure nothing broke

**REFACTOR Phase**:
1. Look for improvements (DRY, clarity, performance)
2. Make changes ONLY if tests stay green
3. Run ALL tests after each change

Complete one full cycle before starting the next test.
Never write code before writing a test.
Never write multiple tests before making the first one pass.`;

const IMPLEMENTATION_SYSTEM_PROMPT = `You are a senior software engineer implementing features based on a detailed plan. Your job is to execute each phase of the implementation plan.

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

You have access to tools for reading and writing files, running commands, and searching the codebase.`;

/**
 * Run a single test file and return pass/fail result
 */
export async function runSingleTest(
  testFile: string,
  workingDir: string,
  testTimeout: number
): Promise<{ passed: boolean; output: string }> {
  return new Promise((resolve) => {
    const outputChunks: string[] = [];
    let killed = false;

    const child = spawn('npm', ['test', '--', testFile], {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    ProcessManager.getInstance().registerChild(child);

    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, testTimeout);

    child.stdout?.on('data', (data: Buffer) => {
      outputChunks.push(data.toString());
    });

    child.stderr?.on('data', (data: Buffer) => {
      outputChunks.push(data.toString());
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      const output = outputChunks.join('');
      if (killed) {
        resolve({
          passed: false,
          output: output + `\n[Command timed out after ${Math.round(testTimeout / 1000)} seconds]`,
        });
      } else {
        resolve({
          passed: code === 0,
          output,
        });
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        passed: false,
        output: outputChunks.join('') + `\n[Command error: ${error.message}]`,
      });
    });
  });
}

/**
 * Run all tests and return pass/fail result
 */
export async function runAllTests(
  workingDir: string,
  testTimeout: number
): Promise<{ passed: boolean; output: string }> {
  return new Promise((resolve) => {
    const outputChunks: string[] = [];
    let killed = false;

    const child = spawn('npm', ['test'], {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    ProcessManager.getInstance().registerChild(child);

    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, testTimeout);

    child.stdout?.on('data', (data: Buffer) => {
      outputChunks.push(data.toString());
    });

    child.stderr?.on('data', (data: Buffer) => {
      outputChunks.push(data.toString());
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      const output = outputChunks.join('');
      if (killed) {
        resolve({
          passed: false,
          output: output + `\n[Command timed out after ${Math.round(testTimeout / 1000)} seconds]`,
        });
      } else {
        resolve({
          passed: code === 0,
          output,
        });
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        passed: false,
        output: outputChunks.join('') + `\n[Command error: ${error.message}]`,
      });
    });
  });
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
 * Commit changes if all tests pass
 *
 * @param workingDir - The working directory for git operations
 * @param message - The commit message
 * @param testTimeout - Timeout for running tests
 * @param testRunner - Optional test runner for dependency injection (defaults to runAllTests)
 * @returns Object indicating whether commit was made and reason if not
 */
export async function commitIfAllTestsPass(
  workingDir: string,
  message: string,
  testTimeout: number,
  testRunner: typeof runAllTests = runAllTests
): Promise<{ committed: boolean; reason?: string }> {
  try {
    // Security: Validate working directory before use
    validateWorkingDir(workingDir);

    // Check for uncommitted changes using spawn with shell: false
    const statusResult = spawnSync('git', ['status', '--porcelain'], {
      cwd: workingDir,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (statusResult.status !== 0 || !statusResult.stdout || !(statusResult.stdout as string).trim()) {
      return { committed: false, reason: 'nothing to commit' };
    }

    // Run FULL test suite
    const testResult = await testRunner(workingDir, testTimeout);
    if (!testResult.passed) {
      return { committed: false, reason: 'tests failed' };
    }

    // Commit changes using spawn with shell: false
    const addResult = spawnSync('git', ['add', '-A'], {
      cwd: workingDir,
      shell: false,
      stdio: 'pipe',
    });

    if (addResult.status !== 0) {
      throw new Error(`git add failed: ${addResult.stderr}`);
    }

    const commitResult = spawnSync('git', ['commit', '-m', message], {
      cwd: workingDir,
      shell: false,
      stdio: 'pipe',
    });

    if (commitResult.status !== 0) {
      throw new Error(`git commit failed: ${commitResult.stderr}`);
    }

    return { committed: true };
  } catch (error) {
    // Re-throw git errors for caller to handle
    throw error;
  }
}

/**
 * Extract test file path from agent output
 */
function extractTestFile(agentOutput: string): string {
  // Look for common patterns in agent output
  const patterns = [
    /(?:created|wrote|added|test file[:\s]+)[\s`'"]*([^\s`'"]+\.test\.[tj]sx?)/i,
    /([^\s`'"]+\.test\.[tj]sx?)/i,
    /([^\s`'"]+\.spec\.[tj]sx?)/i,
  ];

  for (const pattern of patterns) {
    const match = agentOutput.match(pattern);
    if (match) {
      return match[1];
    }
  }

  // Default fallback
  return 'src/unknown.test.ts';
}

/**
 * Extract test name from agent output or story content
 */
function extractTestName(agentOutput: string, story: Story): string {
  // Try to extract from agent output
  const patterns = [
    /(?:test|it|describe)[(\s]+['"`]([^'"`]+)['"`]/i,
    /testing[:\s]+([^\n]+)/i,
    /for[:\s]+([^\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = agentOutput.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // Fallback: extract first unchecked AC
  const acMatch = story.content.match(/- \[ \] ([^\n]+)/);
  if (acMatch) {
    return acMatch[1].trim();
  }

  return 'Unknown test';
}

/**
 * RED Phase: Write a failing test
 *
 * Creates a test that expresses the next acceptance criterion.
 * The test MUST fail because the functionality doesn't exist yet.
 */
export async function executeRedPhase(
  story: Story,
  cycleNumber: number,
  options: TDDPhaseOptions
): Promise<TDDPhaseResult> {
  const agentQuery = options.runAgentQuery || runAgentQuery;
  const timestamp = new Date().toISOString();

  const prompt = `You are in the RED phase of TDD (cycle ${cycleNumber}).

Story: ${story.frontmatter.title}

Current acceptance criteria (unchecked = not yet implemented):
${story.content}

Your task:
1. Look at the FIRST unchecked acceptance criterion (- [ ])
2. Write ONE failing test that validates this criterion
3. The test should be minimal but meaningful
4. Return the test file path where you created/modified the test

Remember: The test MUST fail because no implementation exists yet.
Write the test now.`;

  const output = await agentQuery({
    prompt,
    systemPrompt: TDD_SYSTEM_PROMPT,
    workingDirectory: options.workingDir,
    onProgress: options.onProgress,
  });

  const testFile = extractTestFile(output);
  const testName = extractTestName(output, story);

  return {
    testName,
    testFile,
    timestamp,
    output,
    success: true,
  };
}

/**
 * GREEN Phase: Write minimum code to pass the test
 *
 * Implements just enough code to make the failing test pass.
 * Does NOT add extra features or optimizations.
 */
export async function executeGreenPhase(
  story: Story,
  cycleNumber: number,
  testFile: string,
  options: TDDPhaseOptions
): Promise<TDDPhaseResult> {
  const agentQuery = options.runAgentQuery || runAgentQuery;
  const timestamp = new Date().toISOString();

  const prompt = `You are in the GREEN phase of TDD (cycle ${cycleNumber}).

Story: ${story.frontmatter.title}
Test file: ${testFile}

The test you wrote in the RED phase is now failing.

Your task:
1. Write the MINIMUM code to make this ONE test pass
2. Do NOT add extra features or optimizations
3. Do NOT refactor yet - that comes in the next phase
4. Keep the implementation simple and focused

Remember: Only write enough code to make the test pass. Nothing more.
Implement the code now.`;

  const output = await agentQuery({
    prompt,
    systemPrompt: TDD_SYSTEM_PROMPT,
    workingDirectory: options.workingDir,
    onProgress: options.onProgress,
  });

  const testName = extractTestName(output, story);

  return {
    testName,
    testFile,
    timestamp,
    output,
    success: true,
  };
}

/**
 * REFACTOR Phase: Improve code while keeping tests green
 *
 * Improves code quality without changing behavior.
 * All tests must remain passing after each change.
 */
export async function executeRefactorPhase(
  story: Story,
  cycleNumber: number,
  testFile: string,
  options: TDDPhaseOptions
): Promise<TDDPhaseResult> {
  const agentQuery = options.runAgentQuery || runAgentQuery;
  const timestamp = new Date().toISOString();

  const prompt = `You are in the REFACTOR phase of TDD (cycle ${cycleNumber}).

Story: ${story.frontmatter.title}
Test file: ${testFile}

The test is now passing. Time to improve the code.

Your task:
1. Look for opportunities to improve the code:
   - Remove duplication (DRY)
   - Improve naming and clarity
   - Simplify complex logic
   - Performance improvements (if obvious)
2. Make changes incrementally
3. Ensure ALL tests stay green after each change
4. If no refactoring is needed, that's fine - skip to the next cycle

Remember: The goal is cleaner code, not new features.
Refactor now (or skip if the code is already clean).`;

  const output = await agentQuery({
    prompt,
    systemPrompt: TDD_SYSTEM_PROMPT,
    workingDirectory: options.workingDir,
    onProgress: options.onProgress,
  });

  const testName = extractTestName(output, story);

  return {
    testName,
    testFile,
    timestamp,
    output,
    success: true,
  };
}

/**
 * Record a completed TDD cycle to the story frontmatter
 */
export function recordTDDCycle(
  cycleNumber: number,
  redResult: TDDPhaseResult,
  greenResult: TDDPhaseResult,
  refactorResult: TDDPhaseResult
): TDDTestCycle {
  return {
    test_name: redResult.testName,
    test_file: redResult.testFile,
    red_timestamp: redResult.timestamp,
    green_timestamp: greenResult.timestamp,
    refactor_timestamp: refactorResult.timestamp,
    test_output_red: redResult.output,
    test_output_green: greenResult.output,
    all_tests_green: true,
    cycle_number: cycleNumber,
  };
}

/**
 * Check if all acceptance criteria have been covered (checked off)
 */
export function checkACCoverage(story: Story): boolean {
  // Find the Acceptance Criteria section
  const acSectionMatch = story.content.match(/## Acceptance Criteria\s*\n([\s\S]*?)(?=\n##|$)/i);

  if (!acSectionMatch) {
    // No AC section = nothing to check = done
    return true;
  }

  const acSection = acSectionMatch[1];

  // Find all checkbox items
  const uncheckedItems = acSection.match(/- \[ \]/g);
  const checkedItems = acSection.match(/- \[x\]/gi);

  // If there are unchecked items, coverage is incomplete
  if (uncheckedItems && uncheckedItems.length > 0) {
    return false;
  }

  // If there are checked items (and no unchecked), coverage is complete
  // If there are no checkboxes at all, consider it complete
  return true;
}

/**
 * Run the full TDD implementation loop
 *
 * Executes Red-Green-Refactor cycles until all acceptance criteria are covered
 * or the maximum number of cycles is reached.
 */
export async function runTDDImplementation(
  story: Story,
  sdlcRoot: string,
  options: TDDImplementationOptions = {}
): Promise<AgentResult> {
  const workingDir = path.dirname(sdlcRoot);
  const config = loadConfig(workingDir);
  const tddConfig: TDDConfig = config.tdd || DEFAULT_TDD_CONFIG;
  const changesMade: string[] = [];

  const agentQuery = options.runAgentQuery || runAgentQuery;
  const singleTest = options.runSingleTest || runSingleTest;
  const allTests = options.runAllTests || runAllTests;
  const testTimeout = config.timeouts?.testTimeout || 300000;

  // Get starting cycle number from history
  let cycleNumber = (story.frontmatter.tdd_test_history?.length || 0) + 1;

  while (cycleNumber <= tddConfig.maxCycles) {
    changesMade.push(`Starting TDD cycle ${cycleNumber}`);

    // RED Phase: Write failing test
    const redResult = await executeRedPhase(story, cycleNumber, {
      workingDir,
      runAgentQuery: agentQuery,
      onProgress: options.onProgress,
    });

    // Verify test fails (expected in RED phase)
    const redTestResult = await singleTest(redResult.testFile, workingDir, testTimeout);
    if (redTestResult.passed) {
      return {
        success: false,
        story,
        changesMade,
        error: `TDD Violation: Test passed immediately in RED phase (cycle ${cycleNumber}). Tests must fail before implementation.`,
      };
    }
    changesMade.push(`RED: Test "${redResult.testName}" fails as expected`);

    // GREEN Phase: Write minimum code
    const greenResult = await executeGreenPhase(story, cycleNumber, redResult.testFile, {
      workingDir,
      runAgentQuery: agentQuery,
      onProgress: options.onProgress,
    });

    // Verify test now passes
    const greenTestResult = await singleTest(redResult.testFile, workingDir, testTimeout);
    if (!greenTestResult.passed) {
      return {
        success: false,
        story,
        changesMade,
        error: `TDD Violation: Test still failing in GREEN phase (cycle ${cycleNumber}). Implementation must make test pass.`,
      };
    }
    changesMade.push(`GREEN: Test "${redResult.testName}" now passes`);

    // Verify no regression (all tests still pass)
    const regressionCheck = await allTests(workingDir, testTimeout);
    if (!regressionCheck.passed) {
      return {
        success: false,
        story,
        changesMade,
        error: `TDD Violation: Regression detected after GREEN phase (cycle ${cycleNumber}). New code broke existing tests.`,
      };
    }
    changesMade.push('GREEN: No regression - all tests pass');

    // REFACTOR Phase: Improve code
    const refactorResult = await executeRefactorPhase(story, cycleNumber, redResult.testFile, {
      workingDir,
      runAgentQuery: agentQuery,
      onProgress: options.onProgress,
    });

    // Verify tests still pass after refactoring
    const refactorCheck = await allTests(workingDir, testTimeout);
    if (!refactorCheck.passed) {
      return {
        success: false,
        story,
        changesMade,
        error: `TDD Violation: Refactoring broke tests (cycle ${cycleNumber}). Undo changes and refactor more carefully.`,
      };
    }
    changesMade.push('REFACTOR: All tests still pass');

    // Commit changes after successful TDD cycle
    try {
      const commitResult = await commitIfAllTestsPass(
        workingDir,
        `feat(${story.slug}): TDD cycle ${cycleNumber} - ${redResult.testName}`,
        testTimeout,
        allTests
      );
      if (commitResult.committed) {
        changesMade.push(`Committed: TDD cycle ${cycleNumber} - ${redResult.testName}`);
      } else {
        changesMade.push(`Skipped commit: ${commitResult.reason}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      changesMade.push(`Commit warning: ${errorMsg} (continuing implementation)`);
    }

    // Record the completed cycle
    const cycle = recordTDDCycle(cycleNumber, redResult, greenResult, refactorResult);

    // Update story with cycle history
    const history = story.frontmatter.tdd_test_history || [];
    history.push(cycle);
    // Trim to last 100 cycles to prevent unbounded growth
    story.frontmatter.tdd_test_history = history.slice(-100);
    story.frontmatter.tdd_current_test = cycle;

    // Persist the TDD cycle history to disk
    await writeStory(story);

    changesMade.push(`Completed TDD cycle ${cycleNumber}`);

    // Check if all AC are now covered
    // Re-read story to get latest content (agent may have updated checkboxes)
    const updatedStory = parseStory(story.path);
    if (checkACCoverage(updatedStory)) {
      changesMade.push('All acceptance criteria covered');
      return {
        success: true,
        story: updatedStory,
        changesMade,
      };
    }

    cycleNumber++;
  }

  // Max cycles reached
  return {
    success: false,
    story,
    changesMade,
    error: `TDD: Maximum cycles (${tddConfig.maxCycles}) reached without completing all acceptance criteria.`,
  };
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
}

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
 * Attempt implementation with retry logic
 *
 * Runs the implementation loop, retrying on test failures up to maxRetries times.
 * Includes no-change detection to exit early if the agent makes no progress.
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

  let attemptNumber = 0;
  let lastVerification: { passed: boolean; failures: number; testsOutput: string; buildOutput: string; timestamp: string } | null = null;
  let lastDiffHash = ''; // Initialize to empty string, will capture after first failure
  const attemptHistory: AttemptHistoryEntry[] = [];

  while (attemptNumber <= maxRetries) {
    attemptNumber++;

    let prompt = `Implement this story based on the plan:

Title: ${story.frontmatter.title}

Story content:
${story.content}`;

    if (reworkContext) {
      prompt += `

---
${reworkContext}
---

IMPORTANT: This is a refinement iteration. The previous implementation did not pass review.
You MUST fix all the issues listed above. Pay special attention to blocker and critical
severity issues - these must be resolved. Review the specific feedback and make targeted fixes.`;
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
2. Make necessary code changes
3. Write tests if applicable
4. Verify the changes work

Use the available tools to read files, write code, and run commands as needed.`;
    }

    // Send progress callback for all attempts (not just retries)
    if (onProgress) {
      if (attemptNumber === 1) {
        onProgress({ type: 'assistant_message', content: `Starting implementation attempt 1/${maxRetries + 1}...` });
      } else {
        onProgress({ type: 'assistant_message', content: `Analyzing test failures, retrying implementation (${attemptNumber - 1}/${maxRetries})...` });
      }
    }

    const implementationResult = await runAgentQuery({
      prompt,
      systemPrompt: IMPLEMENTATION_SYSTEM_PROMPT,
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
      // Success! Reset retry count and return success
      await resetImplementationRetryCount(updatedStory);
      changesMade.push('Verification passed - implementation successful');

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

    // Track retry attempt
    await incrementImplementationRetryCount(updatedStory);

    // Increment global recovery counter
    await incrementTotalRecoveryAttempts(updatedStory);

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
    const outcome: AttemptOutcome = hasBuildErrors ? 'failed_build' : 'failed_tests';

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
    if (attemptNumber > 1) {
      changesMade.push(`Implementation retry ${attemptNumber - 1}/${maxRetries}: ${verification.failures} test(s) failing`);
    } else {
      changesMade.push(`Attempt ${attemptNumber}: ${verification.failures} test(s) failing`);
    }

    // Check if we've reached max retries
    if (attemptHistory.length > maxRetries) {
      const attemptSummary = attemptHistory
        .map((a) => {
          const parts = [];
          if (a.testFailures > 0) {
            parts.push(`${a.testFailures} test(s)`);
          }
          if (a.buildFailures > 0) {
            parts.push(`${a.buildFailures} build error(s)`);
          }
          const errors = parts.length > 0 ? parts.join(', ') : 'verification failed';

          const snippets = [];
          if (a.testSnippet && a.testSnippet.trim()) {
            snippets.push(`[test: ${a.testSnippet}]`);
          }
          if (a.buildSnippet && a.buildSnippet.trim()) {
            snippets.push(`[build: ${a.buildSnippet}]`);
          }
          const snippetText = snippets.length > 0 ? ` - ${snippets.join(' ')}` : '';

          return `  Attempt ${a.attempt}: ${errors}${snippetText}`;
        })
        .join('\n');

      return {
        success: false,
        story: parseStory(storyPath),
        changesMade,
        error: `Implementation blocked after ${attemptNumber} attempts:\n${attemptSummary}\n\nLast test output:\n${truncateTestOutput(verification.testsOutput, 5000)}`,
      };
    }

    // Continue to next retry attempt - send progress update
    if (onProgress) {
      onProgress({ type: 'assistant_message', content: `Retry ${attemptNumber} failed: ${verification.failures} test(s) failing, attempting retry ${attemptNumber + 1}...` });
    }
  }

  // If we exit the loop without returning, all retries exhausted (shouldn't normally reach here)
  return {
    success: false,
    story: parseStory(storyPath),
    changesMade,
    error: 'Implementation failed: All retry attempts exhausted without resolution.',
  };
}

/**
 * Implementation Agent
 *
 * Executes the implementation plan, creating code changes and tests.
 */
export async function runImplementationAgent(
  storyPath: string,
  sdlcRoot: string,
  options: AgentOptions = {}
): Promise<AgentResult> {
  const logger = getLogger();
  const startTime = Date.now();
  let story = parseStory(storyPath);
  let currentStoryPath = storyPath;
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);

  logger.info('implementation', 'Starting implementation phase', {
    storyId: story.frontmatter.id,
    retryCount: story.frontmatter.implementation_retry_count || 0,
  });

  try {
    // Security: Validate working directory before git operations
    validateWorkingDir(workingDir);

    // Create a feature branch for this story
    const branchName = `ai-sdlc/${story.slug}`;

    // Security: Validate branch name before use
    validateBranchName(branchName);

    try {
      // Check if we're in a git repo using spawn with shell: false
      const revParseResult = spawnSync('git', ['rev-parse', '--git-dir'], {
        cwd: workingDir,
        shell: false,
        stdio: 'pipe',
      });

      if (revParseResult.status !== 0) {
        changesMade.push('No git repo detected, skipping branch creation');
      } else {
        // Create and checkout branch (or checkout if exists) using spawn with shell: false
        const checkoutNewResult = spawnSync('git', ['checkout', '-b', branchName], {
          cwd: workingDir,
          shell: false,
          stdio: 'pipe',
        });

        if (checkoutNewResult.status === 0) {
          changesMade.push(`Created branch: ${branchName}`);
        } else {
          // Branch might already exist, try to checkout
          const checkoutResult = spawnSync('git', ['checkout', branchName], {
            cwd: workingDir,
            shell: false,
            stdio: 'pipe',
          });

          if (checkoutResult.status === 0) {
            changesMade.push(`Checked out existing branch: ${branchName}`);
          } else {
            // Not a git repo or other error, continue without branching
            changesMade.push('Failed to create or checkout branch, continuing without branching');
          }
        }

        // Update story with branch info
        await updateStoryField(story, 'branch', branchName);
      }
    } catch {
      // Not a git repo, continue without branching
      changesMade.push('No git repo detected, skipping branch creation');
    }

    // Update status to in-progress if not already there
    if (story.frontmatter.status !== 'in-progress') {
      story = await updateStoryStatus(story, 'in-progress');
      currentStoryPath = story.path;
      changesMade.push('Updated status to in-progress');
    }

    // Check if TDD is enabled for this story
    const config = loadConfig(workingDir);
    const tddEnabled = story.frontmatter.tdd_enabled ?? config.tdd?.enabled ?? false;

    // Check if orchestrator is enabled
    if (config.useOrchestrator && !tddEnabled) {
      changesMade.push('Using sequential task orchestrator for implementation');

      const { runImplementationOrchestrator } = await import('./orchestrator.js');

      const orchestratorResult = await runImplementationOrchestrator(
        currentStoryPath,
        sdlcRoot,
        {
          maxRetriesPerTask: config.implementation.maxRetries,
          commitAfterEachTask: true,
          stopOnFirstFailure: true,
        }
      );

      if (!orchestratorResult.success) {
        // Orchestration failed
        const errorDetails = orchestratorResult.failedTasks
          .map((ft) => `  - ${ft.taskId}: ${ft.error} (${ft.attempts} attempts)`)
          .join('\n');

        return {
          success: false,
          story: parseStory(currentStoryPath),
          changesMade,
          error: `Implementation orchestration failed:\n${errorDetails}\n\nCompleted: ${orchestratorResult.tasksCompleted}, Failed: ${orchestratorResult.tasksFailed}, Remaining: ${orchestratorResult.tasksRemaining}`,
        };
      }

      // Orchestration succeeded - mark implementation complete
      await updateStoryField(story, 'implementation_complete', true);
      changesMade.push('Marked implementation_complete: true');
      changesMade.push(
        `Orchestration complete: ${orchestratorResult.tasksCompleted} tasks completed in ${orchestratorResult.totalAgentInvocations} agent invocations`
      );

      return {
        success: true,
        story: parseStory(currentStoryPath),
        changesMade,
      };
    }

    if (tddEnabled) {
      changesMade.push('TDD mode enabled - using Red-Green-Refactor implementation');

      // Run TDD implementation loop
      const tddResult = await runTDDImplementation(story, sdlcRoot, {
        onProgress: options.onProgress,
      });

      // Merge changes
      changesMade.push(...tddResult.changesMade);

      if (tddResult.success) {
        // TDD completed all cycles - now verify with retry support
        changesMade.push('Running final verification...');
        const verification = await verifyImplementation(tddResult.story, workingDir);

        await updateStoryField(tddResult.story, 'last_test_run', {
          passed: verification.passed,
          failures: verification.failures,
          timestamp: verification.timestamp,
        });

        if (!verification.passed) {
          // TDD final verification failed - this is unexpected since TDD should ensure all tests pass
          // Reset retry count since this is the first failure at this stage
          await resetImplementationRetryCount(tddResult.story);

          return {
            success: false,
            story: parseStory(currentStoryPath),
            changesMade,
            error: `TDD implementation blocked: ${verification.failures} test(s) failing after completing all cycles.\nThis is unexpected - TDD cycles should ensure all tests pass.\n\nTest output:\n${truncateTestOutput(verification.testsOutput, 1000)}`,
          };
        }

        // Success - reset retry count
        await resetImplementationRetryCount(tddResult.story);

        await updateStoryField(tddResult.story, 'implementation_complete', true);
        changesMade.push('Marked implementation_complete: true');

        return {
          success: true,
          story: parseStory(currentStoryPath),
          changesMade,
        };
      } else {
        return {
          success: false,
          story: tddResult.story,
          changesMade,
          error: tddResult.error,
        };
      }
    }

    // Standard implementation (non-TDD mode) with retry logic
    // Use per-story override if set, otherwise config default (capped at upper bound)
    const maxRetries = getEffectiveMaxImplementationRetries(story, config);

    // Use extracted retry function for better testability
    const retryResult = await attemptImplementationWithRetries(
      {
        story,
        storyPath: currentStoryPath,
        workingDir,
        maxRetries,
        reworkContext: options.reworkContext,
        onProgress: options.onProgress,
      },
      changesMade
    );

    // If retry loop failed, return the failure result
    if (!retryResult.success) {
      return retryResult;
    }

    // If we get here, verification passed
    const updatedStory = parseStory(currentStoryPath);

    // Commit changes after successful standard implementation
    try {
      const commitResult = await commitIfAllTestsPass(
        workingDir,
        `feat(${story.slug}): ${story.frontmatter.title}`,
        config.timeouts?.testTimeout || 300000
      );
      if (commitResult.committed) {
        changesMade.push(`Committed: ${story.frontmatter.title}`);
      } else {
        changesMade.push(`Skipped commit: ${commitResult.reason}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      changesMade.push(`Commit warning: ${errorMsg} (continuing implementation)`);
    }

    await updateStoryField(updatedStory, 'implementation_complete', true);
    changesMade.push('Marked implementation_complete: true');

    logger.info('implementation', 'Implementation phase complete', {
      storyId: story.frontmatter.id,
      durationMs: Date.now() - startTime,
      changesCount: changesMade.length,
    });

    return {
      success: true,
      story: parseStory(currentStoryPath),
      changesMade,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('implementation', 'Implementation phase failed', {
      storyId: story.frontmatter.id,
      durationMs: Date.now() - startTime,
      error: errorMessage,
    });

    return {
      success: false,
      story,
      changesMade,
      error: errorMessage,
    };
  }
}

/**
 * Validate working directory path for safety
 * @param workingDir The working directory path to validate
 * @throws Error if path contains shell metacharacters or traversal attempts
 */
function validateWorkingDir(workingDir: string): void {
  // Check for shell metacharacters that could be used in command injection
  if (/[;&|`$()<>]/.test(workingDir)) {
    throw new Error('Invalid working directory: contains shell metacharacters');
  }

  // Prevent path traversal attempts
  const normalizedPath = path.normalize(workingDir);
  if (normalizedPath.includes('..')) {
    throw new Error('Invalid working directory: path traversal attempt detected');
  }
}

/**
 * Validate branch name for safety
 * @param branchName The branch name to validate
 * @throws Error if branch name contains invalid characters
 */
function validateBranchName(branchName: string): void {
  // Git branch names must match safe pattern (alphanumeric, dash, slash, underscore)
  if (!/^[a-zA-Z0-9_/-]+$/.test(branchName)) {
    throw new Error('Invalid branch name: contains unsafe characters');
  }
}

/**
 * Capture the current git diff hash for no-change detection
 * @param workingDir The working directory
 * @returns SHA256 hash of git diff HEAD
 */
export function captureCurrentDiffHash(workingDir: string): string {
  try {
    // Security: Validate working directory before use
    validateWorkingDir(workingDir);

    // Use spawnSync with shell: false to prevent command injection
    const result = spawnSync('git', ['diff', 'HEAD'], {
      cwd: workingDir,
      shell: false,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status === 0 && result.stdout) {
      return createHash('sha256').update(result.stdout as string).digest('hex');
    }

    // Git command failed, return empty hash
    return '';
  } catch (error) {
    // If validation fails or git command fails, return empty hash
    return '';
  }
}

/**
 * Check if changes have occurred since last diff hash
 * @param previousHash Previous diff hash
 * @param currentHash Current diff hash
 * @returns True if changes occurred (hashes are different)
 */
export function hasChangesOccurred(previousHash: string, currentHash: string): boolean {
  return previousHash !== currentHash;
}

/**
 * Extract list of changed files from git diff
 * @param workingDir The working directory
 * @returns Comma-separated list of changed files, or descriptive message
 */
export function extractChangedFiles(workingDir: string): string {
  try {
    validateWorkingDir(workingDir);

    const result = spawnSync('git', ['diff', 'HEAD', '--name-only'], {
      cwd: workingDir,
      shell: false,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status === 0 && result.stdout) {
      const files = (result.stdout as string).trim().split('\n').filter(Boolean);
      if (files.length === 0) {
        return 'No changes detected';
      }
      return files.join(', ');
    }

    return 'No changes detected';
  } catch {
    return 'Unable to determine changes';
  }
}

/**
 * Build formatted retry history section for agent prompts
 * @param history Array of attempt history entries
 * @returns Formatted string for inclusion in retry prompts
 */
export function buildRetryHistorySection(history: AttemptHistoryEntry[]): string {
  if (!history || history.length === 0) {
    return '';
  }

  const recentHistory = history.slice(-3);

  let section = `PREVIOUS ATTEMPT HISTORY (Last ${recentHistory.length} attempts):

`;

  for (const entry of recentHistory) {
    const outcomeLabel =
      entry.outcome === 'failed_tests'
        ? 'Tests failed'
        : entry.outcome === 'failed_build'
          ? 'Build failed'
          : 'No changes made';

    section += `Attempt ${entry.attempt}: ${entry.changesSummary} -> ${outcomeLabel}\n`;

    const errors: string[] = [];
    if (entry.testSnippet && entry.testSnippet.trim()) {
      errors.push(entry.testSnippet.trim());
    }
    if (entry.buildSnippet && entry.buildSnippet.trim()) {
      errors.push(entry.buildSnippet.trim());
    }

    const errorsToShow = errors.slice(0, 2);
    if (errorsToShow.length > 0) {
      for (const err of errorsToShow) {
        section += `  - ${err.substring(0, 100)}\n`;
      }
    }
  }

  section += `
**IMPORTANT: Do NOT repeat the same fixes. Try a different approach.**
`;

  return section;
}

/**
 * Sanitize test output to remove ANSI escape sequences and potential injection patterns
 * @param output Test output string
 * @returns Sanitized output
 */
export function sanitizeTestOutput(output: string): string {
  if (!output) return '';

  let sanitized = output
    // Remove ANSI CSI sequences (SGR parameters - colors, styles)
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    // Remove ANSI DCS sequences (Device Control String)
    .replace(/\x1BP[^\x1B]*\x1B\\/g, '')
    // Remove ANSI PM sequences (Privacy Message)
    .replace(/\x1B\^[^\x1B]*\x1B\\/g, '')
    // Remove ANSI OSC sequences (Operating System Command) - terminated by BEL or ST
    .replace(/\x1B\][^\x07\x1B]*(\x07|\x1B\\)/g, '')
    // Remove any remaining standalone escape characters
    .replace(/\x1B/g, '')
    // Remove other control characters except newline, tab, carriage return
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');

  return sanitized;
}

/**
 * Truncate test output to prevent overwhelming the LLM
 * @param output Test output string
 * @param maxLength Maximum length (default 5000 chars)
 * @returns Truncated and sanitized output with notice if truncated
 */
export function truncateTestOutput(output: string, maxLength: number = 5000): string {
  if (!output) return '';

  // First sanitize to remove ANSI and control characters
  const sanitized = sanitizeTestOutput(output);

  if (sanitized.length <= maxLength) {
    return sanitized;
  }

  const truncated = sanitized.substring(0, maxLength);
  return truncated + `\n\n[Output truncated. Showing first ${maxLength} characters of ${sanitized.length} total.]`;
}

/**
 * Detect if errors are related to missing dependencies
 * Returns module names that are missing, if any
 */
export function detectMissingDependencies(output: string): string[] {
  if (!output) return [];

  const missingModules: string[] = [];

  // Pattern: Cannot find module 'package-name'
  const cannotFindPattern = /Cannot find module ['"]([^'"]+)['"]/g;
  let match;
  while ((match = cannotFindPattern.exec(output)) !== null) {
    const moduleName = match[1];
    // Only include external packages, not relative imports
    if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
      // Extract base package name (handle scoped packages like @types/foo)
      const baseName = moduleName.startsWith('@')
        ? moduleName.split('/').slice(0, 2).join('/')
        : moduleName.split('/')[0];
      if (!missingModules.includes(baseName)) {
        missingModules.push(baseName);
      }
    }
  }

  // Pattern: Module not found: Error: Can't resolve 'package-name'
  const cantResolvePattern = /(?:Module not found|Can't resolve)[:\s]+['"]([^'"]+)['"]/g;
  while ((match = cantResolvePattern.exec(output)) !== null) {
    const moduleName = match[1];
    if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
      const baseName = moduleName.startsWith('@')
        ? moduleName.split('/').slice(0, 2).join('/')
        : moduleName.split('/')[0];
      if (!missingModules.includes(baseName)) {
        missingModules.push(baseName);
      }
    }
  }

  return missingModules;
}

/**
 * Build retry prompt for implementation agent
 * @param testOutput Test failure output
 * @param buildOutput Build output
 * @param attemptNumber Current attempt number (1-indexed)
 * @param maxRetries Maximum number of retries
 * @param attemptHistory Optional history of previous attempts
 * @returns Prompt string for retry attempt
 */
export function buildRetryPrompt(
  testOutput: string,
  buildOutput: string,
  attemptNumber: number,
  maxRetries: number,
  attemptHistory?: AttemptHistoryEntry[]
): string {
  const truncatedTestOutput = truncateTestOutput(testOutput);
  const truncatedBuildOutput = truncateTestOutput(buildOutput);

  // Detect if this is a dependency issue
  const combinedOutput = (buildOutput || '') + '\n' + (testOutput || '');
  const missingDeps = detectMissingDependencies(combinedOutput);

  // Parse and classify TypeScript errors from build output
  const tsErrors = parseTypeScriptErrors(buildOutput || '');
  const classified = classifyAndSortErrors(tsErrors);

  let prompt = `CRITICAL: Tests are failing. You attempted implementation but verification failed.

This is retry attempt ${attemptNumber} of ${maxRetries}. Previous attempts failed with similar errors.

`;

  // Add special guidance for missing dependencies
  if (missingDeps.length > 0) {
    prompt += `**DEPENDENCY ISSUE DETECTED**

The errors indicate missing npm packages: ${missingDeps.join(', ')}

This is NOT a code bug - the packages need to be installed. Before making any code changes:
1. Run \`npm install ${missingDeps.join(' ')}\` to add the missing packages
2. If these are type definitions, also run \`npm install -D @types/${missingDeps.filter(d => !d.startsWith('@')).join(' @types/')}\`
3. Re-run the build/tests after installing

`;
  }

  // Add TypeScript error classification if errors were found
  if (classified.source.length > 0 || classified.cascading.length > 0) {
    prompt += `TYPESCRIPT ERROR CLASSIFICATION

`;

    if (classified.source.length > 0) {
      prompt += `⚠️ SOURCE ERRORS (Fix these first - root causes):

`;
      classified.source.forEach((err) => {
        const location = err.line ? `${err.filePath}:${err.line}` : err.filePath;
        prompt += `- ${err.code} in ${location}: ${err.message}\n`;
      });
      prompt += '\n';
    }

    if (classified.cascading.length > 0) {
      prompt += `💡 CASCADING ERRORS (may automatically resolve):

`;
      classified.cascading.forEach((err) => {
        const location = err.line ? `${err.filePath}:${err.line}` : err.filePath;
        prompt += `- ${err.code} in ${location}: ${err.message}\n`;
      });
      prompt += '\n';
    }

    prompt += `**Strategy:** Fix source errors first, as they may automatically resolve multiple cascading errors.

`;
  }

  if (attemptHistory && attemptHistory.length > 0) {
    prompt += buildRetryHistorySection(attemptHistory);
    prompt += '\n';
  }

  if (buildOutput && buildOutput.trim().length > 0) {
    prompt += `Build Output:
\`\`\`
${truncatedBuildOutput}
\`\`\`

`;
  }

  if (testOutput && testOutput.trim().length > 0) {
    prompt += `Test Output:
\`\`\`
${truncatedTestOutput}
\`\`\`

`;
  }

  prompt += `Your task:
1. ANALYZE the test/build output above - what is actually failing?
2. Compare EXPECTED vs ACTUAL results in the errors
3. Identify the root cause in your implementation code
4. Fix ONLY the production code (do NOT modify tests unless they're clearly wrong)
5. Re-run verification

Focus on fixing the specific failures shown above.`;

  return prompt;
}
