import { execSync, spawn } from 'child_process';
import path from 'path';
import { parseStory, writeStory, moveStory, updateStoryField } from '../core/story.js';
import { runAgentQuery, AgentProgressCallback } from '../core/client.js';
import { Story, AgentResult, TDDTestCycle, TDDConfig } from '../types/index.js';
import { AgentOptions } from './research.js';
import { loadConfig, DEFAULT_TDD_CONFIG } from '../core/config.js';

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
8. Do NOT commit changes - that happens in the review phase

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

    // Record the completed cycle
    const cycle = recordTDDCycle(cycleNumber, redResult, greenResult, refactorResult);

    // Update story with cycle history
    const history = story.frontmatter.tdd_test_history || [];
    history.push(cycle);
    // Trim to last 100 cycles to prevent unbounded growth
    story.frontmatter.tdd_test_history = history.slice(-100);
    story.frontmatter.tdd_current_test = cycle;

    // Persist the TDD cycle history to disk
    writeStory(story);

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
 * Implementation Agent
 *
 * Executes the implementation plan, creating code changes and tests.
 */
export async function runImplementationAgent(
  storyPath: string,
  sdlcRoot: string,
  options: AgentOptions = {}
): Promise<AgentResult> {
  let story = parseStory(storyPath);
  let currentStoryPath = storyPath;
  const changesMade: string[] = [];
  const workingDir = path.dirname(sdlcRoot);

  try {
    // Create a feature branch for this story
    const branchName = `ai-sdlc/${story.slug}`;

    try {
      // Check if we're in a git repo
      execSync('git rev-parse --git-dir', { cwd: workingDir, stdio: 'pipe' });

      // Create and checkout branch (or checkout if exists)
      try {
        execSync(`git checkout -b ${branchName}`, { cwd: workingDir, stdio: 'pipe' });
        changesMade.push(`Created branch: ${branchName}`);
      } catch {
        // Branch might already exist
        try {
          execSync(`git checkout ${branchName}`, { cwd: workingDir, stdio: 'pipe' });
          changesMade.push(`Checked out existing branch: ${branchName}`);
        } catch {
          // Not a git repo or other error, continue without branching
        }
      }

      // Update story with branch info
      updateStoryField(story, 'branch', branchName);
    } catch {
      // Not a git repo, continue without branching
      changesMade.push('No git repo detected, skipping branch creation');
    }

    // Move story to in-progress if not already there
    if (story.frontmatter.status !== 'in-progress') {
      story = moveStory(story, 'in-progress', sdlcRoot);
      currentStoryPath = story.path;
      changesMade.push('Moved story to in-progress/');
    }

    // Check if TDD is enabled for this story
    const config = loadConfig(workingDir);
    const tddEnabled = story.frontmatter.tdd_enabled ?? config.tdd?.enabled ?? false;

    if (tddEnabled) {
      changesMade.push('TDD mode enabled - using Red-Green-Refactor implementation');

      // Run TDD implementation loop
      const tddResult = await runTDDImplementation(story, sdlcRoot, {
        onProgress: options.onProgress,
      });

      // Merge changes
      changesMade.push(...tddResult.changesMade);

      if (tddResult.success) {
        // Mark implementation as complete
        updateStoryField(tddResult.story, 'implementation_complete', true);
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

    // Standard implementation (non-TDD mode)
    let prompt = `Implement this story based on the plan:

Title: ${story.frontmatter.title}

Story content:
${story.content}`;

    if (options.reworkContext) {
      prompt += `

---
${options.reworkContext}
---

IMPORTANT: This is a refinement iteration. The previous implementation did not pass review.
You MUST fix all the issues listed above. Pay special attention to blocker and critical
severity issues - these must be resolved. Review the specific feedback and make targeted fixes.`;
    }

    prompt += `

Execute the implementation plan. For each task:
1. Read relevant existing files
2. Make necessary code changes
3. Write tests if applicable
4. Verify the changes work

Use the available tools to read files, write code, and run commands as needed.`;

    const implementationResult = await runAgentQuery({
      prompt,
      systemPrompt: IMPLEMENTATION_SYSTEM_PROMPT,
      workingDirectory: workingDir,
      onProgress: options.onProgress,
    });

    // Add implementation notes to the story
    const implementationNotes = `
### Implementation Notes (${new Date().toISOString().split('T')[0]})

${implementationResult}
`;

    // Append to story content
    const updatedStory = parseStory(currentStoryPath);
    updatedStory.content += '\n\n' + implementationNotes;
    writeStory(updatedStory);
    changesMade.push('Added implementation notes');

    // Mark implementation as complete
    updateStoryField(updatedStory, 'implementation_complete', true);
    changesMade.push('Marked implementation_complete: true');

    return {
      success: true,
      story: parseStory(currentStoryPath),
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
