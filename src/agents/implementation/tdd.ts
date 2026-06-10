/**
 * TDD phase execution and cycling
 */

import path from 'path';

import { type AgentProgressCallback, runAgentQuery } from '../../core/client.js';
import { DEFAULT_TDD_CONFIG,loadConfig } from '../../core/config.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { parseStory, readSectionContent,writeStory } from '../../core/story.js';
import { type AgentResult, type Story, type TDDConfig,type TDDTestCycle } from '../../types/index.js';
import { TDD_SYSTEM_PROMPT } from './prompts.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { truncateTestOutput } from './retry.js';
import { commitIfAllTestsPass,runAllTests, runSingleTest } from './test-runners.js';

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
