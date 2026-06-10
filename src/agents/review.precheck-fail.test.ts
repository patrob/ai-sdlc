import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { runReviewAgent, validateTDDCycles, generateTDDIssues, generateReviewSummary, removeUnfinishedCheckboxes, getStoryFileURL, formatPRDescription, truncatePRBody, createPullRequest, getSourceCodeChanges, getConfigurationChanges, getDocumentationChanges, determineEffectiveContentType, deriveIndividualPassFailFromPerspectives, hasTestFiles, waitForChecks, mergePullRequest } from './review.js';
import * as storyModule from '../core/story.js';
import * as clientModule from '../core/client.js';
import * as configModule from '../core/config.js';
import { ReviewDecision, ReviewSeverity, Config, TDDTestCycle, ReviewIssue, Story, ContentType } from '../types/index.js';
import { spawn, spawnSync, execSync } from 'child_process';
import fs from 'fs';

// Mock external dependencies
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}));
vi.mock('fs');
vi.mock('../core/story.js', async () => {
  const actual = await vi.importActual<typeof import('../core/story.js')>('../core/story.js');
  return {
    ...actual,
    parseStory: vi.fn(),
    writeStory: vi.fn(),
    appendReviewHistory: vi.fn(),
    snapshotMaxRetries: vi.fn(),
    isAtMaxRetries: vi.fn(() => false), // Default: not at max retries
    appendToSection: vi.fn(),
    updateStoryField: vi.fn(),
    updateStoryStatus: vi.fn((story) => Promise.resolve(story)), // Return same story with updated status
  };
});
vi.mock('../core/client.js');
vi.mock('../core/config.js', async () => {
  const actual = await vi.importActual<typeof import('../core/config.js')>('../core/config.js');
  return {
    ...actual,
    loadConfig: vi.fn(),
  };
});

describe('Review Agent - Pre-check Optimization', () => {
  const mockStoryPath = '/test/stories/test-story.md';
  const mockWorkingDir = '/test/project';

  const mockStory = {
    path: mockStoryPath,
    slug: 'test-story',
    frontmatter: {
      id: 'test-1',
      title: 'Test Story',
      priority: 1,
      status: 'in-progress' as const,
      type: 'feature' as const,
      created: '2024-01-01',
      labels: [],
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
      reviews_complete: false,
    },
    content: '# Test Story\n\nContent',
  };

  const mockConfig: Config = {
    sdlcFolder: '/test/sdlc',
    stageGates: {
      requireApprovalBeforeImplementation: false,
      requireApprovalBeforePR: false,
      autoMergeOnApproval: false,
    },
    refinement: {
      maxIterations: 3,
      escalateOnMaxAttempts: 'error',
      enableCircuitBreaker: true,
    },
    reviewConfig: {
      maxRetries: 3,
      maxRetriesUpperBound: 10,
      autoCompleteOnApproval: true,
      autoRestartOnRejection: true,
    },
    defaultLabels: [],
    theme: 'auto',
    testCommand: 'npm test',
    buildCommand: 'npm run build',
    timeouts: {
      agentTimeout: 600000,
      buildTimeout: 120000,
      testTimeout: 300000,
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(storyModule.parseStory).mockReturnValue(mockStory);
    vi.mocked(configModule.loadConfig).mockReturnValue(mockConfig);
    // Mock fs for working directory validation
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
  });

  describe('when tests fail', () => {
    it('should return immediately with BLOCKER without running LLM reviews', async () => {
      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/example.ts\ntests/example.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      // Mock spawn to simulate failed test execution
      const mockSpawn = vi.mocked(spawn);
      let callCount = 0;
      mockSpawn.mockImplementation(((command: string, args: string[]) => {
        callCount++;
        const isTestCommand = args.includes('test');
        const isBuildCommand = args.includes('build');

        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              // Build passes (first call), test fails (second call)
              const exitCode = isTestCommand ? 1 : 0;
              process.nextTick(() => callback(exitCode));
            }
          }),
        };

        // Simulate test output only for test command
        if (isTestCommand) {
          process.nextTick(() => {
            const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
            if (stdoutCallback) {
              stdoutCallback(Buffer.from('FAIL tests/example.test.ts\n  ✗ example test failed\n    Expected: true\n    Received: false\n'));
            }
          });
        } else if (isBuildCommand) {
          process.nextTick(() => {
            const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
            if (stdoutCallback) {
              stdoutCallback(Buffer.from('Build successful\n'));
            }
          });
        }

        return mockProcess;
      }) as any);

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Verify early return behavior
      expect(result.success).toBe(true); // Agent executed successfully
      expect(result.passed).toBe(false); // Review did not pass
      expect(result.decision).toBe(ReviewDecision.REJECTED);
      expect(result.severity).toBe(ReviewSeverity.CRITICAL);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('blocker');
      expect(result.issues[0].category).toBe('testing');
      expect(result.issues[0].description).toContain('Tests must pass before code review can proceed');
      expect(result.issues[0].description).toContain('npm test');
      expect(result.changesMade).toContain('Skipping code/security/PO reviews - verification must pass first');

      // Verify LLM reviews were NOT called
      expect(clientModule.runAgentQuery).not.toHaveBeenCalled();
    });

    it('should include test failure output in BLOCKER issue', async () => {
      const testOutput = 'FAIL tests/example.test.ts\n  ✗ example test failed\n    Expected: true\n    Received: false\n';

      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/example.ts\ntests/example.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation(((command: string, args: string[]) => {
        const isTestCommand = args.includes('test');

        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              // Build passes, test fails
              const exitCode = isTestCommand ? 1 : 0;
              process.nextTick(() => callback(exitCode));
            }
          }),
        };

        process.nextTick(() => {
          const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stdoutCallback) {
            if (isTestCommand) {
              stdoutCallback(Buffer.from(testOutput));
            } else {
              stdoutCallback(Buffer.from('Build successful\n'));
            }
          }
        });

        return mockProcess;
      }) as any);

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      expect(result.issues[0].description).toContain(testOutput);
    });

    it('should truncate test output if larger than 10KB', async () => {
      // Generate large test output (>10KB)
      const largeOutput = 'Failed test output\n'.repeat(1000); // ~18KB

      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/example.ts\ntests/example.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

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

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Verify truncation
      expect(result.issues[0].description.length).toBeLessThan(largeOutput.length);
      expect(result.issues[0].description).toContain('(output truncated - showing first 10KB)');
    });

    it('should block review when build fails even if tests pass', async () => {
      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/example.ts\ntests/example.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const mockSpawn = vi.mocked(spawn);
      let callCount = 0;

      mockSpawn.mockImplementation((() => {
        callCount++;
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              // First call (build) fails, second call (test) would pass
              const exitCode = callCount === 1 ? 1 : 0;
              process.nextTick(() => callback(exitCode));
            }
          }),
        };

        if (callCount === 1) {
          process.nextTick(() => {
            const stderrCallback = mockProcess.stderr.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
            if (stderrCallback) {
              stderrCallback(Buffer.from('Build failed: TypeScript compilation error\n'));
            }
          });
        }

        return mockProcess;
      }) as any);

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      expect(result.passed).toBe(false);
      expect(result.decision).toBe(ReviewDecision.REJECTED);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].category).toBe('build');
      expect(result.changesMade).toContain('Skipping code/security/PO reviews - verification must pass first');
    });
  });

  describe('when tests pass', () => {
    it('should proceed with code/security/PO reviews', async () => {
      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/example.ts\ntests/example.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      // Mock spawn to simulate successful test execution
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              process.nextTick(() => callback(0)); // exit code 0 = success
            }
          }),
        };

        process.nextTick(() => {
          const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stdoutCallback) {
            stdoutCallback(Buffer.from('PASS tests/example.test.ts\n  ✓ all tests passed\n'));
          }
        });

        return mockProcess;
      }) as any);

      // Mock LLM reviews to return approval
      vi.mocked(clientModule.runAgentQuery).mockResolvedValue('APPROVED\n\nNo issues found.');

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Verify reviews proceeded with unified review (single LLM call)
      expect(result.changesMade).toContain('Verification passed - proceeding with unified collaborative review');
      expect(clientModule.runAgentQuery).toHaveBeenCalledTimes(1); // Single unified review
    });

    it('should include test success in changesMade', async () => {
      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/example.ts\ntests/example.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              process.nextTick(() => callback(0));
            }
          }),
        };

        process.nextTick(() => {
          const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stdoutCallback) {
            stdoutCallback(Buffer.from('All tests passed\n'));
          }
        });

        return mockProcess;
      }) as any);

      vi.mocked(clientModule.runAgentQuery).mockResolvedValue('APPROVED\n\nNo issues found.');

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      expect(result.changesMade).toContain('Tests passed: npm test');
    });
  });
});
