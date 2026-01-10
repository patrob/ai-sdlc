import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createStory, moveStory, appendReviewHistory, parseStory, writeStory } from '../../src/core/story.js';
import { assessState } from '../../src/core/kanban.js';
import { runReworkAgent } from '../../src/agents/rework.js';
import { runReviewAgent } from '../../src/agents/review.js';
import { ReviewDecision, ReviewSeverity, ReviewResult } from '../../src/types/index.js';
import { spawn } from 'child_process';

// Mock child_process for test execution simulation
vi.mock('child_process');
// Mock client for LLM calls
vi.mock('../../src/core/client.js', () => ({
  runAgentQuery: vi.fn(),
}));

describe('Refinement Loop Integration', () => {
  let testDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-sdlc-test-'));
    sdlcRoot = path.join(testDir, '.agentic-sdlc');

    // Create SDLC folder structure
    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, 'backlog'));
    fs.mkdirSync(path.join(sdlcRoot, 'ready'));
    fs.mkdirSync(path.join(sdlcRoot, 'in-progress'));
    fs.mkdirSync(path.join(sdlcRoot, 'done'));

    // Create default config
    const config = {
      sdlcFolder: '.agentic-sdlc',
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
      path.join(testDir, '.agentic-sdlc.json'),
      JSON.stringify(config, null, 2)
    );
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should complete full refinement loop: fail → rework → implement → pass', async () => {
    // Step 1: Create story and move to in-progress
    let story = createStory('Test Feature', sdlcRoot, {
      type: 'feature',
      labels: ['test'],
    });
    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;

    // Step 2: Add failed review
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Missing error handling and input validation',
      blockers: ['No error handling', 'No input validation'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    // Step 3: Assess state - should generate rework action
    let assessment = assessState(sdlcRoot);
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
          category: 'security',
          description: 'No input validation',
        },
        {
          severity: 'critical',
          category: 'code_quality',
          description: 'No error handling',
        },
      ],
      feedback: 'Missing error handling and input validation',
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
    appendReviewHistory(story, {
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
    writeStory(story);

    // Step 8: Assess state - should generate create_pr action, not rework
    assessment = assessState(sdlcRoot);
    reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    const prAction = assessment.recommendedActions.find(a => a.type === 'create_pr');

    expect(reworkAction).toBeUndefined();
    expect(prAction).toBeDefined();
  });

  it('should escalate after multiple failed refinement iterations', async () => {
    // Create story and move to in-progress
    let story = createStory('Difficult Feature', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;

    // Iteration 1: First failure
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.HIGH,
      feedback: 'Security issues',
      blockers: ['SQL injection'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    let assessment = assessState(sdlcRoot);
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
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.CRITICAL,
      feedback: 'Still vulnerable',
      blockers: ['SQL injection still present'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    assessment = assessState(sdlcRoot);
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
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.CRITICAL,
      feedback: 'Issue persists',
      blockers: ['Same SQL injection'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: true,
    });

    assessment = assessState(sdlcRoot);
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
    appendReviewHistory(story, {
      timestamp: new Date().toISOString(),
      decision: ReviewDecision.REJECTED,
      severity: ReviewSeverity.CRITICAL,
      feedback: 'Cannot fix',
      blockers: ['Unfixable'],
      codeReviewPassed: false,
      securityReviewPassed: false,
      poReviewPassed: false,
    });

    assessment = assessState(sdlcRoot);
    reworkAction = assessment.recommendedActions.find(a => a.type === 'rework');
    const escalationAction = assessment.recommendedActions.find(
      a => a.context?.blockedByMaxRefinements === true
    );

    expect(reworkAction).toBeUndefined(); // No more rework
    expect(escalationAction).toBeDefined(); // Escalated for manual intervention
    expect(escalationAction!.reason).toContain('max refinement attempts');
  });

  it('should track refinement history across multiple iterations', async () => {
    let story = createStory('Test Story', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);
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

describe('Review Agent Pre-check Integration', () => {
  let testDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-sdlc-precheck-test-'));
    sdlcRoot = path.join(testDir, '.agentic-sdlc');

    // Create SDLC folder structure
    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, 'backlog'));
    fs.mkdirSync(path.join(sdlcRoot, 'ready'));
    fs.mkdirSync(path.join(sdlcRoot, 'in-progress'));
    fs.mkdirSync(path.join(sdlcRoot, 'done'));

    // Create default config with test/build commands
    const config = {
      sdlcFolder: '.agentic-sdlc',
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
      path.join(testDir, '.agentic-sdlc.json'),
      JSON.stringify(config, null, 2)
    );

    // Reset mocks
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should block review and skip LLM calls when tests fail', async () => {
    // Setup: Create a story with completed implementation
    let story = createStory('Feature with Failing Tests', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;

    // Mock spawn to simulate failed test execution
    const mockSpawn = vi.mocked(spawn);
    mockSpawn.mockImplementation(((command: string, args: string[]) => {
      const mockProcess: any = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            // First call (build) passes, second call (test) fails
            const isTest = args.includes('test');
            const exitCode = isTest ? 1 : 0;
            setTimeout(() => callback(exitCode), 10);
          }
        }),
      };

      // Simulate test failure output
      setTimeout(() => {
        if (args.includes('test')) {
          const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stdoutCallback) {
            stdoutCallback(Buffer.from('FAIL src/example.test.ts\n  ✗ should validate input\n    Expected: true\n    Received: false\n'));
          }
        }
      }, 5);

      return mockProcess;
    }) as any);

    // Execute review
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
    let story = createStory('Feature with Passing Tests', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;

    // Mock spawn to simulate successful test execution
    const mockSpawn = vi.mocked(spawn);
    mockSpawn.mockImplementation((() => {
      const mockProcess: any = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10); // All pass
          }
        }),
      };

      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('PASS all tests\n  ✓ All tests passed\n'));
        }
      }, 5);

      return mockProcess;
    }) as any);

    // Mock LLM to return approval
    const { runAgentQuery } = await import('../../src/core/client.js');
    vi.mocked(runAgentQuery).mockResolvedValue('APPROVED\n\nNo issues found.');

    // Execute review
    const result = await runReviewAgent(story.path, testDir);

    // Verify: Reviews proceeded normally
    expect(result.changesMade).toContain('Verification passed - proceeding with code/security/PO reviews');
    expect(result.changesMade).toContain('Tests passed: npm test');

    // Verify: LLM reviews WERE called (3 times: code, security, PO)
    expect(runAgentQuery).toHaveBeenCalledTimes(3);
  });

  it('should truncate large test output in BLOCKER issue', async () => {
    // Setup: Create a story
    let story = createStory('Feature with Verbose Test Failure', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;

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
            // Build passes, test fails with large output
            const exitCode = isTestCommand ? 1 : 0;
            setTimeout(() => callback(exitCode), 10);
          }
        }),
      };

      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
        if (stdoutCallback) {
          if (isTestCommand) {
            stdoutCallback(Buffer.from(largeOutput));
          } else {
            stdoutCallback(Buffer.from('Build successful\n'));
          }
        }
      }, 5);

      return mockProcess;
    }) as any);

    // Execute review
    const result = await runReviewAgent(story.path, testDir);

    // Verify: Output was truncated
    expect(result.issues[0].description.length).toBeLessThan(largeOutput.length + 500); // Allow overhead for message text
    expect(result.issues[0].description).toContain('(output truncated - showing first 10KB)');
  });

  it('should handle test timeout gracefully', async () => {
    // Setup: Create a story
    let story = createStory('Feature with Hanging Tests', sdlcRoot);
    story = moveStory(story, 'in-progress', sdlcRoot);
    story.frontmatter.implementation_complete = true;

    // Mock spawn to simulate timeout scenario
    const mockSpawn = vi.mocked(spawn);
    let processKilled = false;
    mockSpawn.mockImplementation(((command: string, args: string[]) => {
      const isTestCommand = args.includes('test');

      const mockProcess: any = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            if (isTestCommand) {
              // Simulate timeout by delaying callback, then the kill handler will call it
              const timeoutId = setTimeout(() => {
                if (!processKilled) {
                  callback(1); // Timeout results in failure
                }
              }, 100);
              // Store timeout ID so kill can clear it
              (mockProcess as any)._timeoutId = timeoutId;
            } else {
              // Build succeeds immediately
              setTimeout(() => callback(0), 10);
            }
          }
        }),
        kill: vi.fn((signal) => {
          processKilled = true;
          if ((mockProcess as any)._timeoutId) {
            clearTimeout((mockProcess as any)._timeoutId);
          }
          // Trigger close callback after kill
          const closeCallback = mockProcess.on.mock.calls.find((call: any) => call[0] === 'close')?.[1];
          if (closeCallback) {
            closeCallback(1); // Killed process exits with error code
          }
        }),
      };

      // Add timeout message to stderr when killed
      if (!isTestCommand) {
        setTimeout(() => {
          const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stdoutCallback) {
            stdoutCallback(Buffer.from('Build successful\n'));
          }
        }, 5);
      }

      return mockProcess;
    }) as any);

    // Execute review - will timeout due to test hanging
    const result = await runReviewAgent(story.path, testDir);

    // Verify timeout was handled
    expect(result).toBeDefined();
    expect(result.passed).toBe(false);
  }, 10000); // Increase test timeout to 10 seconds
});
