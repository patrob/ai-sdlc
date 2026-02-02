import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createStory, updateStoryStatus, appendReviewHistory, parseStory, writeStory } from '../../src/core/story.js';
import { assessState } from '../../src/core/kanban.js';
import { runReworkAgent } from '../../src/agents/rework.js';
import { runReviewAgent } from '../../src/agents/review.js';
import { ReviewDecision, ReviewSeverity, ReviewResult, STORIES_FOLDER } from '../../src/types/index.js';
import { spawn, spawnSync } from 'child_process';

// Mock child_process for test execution simulation
vi.mock('child_process');
// Mock client for LLM calls
vi.mock('../../src/core/client.js', () => ({
  runAgentQuery: vi.fn(),
}));

/**
 * Helper to create a spawnSync mock return value that simulates git diff output
 * This is needed because runReviewAgent calls getSourceCodeChanges and hasTestFiles
 * which use spawnSync to check git status before running build/tests.
 */
function mockSpawnSyncWithFiles(files: string[]) {
  return {
    status: 0,
    stdout: Buffer.from(files.join('\n') + '\n'),
    stderr: Buffer.from(''),
    output: [],
    pid: 1,
    signal: null,
  } as any;
}

describe.sequential('Refinement Loop Integration', () => {
  let testDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-'));
    sdlcRoot = path.join(testDir, '.ai-sdlc');

    // Create SDLC folder structure
    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER), { recursive: true });

    // Create default config
    const config = {
      sdlcFolder: '.ai-sdlc',
      refinement: {
        maxIterations: 3,
        escalateOnMaxAttempts: 'manual',
        enableCircuitBreaker: true,
      },
      reviewConfig: {
        maxRetries: 3,
        maxRetriesUpperBound: 10,
        autoCompleteOnApproval: true,
        autoRestartOnRejection: true,
      },
      stageGates: {
        requireApprovalBeforeImplementation: false,
        requireApprovalBeforePR: false,
        autoMergeOnApproval: false,
      },
      defaultLabels: [],
      theme: 'auto',
    };
    fs.writeFileSync(
      path.join(testDir, '.ai-sdlc.json'),
      JSON.stringify(config, null, 2)
    );
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should complete full refinement loop: fail → rework → implement → pass', async () => {
    // Step 1: Create story and move to in-progress
    let story = await createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      labels: ['test'],
    });
    story = await updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;

    // Step 2: Add failed review
    // Note: Single blocker stays in 'implement' phase; 2+ blockers triggers 'plan' phase
    await appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Missing error handling',
      blockers: ['No error handling'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    // Step 3: Assess state - should generate rework action
    let assessment = await assessState(sdlcRoot);
    let reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    expect(reworkAction).toBeDefined();
    expect(reworkAction!.context.iteration).toBe(1);
    expect(reworkAction!.context.targetPhase).toBe('implement');

    // Step 4: Execute rework agent
    const mockReviewResult: ReviewResult = {
      success: true,
      passed: false,
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      reviewType: 'combined',
      issues: [
        {
          severity: 'blocker',
          category: 'code_quality',
          description: 'No error handling',
        },
      ],
      feedback: 'Missing error handling',
      story,
      changesMade: [],
    };

    const reworkResult = await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback: mockReviewResult,
      targetPhase: 'implement',
      iteration: 1,
    });

    expect(reworkResult.success).toBe(true);

    // Step 5: Verify story state after rework
    story = parseStory(story.path);
    expect(story.frontmatter.refinement_count).toBe(1);
    expect(story.frontmatter.implementation_complete).toBe(false); // Reset for rework
    expect(story.content).toContain('Refinement Iteration 1');

    // Step 6: Simulate implementation complete again
    story.frontmatter.implementation_complete = true;

    // Step 7: Add passing review
    await appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.APPROVED,
      feedback: 'All issues resolved',
      blockers: [],
      codeReviewPassed: true,
      securityReviewPassed: true,
      poReviewPassed: true,
    });

    // Mark reviews complete after approval
    story.frontmatter.reviews_complete = true;
    await writeStory(story);

    // Step 8: Assess state - should generate create_pr action, not rework
    assessment = await assessState(sdlcRoot);
    reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    const prAction = assessment.recommendedActions.find(a => a.type === 'create_pr');

    expect(reworkAction).toBeUndefined();
    expect(prAction).toBeDefined();
  });

  it('should escalate after multiple failed refinement iterations', async () => {
    // Create story and move to in-progress
    let story = await createStory('Difficult Feature', sdlcRoot);
    story = await updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;

    // Iteration 1: First failure
    await appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Security issues',
      blockers: ['SQL injection'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    let assessment = await assessState(sdlcRoot);
    let reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    expect(reworkAction).toBeDefined();

    // Execute rework iteration 1
    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback: {
        issues: [{ severity: 'blocker', category: 'security', description: 'SQL injection' }],
      } as any,
      targetPhase: 'implement',
      iteration: 1,
    });

    story = parseStory(story.path);
    story.frontmatter.implementation_complete = true;

    // Iteration 2: Second failure
    await appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.CRITICAL,
      feedback: 'Still vulnerable',
      blockers: ['SQL injection still present'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    assessment = await assessState(sdlcRoot);
    reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    expect(reworkAction).toBeDefined();
    expect(reworkAction!.context.iteration).toBe(2);

    // Execute rework iteration 2
    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback: {
        issues: [{ severity: 'blocker', category: 'security', description: 'Still vulnerable' }],
      } as any,
      targetPhase: 'implement',
      iteration: 2,
    });

    story = parseStory(story.path);
    story.frontmatter.implementation_complete = true;

    // Iteration 3: Third failure
    await appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.CRITICAL,
      feedback: 'Issue persists',
      blockers: ['Same SQL injection'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    assessment = await assessState(sdlcRoot);
    reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    expect(reworkAction).toBeDefined();
    expect(reworkAction!.context.iteration).toBe(3);

    // Execute rework iteration 3
    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback: {
        issues: [{ severity: 'blocker', category: 'security', description: 'Same issue' }],
      } as any,
      targetPhase: 'implement',
      iteration: 3,
    });

    story = parseStory(story.path);
    story.frontmatter.implementation_complete = true;

    // Fourth failure: Should trigger circuit breaker
    await appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.CRITICAL,
      feedback: 'Cannot fix',
      blockers: ['Unfixable'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    await assessState(sdlcRoot);

    // Re-parse story to see updated status after assessState
    story = parseStory(story.path);

    // No more rework - story should be blocked
    expect(story.frontmatter.status).toBe('blocked');
    expect(story.frontmatter.blocked_reason).toContain('Max refinement attempts');
  });

  it('should track refinement history across multiple iterations', async () => {
    let story = await createStory('Test Story', sdlcRoot);
    story = await updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;

    // First refinement
    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback: {
        issues: [{ severity: 'major', category: 'code', description: 'Issue 1' }],
        feedback: 'Feedback 1',
      } as any,
      targetPhase: 'implement',
      iteration: 1,
    });

    story = parseStory(story.path);
    expect(story.frontmatter.refinement_iterations).toHaveLength(1);
    expect(story.frontmatter.refinement_iterations![0].iteration).toBe(1);

    // Second refinement
    story.frontmatter.implementation_complete = true;
    await runReworkAgent(story.path, sdlcRoot, {
      reviewFeedback: {
        issues: [{ severity: 'major', category: 'code', description: 'Issue 2' }],
        feedback: 'Feedback 2',
      } as any,
      targetPhase: 'implement',
      iteration: 2,
    });

    story = parseStory(story.path);
    expect(story.frontmatter.refinement_iterations).toHaveLength(2);
    expect(story.frontmatter.refinement_iterations![1].iteration).toBe(2);
    expect(story.frontmatter.refinement_count).toBe(2);

    // Verify content has both iteration notes
    expect(story.content).toContain('Refinement Iteration 1');
    expect(story.content).toContain('Refinement Iteration 2');
  });
});

describe.sequential('Review Agent Pre-check Integration', () => {
  let testDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-precheck-test-'));
    sdlcRoot = path.join(testDir, '.ai-sdlc');

    // Create SDLC folder structure
    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER), { recursive: true });

    // Create default config with test/build commands
    const config = {
      sdlcFolder: '.ai-sdlc',
      testCommand: 'npm test',
      buildCommand: 'npm run build',
      refinement: {
        maxIterations: 3,
        escalateOnMaxAttempts: 'manual',
        enableCircuitBreaker: true,
      },
      reviewConfig: {
        maxRetries: 3,
        maxRetriesUpperBound: 10,
        autoCompleteOnApproval: true,
        autoRestartOnRejection: true,
      },
      stageGates: {
        requireApprovalBeforeImplementation: false,
        requireApprovalBeforePR: false,
        autoMergeOnApproval: false,
      },
      defaultLabels: [],
      theme: 'auto',
      timeouts: {
        agentTimeout: 600000,
        buildTimeout: 120000,
        testTimeout: 300000,
      },
    };
    fs.writeFileSync(
      path.join(testDir, '.ai-sdlc.json'),
      JSON.stringify(config, null, 2)
    );

    // Reset mocks for test isolation (S-0110)
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
    // Restore all mocks to prevent leakage between tests (S-0110)
    vi.restoreAllMocks();
  });

  it('should block review and skip LLM calls when tests fail', async () => {
    // Setup: Create a story with completed implementation
    let story = await createStory('Feature with Failing Tests', sdlcRoot);
    story = await updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;

    // Mock spawnSync for pre-checks (getSourceCodeChanges and hasTestFiles)
    vi.mocked(spawnSync).mockReturnValue(mockSpawnSyncWithFiles([
      'src/example.ts',
      'src/example.test.ts',
    ]));

    // Mock spawn to simulate failed test execution (S-0110: use process.nextTick for immediate callbacks)
    const mockSpawn = vi.mocked(spawn);
    mockSpawn.mockImplementation(((command: string, args: string[]) => {
      const isTest = args.includes('test');
      const mockProcess: any = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            // Use process.nextTick for immediate, deterministic callback (S-0110)
            const exitCode = isTest ? 1 : 0;
            process.nextTick(() => callback(exitCode));
          }
        }),
      };

      // Simulate test failure output using process.nextTick for determinism (S-0110)
      process.nextTick(() => {
        if (isTest) {
          const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stdoutCallback) {
            stdoutCallback(Buffer.from('FAIL src/example.test.ts\n  ✗ should validate input\n    Expected: true\n    Received: false\n'));
          }
        }
      });

      return mockProcess;
    }) as any);

    // Execute review (S-0110)
    const result = await runReviewAgent(story.path, testDir);

    // Verify: Review blocked with BLOCKER
    expect(result.success).toBe(true); // Agent executed successfully
    expect(result.passed).toBe(false); // Review did not pass
    expect(result.decision).toBe(ReviewDecision.REJECTED);
    expect(result.severity).toBe(ReviewSeverity.CRITICAL);

    // Verify: BLOCKER issue includes test failure details
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('blocker');
    expect(result.issues[0].category).toBe('testing');
    expect(result.issues[0].description).toContain('Tests must pass before code review can proceed');
    expect(result.issues[0].description).toContain('npm test');
    expect(result.issues[0].description).toContain('should validate input');

    // Verify: Early return - changesMade indicates reviews were skipped
    expect(result.changesMade).toContain('Skipping code/security/PO reviews - verification must pass first');

    // Verify: LLM reviews were NOT called (token savings)
    const { runAgentQuery } = await import('../../src/core/client.js');
    expect(runAgentQuery).not.toHaveBeenCalled();
  });

  it('should proceed with reviews when tests pass', async () => {
    // Setup: Create a story with completed implementation
    let story = await createStory('Feature with Passing Tests', sdlcRoot);
    story = await updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;

    // Mock spawnSync for pre-checks (getSourceCodeChanges and hasTestFiles)
    // These are called BEFORE the build/test commands
    vi.mocked(spawnSync).mockReturnValue(mockSpawnSyncWithFiles([
      'src/feature.ts',
      'src/feature.test.ts',
    ]));

    // Mock spawn to simulate successful test execution (S-0110: use process.nextTick)
    const mockSpawn = vi.mocked(spawn);
    mockSpawn.mockImplementation((() => {
      const mockProcess: any = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            process.nextTick(() => callback(0)); // All pass (S-0110)
          }
        }),
      };

      process.nextTick(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('PASS all tests\n  ✓ All tests passed\n'));
        }
      });

      return mockProcess;
    }) as any);

    // Mock LLM to return approval - set up BEFORE calling runReviewAgent
    const { runAgentQuery } = await import('../../src/core/client.js');
    vi.mocked(runAgentQuery).mockResolvedValue('{"passed": true, "issues": []}');

    // Execute review (S-0110)
    const result = await runReviewAgent(story.path, testDir);

    // Verify: Reviews proceeded normally
    expect(result.changesMade).toContain('Verification passed - proceeding with unified collaborative review');
    expect(result.changesMade).toContain('Tests passed: npm test');

    // Verify: LLM review WAS called (1 unified review instead of 3)
    expect(runAgentQuery).toHaveBeenCalledTimes(1);
  });

  it('should truncate large test output in BLOCKER issue', async () => {
    // Setup: Create a story
    let story = await createStory('Feature with Verbose Test Failure', sdlcRoot);
    story = await updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;

    // Mock spawnSync for pre-checks
    vi.mocked(spawnSync).mockReturnValue(mockSpawnSyncWithFiles([
      'src/verbose.ts',
      'src/verbose.test.ts',
    ]));

    // Mock spawn to return very large test output (>10KB)
    const largeOutput = 'FAIL test output\n'.repeat(1000); // ~18KB
    const mockSpawn = vi.mocked(spawn);
    mockSpawn.mockImplementation(((command: string, args: string[]) => {
      const isTestCommand = args.includes('test');

      const mockProcess: any = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            // Build passes, test fails with large output (S-0110: use process.nextTick)
            const exitCode = isTestCommand ? 1 : 0;
            process.nextTick(() => callback(exitCode));
          }
        }),
      };

      process.nextTick(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
        if (stdoutCallback) {
          if (isTestCommand) {
            stdoutCallback(Buffer.from(largeOutput));
          } else {
            stdoutCallback(Buffer.from('Build successful\n'));
          }
        }
      });

      return mockProcess;
    }) as any);

    // Execute review (S-0110)
    const result = await runReviewAgent(story.path, testDir);

    // Verify: Output was truncated
    expect(result.issues[0].description.length).toBeLessThan(largeOutput.length + 500); // Allow overhead for message text
    expect(result.issues[0].description).toContain('(output truncated - showing first 10KB)');
  });

  it('should handle test timeout gracefully', async () => {
    // Setup: Create a story
    let story = await createStory('Feature with Hanging Tests', sdlcRoot);
    story = await updateStoryStatus(story, 'in-progress');
    story.frontmatter.implementation_complete = true;

    // Mock spawnSync for pre-checks
    vi.mocked(spawnSync).mockReturnValue(mockSpawnSyncWithFiles([
      'src/hanging.ts',
      'src/hanging.test.ts',
    ]));

    // Mock spawn to simulate immediate timeout/kill scenario (S-0110: deterministic mock)
    const mockSpawn = vi.mocked(spawn);
    mockSpawn.mockImplementation(((command: string, args: string[]) => {
      const isTestCommand = args.includes('test');

      const mockProcess: any = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            if (isTestCommand) {
              // Simulate a process that completes with error (timeout scenario) (S-0110)
              process.nextTick(() => callback(1));
            } else {
              // Build succeeds immediately (S-0110)
              process.nextTick(() => callback(0));
            }
          }
        }),
        kill: vi.fn(),
      };

      // Add output for build command (S-0110)
      if (!isTestCommand) {
        process.nextTick(() => {
          const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stdoutCallback) {
            stdoutCallback(Buffer.from('Build successful\n'));
          }
        });
      } else {
        // Simulate timeout error message for test command (S-0110)
        process.nextTick(() => {
          const stderrCallback = mockProcess.stderr.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stderrCallback) {
            stderrCallback(Buffer.from('Test timed out\n'));
          }
        });
      }

      return mockProcess;
    }) as any);

    // Execute review (S-0110)
    const result = await runReviewAgent(story.path, testDir);

    // Verify timeout was handled
    expect(result).toBeDefined();
    expect(result.passed).toBe(false);
  });
});
