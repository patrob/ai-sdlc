import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { runReviewAgent, validateTDDCycles, generateTDDIssues, generateReviewSummary, removeUnfinishedCheckboxes, getStoryFileURL, formatPRDescription, truncatePRBody, createPullRequest, getSourceCodeChanges, deriveIndividualPassFailFromPerspectives } from './review.js';
import * as storyModule from '../core/story.js';
import * as clientModule from '../core/client.js';
import * as configModule from '../core/config.js';
import { ReviewDecision, ReviewSeverity, Config, TDDTestCycle, ReviewIssue, Story } from '../types/index.js';
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
              setTimeout(() => callback(exitCode), 10);
            }
          }),
        };

        // Simulate test output only for test command
        if (isTestCommand) {
          setTimeout(() => {
            const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
            if (stdoutCallback) {
              stdoutCallback(Buffer.from('FAIL tests/example.test.ts\n  ✗ example test failed\n    Expected: true\n    Received: false\n'));
            }
          }, 5);
        } else if (isBuildCommand) {
          setTimeout(() => {
            const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
            if (stdoutCallback) {
              stdoutCallback(Buffer.from('Build successful\n'));
            }
          }, 5);
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
              setTimeout(() => callback(exitCode), 10);
            }
          }),
        };

        setTimeout(() => {
          const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stdoutCallback) {
            if (isTestCommand) {
              stdoutCallback(Buffer.from(testOutput));
            } else {
              stdoutCallback(Buffer.from('Build successful\n'));
            }
          }
        }, 5);

        return mockProcess;
      }) as any);

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      expect(result.issues[0].description).toContain(testOutput);
    });

    it('should truncate test output if larger than 10KB', async () => {
      // Generate large test output (>10KB)
      const largeOutput = 'Failed test output\n'.repeat(1000); // ~18KB

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

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Verify truncation
      expect(result.issues[0].description.length).toBeLessThan(largeOutput.length);
      expect(result.issues[0].description).toContain('(output truncated - showing first 10KB)');
    });

    it('should block review when build fails even if tests pass', async () => {
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
              setTimeout(() => callback(exitCode), 10);
            }
          }),
        };

        if (callCount === 1) {
          setTimeout(() => {
            const stderrCallback = mockProcess.stderr.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
            if (stderrCallback) {
              stderrCallback(Buffer.from('Build failed: TypeScript compilation error\n'));
            }
          }, 5);
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
      // Mock spawn to simulate successful test execution
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10); // exit code 0 = success
            }
          }),
        };

        setTimeout(() => {
          const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stdoutCallback) {
            stdoutCallback(Buffer.from('PASS tests/example.test.ts\n  ✓ all tests passed\n'));
          }
        }, 5);

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
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10);
            }
          }),
        };

        setTimeout(() => {
          const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stdoutCallback) {
            stdoutCallback(Buffer.from('All tests passed\n'));
          }
        }, 5);

        return mockProcess;
      }) as any);

      vi.mocked(clientModule.runAgentQuery).mockResolvedValue('APPROVED\n\nNo issues found.');

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      expect(result.changesMade).toContain('Tests passed: npm test');
    });
  });

  describe('LLM response parsing', () => {
    it('should handle null line values in LLM response gracefully', async () => {
      // This test reproduces the ZodError: "Invalid input: expected number, received null"
      // at path ["issues", 3, "line"] when the LLM returns null for optional fields
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10); // Success
            }
          }),
        };
        return mockProcess;
      }) as any);

      // Mock LLM to return JSON with null line values (as observed in real usage)
      const llmResponseWithNullLine = JSON.stringify({
        passed: false,
        issues: [
          {
            severity: 'major',
            category: 'code_quality',
            description: 'Missing error handling',
            file: 'src/index.ts',
            line: 42,
            suggestedFix: 'Add try-catch',
          },
          {
            severity: 'minor',
            category: 'architecture',
            description: 'Consider extracting this logic',
            file: null, // null instead of undefined
            line: null, // null instead of undefined - this caused the ZodError
            suggestedFix: null,
          },
          {
            severity: 'major',
            category: 'security',
            description: 'Potential XSS vulnerability',
            file: 'src/utils.ts',
            line: null, // Another null line
            suggestedFix: 'Sanitize user input',
          },
        ],
      });

      vi.mocked(clientModule.runAgentQuery).mockResolvedValue(llmResponseWithNullLine);

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Should NOT throw ZodError - should handle gracefully
      expect(result.success).toBe(true);
      // Should have parsed the issues correctly
      expect(result.issues.length).toBeGreaterThan(0);
      // Null values should be converted to undefined (or handled gracefully)
      const issueWithNullLine = result.issues.find(i => i.category === 'architecture');
      // The issue should exist and line should be undefined (not null)
      expect(issueWithNullLine).toBeDefined();
      expect(issueWithNullLine?.line).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should skip verification if no testCommand configured', async () => {
      // Skip both build and test verification to proceed directly to reviews
      const configWithoutVerification = { ...mockConfig, testCommand: undefined, buildCommand: undefined };
      vi.mocked(configModule.loadConfig).mockReturnValue(configWithoutVerification);
      vi.mocked(clientModule.runAgentQuery).mockResolvedValue('APPROVED\n\nNo issues found.');

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Should proceed directly to reviews without verification
      expect(result.changesMade).not.toContain('Tests FAILED');
      expect(clientModule.runAgentQuery).toHaveBeenCalled();
    });

    it('should handle empty test output gracefully', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation(((command: string, args: string[]) => {
        const isTestCommand = args.includes('test');

        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              // Build passes, test fails with no output
              const exitCode = isTestCommand ? 1 : 0;
              setTimeout(() => callback(exitCode), 10);
            }
          }),
        };

        // No output - simulate silent failure
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

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      expect(result.passed).toBe(false);
      expect(result.issues[0].description).toContain('Tests must pass');
      // Should not crash on empty output
      expect(result.issues[0].description).toBeDefined();
    });

    it('should handle both build and test failures', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(1), 10); // All fail
            }
          }),
        };

        setTimeout(() => {
          const stderrCallback = mockProcess.stderr.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stderrCallback) {
            stderrCallback(Buffer.from('Error occurred\n'));
          }
        }, 5);

        return mockProcess;
      }) as any);

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Should have issues for both build and test failures
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
      expect(result.issues.some(issue => issue.category === 'build')).toBe(true);
      expect(result.issues.some(issue => issue.category === 'testing')).toBe(true);
    });
  });
});

describe('TDD Validation', () => {
  // Helper to create a complete TDD cycle
  function createCompleteCycle(cycleNumber: number): TDDTestCycle {
    return {
      test_name: `Test ${cycleNumber}`,
      test_file: `src/feature${cycleNumber}.test.ts`,
      red_timestamp: '2024-01-01T10:00:00.000Z',
      green_timestamp: '2024-01-01T10:05:00.000Z',
      refactor_timestamp: '2024-01-01T10:10:00.000Z',
      test_output_red: 'FAIL: Expected true but got false',
      test_output_green: 'PASS',
      all_tests_green: true,
      cycle_number: cycleNumber,
    };
  }

  // Helper to create an incomplete TDD cycle (missing green phase)
  function createIncompleteCycle(cycleNumber: number): TDDTestCycle {
    return {
      test_name: `Test ${cycleNumber}`,
      test_file: `src/feature${cycleNumber}.test.ts`,
      red_timestamp: '2024-01-01T10:00:00.000Z',
      green_timestamp: undefined,
      refactor_timestamp: undefined,
      test_output_red: 'FAIL: Expected true but got false',
      test_output_green: undefined,
      all_tests_green: false,
      cycle_number: cycleNumber,
    };
  }

  describe('validateTDDCycles', () => {
    it('should export validateTDDCycles function', () => {
      expect(validateTDDCycles).toBeDefined();
      expect(typeof validateTDDCycles).toBe('function');
    });

    it('should return empty violations array for complete TDD cycles', () => {
      const cycles: TDDTestCycle[] = [
        createCompleteCycle(1),
        createCompleteCycle(2),
      ];

      const violations = validateTDDCycles(cycles);

      expect(violations).toEqual([]);
    });

    it('should detect missing GREEN phase', () => {
      const cycles: TDDTestCycle[] = [
        createIncompleteCycle(1),
      ];

      const violations = validateTDDCycles(cycles);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain('cycle 1');
      expect(violations[0].toLowerCase()).toContain('green');
    });

    it('should detect missing REFACTOR phase', () => {
      const cycle: TDDTestCycle = {
        ...createCompleteCycle(1),
        refactor_timestamp: undefined,
      };

      const violations = validateTDDCycles([cycle]);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain('cycle 1');
      expect(violations[0].toLowerCase()).toContain('refactor');
    });

    it('should detect when all_tests_green is false', () => {
      const cycle: TDDTestCycle = {
        ...createCompleteCycle(1),
        all_tests_green: false,
      };

      const violations = validateTDDCycles([cycle]);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain('cycle 1');
      expect(violations[0].toLowerCase()).toContain('regression');
    });

    it('should return empty array for empty cycles array', () => {
      const violations = validateTDDCycles([]);
      expect(violations).toEqual([]);
    });

    it('should detect multiple violations across cycles', () => {
      const cycles: TDDTestCycle[] = [
        createIncompleteCycle(1), // Missing green/refactor
        { ...createCompleteCycle(2), all_tests_green: false }, // Regression
      ];

      const violations = validateTDDCycles(cycles);

      expect(violations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('generateTDDIssues', () => {
    it('should export generateTDDIssues function', () => {
      expect(generateTDDIssues).toBeDefined();
      expect(typeof generateTDDIssues).toBe('function');
    });

    it('should return empty array when no violations', () => {
      const issues = generateTDDIssues([]);
      expect(issues).toEqual([]);
    });

    it('should create review issues for each violation', () => {
      const violations = [
        'TDD cycle 1: Missing GREEN phase timestamp',
        'TDD cycle 2: Tests not all green (regression detected)',
      ];

      const issues = generateTDDIssues(violations);

      expect(issues.length).toBe(2);
      expect(issues[0].category).toBe('tdd_violation');
      expect(issues[0].description).toContain('cycle 1');
      expect(issues[1].description).toContain('cycle 2');
    });

    it('should set appropriate severity for TDD violations', () => {
      const violations = ['TDD cycle 1: Missing GREEN phase'];

      const issues = generateTDDIssues(violations);

      // TDD violations should be critical or blocker severity
      expect(['blocker', 'critical']).toContain(issues[0].severity);
    });

    it('should include suggested fix for TDD violations', () => {
      const violations = ['TDD cycle 1: Missing GREEN phase'];

      const issues = generateTDDIssues(violations);

      expect(issues[0].suggestedFix).toBeDefined();
      expect(issues[0].suggestedFix!.length).toBeGreaterThan(0);
    });
  });

  describe('TDD validation integration in review agent', () => {
    const mockStoryPath = '/test/stories/test-story.md';
    const mockWorkingDir = '/test/project';

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
      tdd: {
        enabled: true,
        strictMode: true,
        maxCycles: 50,
        requireApprovalPerCycle: false,
      },
    };

    beforeEach(() => {
      vi.resetAllMocks();
      vi.mocked(configModule.loadConfig).mockReturnValue(mockConfig);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
    });

    it('should include TDD violations in review issues when tdd_enabled', async () => {
      // Story with incomplete TDD cycles
      const mockStoryWithTDD = {
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
          tdd_enabled: true,
          tdd_test_history: [
            {
              test_name: 'Test 1',
              test_file: 'src/feature.test.ts',
              red_timestamp: '2024-01-01T10:00:00.000Z',
              green_timestamp: undefined, // Missing GREEN phase!
              refactor_timestamp: undefined,
              test_output_red: 'FAIL',
              test_output_green: undefined,
              all_tests_green: false,
              cycle_number: 1,
            },
          ],
        },
        content: '# Test Story\n\nContent',
      };

      vi.mocked(storyModule.parseStory).mockReturnValue(mockStoryWithTDD as any);

      // Mock spawn to simulate successful build/test
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10); // Success
            }
          }),
        };
        return mockProcess;
      }) as any);

      // Mock LLM reviews to return approval
      vi.mocked(clientModule.runAgentQuery).mockResolvedValue('{"passed": true, "issues": []}');

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Should include TDD violations even though other reviews passed
      expect(result.issues.some(issue => issue.category === 'tdd_violation')).toBe(true);
    });

    it('should skip TDD validation when tdd_enabled is false', async () => {
      // Story without TDD enabled but with incomplete cycles in history
      const mockStoryNoTDD = {
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
          tdd_enabled: false, // TDD not enabled
          tdd_test_history: [
            {
              test_name: 'Test 1',
              test_file: 'src/feature.test.ts',
              red_timestamp: '2024-01-01T10:00:00.000Z',
              green_timestamp: undefined, // Would be violation if TDD enabled
              refactor_timestamp: undefined,
              test_output_red: 'FAIL',
              test_output_green: undefined,
              all_tests_green: false,
              cycle_number: 1,
            },
          ],
        },
        content: '# Test Story\n\nContent',
      };

      vi.mocked(storyModule.parseStory).mockReturnValue(mockStoryNoTDD as any);

      // Mock spawn to simulate successful build/test
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10); // Success
            }
          }),
        };
        return mockProcess;
      }) as any);

      // Mock LLM reviews to return approval
      vi.mocked(clientModule.runAgentQuery).mockResolvedValue('{"passed": true, "issues": []}');

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Should NOT include TDD violations when tdd_enabled is false
      expect(result.issues.some(issue => issue.category === 'tdd_violation')).toBe(false);
    });
  });
});

describe('generateReviewSummary', () => {
  it('should export generateReviewSummary function', () => {
    expect(generateReviewSummary).toBeDefined();
    expect(typeof generateReviewSummary).toBe('function');
  });

  it('should return fallback message when no issues', () => {
    const summary = generateReviewSummary([], 120);
    expect(summary).toBe('Review rejected due to system error or policy violation.');
  });

  it('should prioritize blocker issues first', () => {
    const issues: ReviewIssue[] = [
      { severity: 'minor', category: 'style', description: 'Missing semicolon' },
      { severity: 'blocker', category: 'security', description: 'SQL injection vulnerability' },
      { severity: 'major', category: 'testing', description: 'Missing tests' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('SQL injection vulnerability');
    // Blocker should appear first
    expect(summary.indexOf('SQL injection')).toBeLessThan(summary.indexOf('Missing tests'));
  });

  it('should prioritize critical issues second', () => {
    const issues: ReviewIssue[] = [
      { severity: 'minor', category: 'style', description: 'Missing semicolon' },
      { severity: 'critical', category: 'security', description: 'Authentication bypass' },
      { severity: 'major', category: 'testing', description: 'Missing tests' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('Authentication bypass');
    expect(summary.indexOf('Authentication bypass')).toBeLessThan(summary.indexOf('Missing tests'));
  });

  it('should include file names when available', () => {
    const issues: ReviewIssue[] = [
      {
        severity: 'blocker',
        category: 'security',
        description: 'SQL injection vulnerability',
        file: 'src/db/queries.ts',
        line: 42,
      },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('queries.ts');
    expect(summary).toContain(':42');
  });

  it('should show top 3 issues with truncation indicator', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'Issue 1' },
      { severity: 'blocker', category: 'security', description: 'Issue 2' },
      { severity: 'blocker', category: 'security', description: 'Issue 3' },
      { severity: 'critical', category: 'bug', description: 'Issue 4' },
      { severity: 'critical', category: 'bug', description: 'Issue 5' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('Issue 1');
    expect(summary).toContain('Issue 2');
    expect(summary).toContain('Issue 3');
    expect(summary).toContain('...and 2 more issues');
  });

  it('should handle exactly 3 issues without truncation indicator', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'Issue 1' },
      { severity: 'critical', category: 'bug', description: 'Issue 2' },
      { severity: 'major', category: 'testing', description: 'Issue 3' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('Issue 1');
    expect(summary).toContain('Issue 2');
    expect(summary).toContain('Issue 3');
    expect(summary).not.toContain('more issues');
  });

  it('should handle 1 issue without truncation', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'SQL injection found' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toBe('SQL injection found.');
  });

  it('should truncate very long individual descriptions', () => {
    const longDescription = 'This is a very long description that goes on and on and on and should be truncated because it exceeds the maximum allowed length for a single issue in the executive summary and we need to keep things concise for the user to read quickly.';

    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: longDescription },
    ];

    const summary = generateReviewSummary(issues, 150);
    expect(summary.length).toBeLessThan(longDescription.length);
    expect(summary).toContain('...');
  });

  it('should respect terminal width for narrow terminals (80 cols)', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'SQL injection vulnerability in user query handler' },
      { severity: 'critical', category: 'testing', description: 'Tests are failing due to undefined variable errors' },
      { severity: 'major', category: 'code_quality', description: 'Missing error handling in async function' },
    ];

    const summary = generateReviewSummary(issues, 80);
    // Summary should be truncated to fit narrow terminal
    // Available width = 80 - 2 (indent) - 9 ("Summary: ") = 69 chars
    expect(summary.length).toBeLessThanOrEqual(80);
  });

  it('should handle wide terminals (200 cols) without unnecessary truncation', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'SQL injection vulnerability' },
      { severity: 'critical', category: 'testing', description: 'Tests failing' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('SQL injection vulnerability');
    expect(summary).toContain('Tests failing');
  });

  it('should handle very small terminal width gracefully (< 20 cols)', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'SQL injection vulnerability in user query handler' },
      { severity: 'critical', category: 'testing', description: 'Tests are failing' },
    ];

    // Terminal width of 10 should not cause negative or invalid calculations
    const summary = generateReviewSummary(issues, 10);
    expect(summary).toBeDefined();
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).not.toBe('.');
    // Should use minimum viable width of 40 for availableWidth
    expect(summary).toContain('SQL');
  });

  it('should handle invalid terminal width (negative or non-finite)', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'Security issue found' },
    ];

    // Should fallback to 80 when invalid width provided
    const summary1 = generateReviewSummary(issues, -1);
    expect(summary1).toContain('Security issue');

    const summary2 = generateReviewSummary(issues, Infinity);
    expect(summary2).toContain('Security issue');

    const summary3 = generateReviewSummary(issues, NaN);
    expect(summary3).toContain('Security issue');
  });

  it('should skip issues with empty descriptions', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: '' },
      { severity: 'critical', category: 'testing', description: 'Tests are failing' },
      { severity: 'major', category: 'code_quality', description: '   ' }, // Whitespace only
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('Tests are failing');
    expect(summary).not.toContain('security');
    expect(summary).not.toContain('code_quality');
  });

  it('should return fallback message when all issues have empty descriptions', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: '' },
      { severity: 'critical', category: 'testing', description: '   ' }, // Whitespace only
      { severity: 'major', category: 'code_quality', description: '\n\n' }, // Only newlines
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toBe('Review rejected (no actionable issue details available).');
  });

  it('should handle issues without severity (treat as minor)', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker' as any, category: 'security', description: 'Critical issue' },
      { severity: undefined as any, category: 'style', description: 'Style issue' },
    ];

    const summary = generateReviewSummary(issues, 200);
    // Blocker should appear first
    expect(summary).toContain('Critical issue');
  });

  it('should handle all same severity (preserve order)', () => {
    const issues: ReviewIssue[] = [
      { severity: 'major', category: 'testing', description: 'First issue' },
      { severity: 'major', category: 'code_quality', description: 'Second issue' },
      { severity: 'major', category: 'architecture', description: 'Third issue' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary.indexOf('First issue')).toBeLessThan(summary.indexOf('Second issue'));
    expect(summary.indexOf('Second issue')).toBeLessThan(summary.indexOf('Third issue'));
  });

  it('should strip ANSI codes for security', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'Error: \x1b[31mDanger\x1b[0m found' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).not.toContain('\x1b');
    expect(summary).toContain('Danger');
  });

  it('should remove code blocks from descriptions', () => {
    const issues: ReviewIssue[] = [
      {
        severity: 'blocker',
        category: 'security',
        description: 'SQL injection found:\n```sql\nSELECT * FROM users WHERE id = ${userId}\n```\nUse parameterized queries.',
      },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).not.toContain('```');
    expect(summary).toContain('SQL injection found');
    expect(summary).toContain('Use parameterized queries');
  });

  it('should handle 100+ issues with large count indicator', () => {
    const issues: ReviewIssue[] = Array.from({ length: 150 }, (_, i) => ({
      severity: 'major' as const,
      category: 'testing',
      description: `Issue ${i + 1}`,
    }));

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('...and 147 more issues');
  });

  it('should handle issues with file names but no line numbers', () => {
    const issues: ReviewIssue[] = [
      {
        severity: 'critical',
        category: 'security',
        description: 'Potential XSS vulnerability',
        file: 'src/components/UserProfile.tsx',
      },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('UserProfile.tsx');
    expect(summary).not.toContain(':');
  });

  it('should normalize whitespace in descriptions', () => {
    const issues: ReviewIssue[] = [
      {
        severity: 'blocker',
        category: 'testing',
        description: 'Tests   are\n\n\nfailing\ndue to errors',
      },
    ];

    const summary = generateReviewSummary(issues, 200);
    // Should collapse multiple whitespace/newlines to single space
    expect(summary).not.toContain('\n');
    expect(summary).toContain('Tests are failing due to errors');
  });

  it('should add "more issues" indicator with singular form for 1 remaining', () => {
    const issues: ReviewIssue[] = [
      { severity: 'blocker', category: 'security', description: 'Issue 1' },
      { severity: 'blocker', category: 'security', description: 'Issue 2' },
      { severity: 'blocker', category: 'security', description: 'Issue 3' },
      { severity: 'critical', category: 'bug', description: 'Issue 4' },
    ];

    const summary = generateReviewSummary(issues, 200);
    expect(summary).toContain('...and 1 more issue.');
  });
});

describe('PR Helper Functions', () => {
  describe('removeUnfinishedCheckboxes', () => {
    it('should remove lines with unchecked checkboxes', () => {
      const content = `
- [x] Completed task
- [ ] Uncompleted task
- [x] Another completed task
`;
      const result = removeUnfinishedCheckboxes(content);
      expect(result).toContain('[x] Completed task');
      expect(result).not.toContain('[ ] Uncompleted task');
      expect(result).toContain('[x] Another completed task');
    });

    it('should handle indented checkboxes', () => {
      const content = `
  - [x] Indented completed
  - [ ] Indented uncompleted
    - [ ] Nested uncompleted
`;
      const result = removeUnfinishedCheckboxes(content);
      expect(result).toContain('[x] Indented completed');
      expect(result).not.toContain('[ ] Indented uncompleted');
      expect(result).not.toContain('[ ] Nested uncompleted');
    });

    it('should handle asterisk bullets', () => {
      const content = `
* [x] Completed with asterisk
* [ ] Uncompleted with asterisk
`;
      const result = removeUnfinishedCheckboxes(content);
      expect(result).toContain('[x] Completed with asterisk');
      expect(result).not.toContain('[ ] Uncompleted with asterisk');
    });

    it('should preserve uppercase X checkboxes', () => {
      const content = `
- [X] Completed uppercase
- [ ] Uncompleted
`;
      const result = removeUnfinishedCheckboxes(content);
      expect(result).toContain('[X] Completed uppercase');
      expect(result).not.toContain('[ ] Uncompleted');
    });

    it('should handle empty content', () => {
      const result = removeUnfinishedCheckboxes('');
      expect(result).toBe('');
    });

    it('should preserve non-checkbox content', () => {
      const content = `
# Header
Regular paragraph with [ ] brackets in it.
- Regular list item
- [x] Completed checkbox
- [ ] Uncompleted checkbox
\`\`\`
Code with - [ ] checkbox
\`\`\`
`;
      const result = removeUnfinishedCheckboxes(content);
      expect(result).toContain('# Header');
      expect(result).toContain('Regular paragraph with [ ] brackets in it.');
      expect(result).toContain('- Regular list item');
      expect(result).toContain('[x] Completed checkbox');
      expect(result).not.toContain('[ ] Uncompleted checkbox');
      // Note: Code blocks will still be filtered, which is acceptable
    });
  });

  describe('getStoryFileURL', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('should generate GitHub URL from HTTPS remote', () => {
      vi.mocked(execSync).mockReturnValue('https://github.com/owner/repo.git\n');

      const url = getStoryFileURL('/test/project/.ai-sdlc/stories/S-001/story.md', 'feature-branch', '/test/project');

      expect(url).toBe('https://github.com/owner/repo/blob/feature-branch/.ai-sdlc/stories/S-001/story.md');
    });

    it('should generate GitHub URL from SSH remote', () => {
      vi.mocked(execSync).mockReturnValue('git@github.com:owner/repo.git\n');

      const url = getStoryFileURL('/test/project/.ai-sdlc/stories/S-001/story.md', 'feature-branch', '/test/project');

      expect(url).toBe('https://github.com/owner/repo/blob/feature-branch/.ai-sdlc/stories/S-001/story.md');
    });

    it('should handle remote URL without .git suffix', () => {
      vi.mocked(execSync).mockReturnValue('https://github.com/owner/repo\n');

      const url = getStoryFileURL('/test/project/.ai-sdlc/stories/S-001/story.md', 'main', '/test/project');

      expect(url).toBe('https://github.com/owner/repo/blob/main/.ai-sdlc/stories/S-001/story.md');
    });

    it('should return empty string for invalid remote URL', () => {
      vi.mocked(execSync).mockReturnValue('https://gitlab.com/owner/repo.git\n');

      const url = getStoryFileURL('/test/project/.ai-sdlc/stories/S-001/story.md', 'main', '/test/project');

      expect(url).toBe('');
    });

    it('should return empty string when git command fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Git command failed');
      });

      const url = getStoryFileURL('/test/project/.ai-sdlc/stories/S-001/story.md', 'main', '/test/project');

      expect(url).toBe('');
    });
  });

  describe('formatPRDescription', () => {
    it('should format PR description with all sections', () => {
      const mockStory: Story = {
        path: '/test/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'S-001',
          title: 'Test Story',
          priority: 10,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: false,
        },
        content: `## User Story

**As a** developer
**I want** automated PRs
**So that** I can work faster

## Summary

This feature creates PRs automatically.

## Acceptance Criteria

- [x] PR created with title
- [ ] PR includes description
- [x] PR links to story

## Implementation Summary

Implemented PR creation with rich formatting.
Added tests for all functions.
`,
      };

      const prBody = formatPRDescription(mockStory, 'https://github.com/owner/repo/blob/main/story.md');

      expect(prBody).toContain('## Story ID');
      expect(prBody).toContain('S-001');
      expect(prBody).toContain('## User Story');
      expect(prBody).toContain('**As a** developer');
      expect(prBody).toContain('## Summary');
      expect(prBody).toContain('creates PRs automatically');
      expect(prBody).toContain('## Acceptance Criteria');
      expect(prBody).toContain('[x] PR created with title');
      expect(prBody).not.toContain('[ ] PR includes description');
      expect(prBody).toContain('## Implementation Summary');
      expect(prBody).toContain('Implemented PR creation');
      expect(prBody).toContain('[View Full Story](https://github.com/owner/repo/blob/main/story.md)');
    });

    it('should handle missing sections gracefully', () => {
      const mockStory: Story = {
        path: '/test/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'S-002',
          title: 'Minimal Story',
          priority: 10,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: false,
        },
        content: `## Summary

Just a summary.
`,
      };

      const prBody = formatPRDescription(mockStory, '');

      expect(prBody).toContain('## Story ID');
      expect(prBody).toContain('S-002');
      expect(prBody).toContain('## Summary');
      expect(prBody).toContain('Just a summary');
      expect(prBody).not.toContain('## User Story');
      expect(prBody).not.toContain('## Acceptance Criteria');
      expect(prBody).not.toContain('## Implementation Summary');
    });

    it('should remove unfinished checkboxes from all sections', () => {
      const mockStory: Story = {
        path: '/test/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'S-003',
          title: 'Test Story',
          priority: 10,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: false,
        },
        content: `## Acceptance Criteria

- [x] First criterion done
- [ ] Second criterion pending
- [x] Third criterion done

## Implementation Summary

- [x] Implemented feature
- [ ] TODO: Add more tests
`,
      };

      const prBody = formatPRDescription(mockStory, '');

      expect(prBody).toContain('[x] First criterion done');
      expect(prBody).not.toContain('[ ] Second criterion pending');
      expect(prBody).toContain('[x] Third criterion done');
      expect(prBody).toContain('[x] Implemented feature');
      expect(prBody).not.toContain('[ ] TODO: Add more tests');
    });
  });

  describe('truncatePRBody', () => {
    it('should not truncate content under limit', () => {
      const shortBody = 'This is a short PR body.';
      const result = truncatePRBody(shortBody, 1000);
      expect(result).toBe(shortBody);
    });

    it('should truncate Implementation Summary when over limit', () => {
      const longImplementation = 'x'.repeat(70000);
      const body = `## Story ID

S-001

## Summary

Brief summary

## Implementation Summary

${longImplementation}

---

📋 [View Full Story](https://example.com)
`;

      const result = truncatePRBody(body, 64000);

      expect(result.length).toBeLessThanOrEqual(64000);
      expect(result).toContain('## Story ID');
      expect(result).toContain('## Summary');
      expect(result).toContain('## Implementation Summary');
      expect(result).toContain('⚠️ Implementation Summary truncated due to length');
      expect(result).toContain('[View Full Story]');
    });

    it('should truncate at paragraph boundary', () => {
      const paragraph1 = 'First paragraph.\n\n';
      const paragraph2 = 'Second paragraph that is very long.\n\n';
      const paragraph3 = 'Third paragraph.';

      const body = `## Implementation Summary

${paragraph1}${paragraph2.repeat(3000)}${paragraph3}
`;

      const result = truncatePRBody(body, 1000);

      // Should truncate at last paragraph boundary
      expect(result).toContain('⚠️ Implementation Summary truncated');
      // Should not end mid-word or mid-sentence abruptly
    });

    it('should handle body without Implementation Summary section', () => {
      const longBody = 'x'.repeat(70000);
      const result = truncatePRBody(longBody, 64000);

      expect(result.length).toBeLessThanOrEqual(64000);
      expect(result).toContain('⚠️ Description truncated due to length');
    });

    it('should respect custom maxLength parameter', () => {
      const body = 'a'.repeat(10000);
      const result = truncatePRBody(body, 5000);

      expect(result.length).toBeLessThanOrEqual(5000);
      expect(result).toContain('⚠️ Description truncated');
    });
  });
});

describe('createPullRequest - Draft PR Support', () => {
  const mockStoryPath = '/test/project/.ai-sdlc/stories/S-001/story.md';
  const mockSdlcRoot = '/test/project/.ai-sdlc';
  const mockWorkingDir = '/test/project';

  const mockStory = {
    path: mockStoryPath,
    slug: 'test-story',
    frontmatter: {
      id: 'S-001',
      title: 'Test Story',
      priority: 10,
      status: 'in-progress' as const,
      type: 'feature' as const,
      created: '2024-01-01',
      labels: [],
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
      reviews_complete: true,
      branch: 'ai-sdlc/test-story',
    },
    content: '## Summary\n\nTest content',
  };

  const mockConfig: Config = {
    sdlcFolder: '.ai-sdlc',
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
    timeouts: {
      agentTimeout: 600000,
      buildTimeout: 120000,
      testTimeout: 300000,
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(storyModule.parseStory).mockReturnValue(mockStory as any);
    vi.mocked(configModule.loadConfig).mockReturnValue(mockConfig);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
    vi.mocked(storyModule.updateStoryField).mockResolvedValue(undefined);
  });

  describe('draft flag from options parameter', () => {
    it('should include --draft flag when options.draft is true', async () => {
      // Mock successful gh CLI availability
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          // Verify --draft flag is present
          expect(cmd).toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot, { draft: true });

      expect(result.success).toBe(true);
      expect(result.changesMade).toContain('Created draft PR: https://github.com/owner/repo/pull/123');
    });

    it('should NOT include --draft flag when options.draft is false', async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          // Verify --draft flag is NOT present
          expect(cmd).not.toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot, { draft: false });

      expect(result.success).toBe(true);
      expect(result.changesMade).toContain('Created PR: https://github.com/owner/repo/pull/123');
    });
  });

  describe('draft flag from config', () => {
    it('should use config github.createDraftPRs when options not provided', async () => {
      // Config with createDraftPRs: true
      const configWithDraft = {
        ...mockConfig,
        github: { createDraftPRs: true },
      };
      vi.mocked(configModule.loadConfig).mockReturnValue(configWithDraft);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          // Should use --draft from config
          expect(cmd).toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot);

      expect(result.success).toBe(true);
      expect(result.changesMade).toContain('Created draft PR: https://github.com/owner/repo/pull/123');
    });

    it('should NOT use draft when config github.createDraftPRs is false', async () => {
      const configWithoutDraft = {
        ...mockConfig,
        github: { createDraftPRs: false },
      };
      vi.mocked(configModule.loadConfig).mockReturnValue(configWithoutDraft);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          expect(cmd).not.toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot);

      expect(result.success).toBe(true);
    });

    it('should default to non-draft when github config is not set', async () => {
      // Config without github section
      vi.mocked(configModule.loadConfig).mockReturnValue(mockConfig);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          expect(cmd).not.toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot);

      expect(result.success).toBe(true);
      expect(result.changesMade).toContain('Created PR: https://github.com/owner/repo/pull/123');
    });
  });

  describe('options parameter takes precedence over config', () => {
    it('should use options.draft=false even when config says createDraftPRs=true', async () => {
      // Config says draft, but options says not draft
      const configWithDraft = {
        ...mockConfig,
        github: { createDraftPRs: true },
      };
      vi.mocked(configModule.loadConfig).mockReturnValue(configWithDraft);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          // Options should override config
          expect(cmd).not.toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot, { draft: false });

      expect(result.success).toBe(true);
    });

    it('should use options.draft=true even when config says createDraftPRs=false', async () => {
      // Config says not draft, but options says draft
      const configWithoutDraft = {
        ...mockConfig,
        github: { createDraftPRs: false },
      };
      vi.mocked(configModule.loadConfig).mockReturnValue(configWithoutDraft);

      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'gh --version') return 'gh version 2.0.0\n';
        if (cmd.startsWith('git checkout')) return '';
        if (cmd === 'git status --porcelain') return '';
        if (cmd.startsWith('git push')) return '';
        if (cmd === 'gh pr view --json url') throw new Error('no PR');
        if (cmd.includes('gh pr create')) {
          // Options should override config
          expect(cmd).toContain('--draft');
          return 'https://github.com/owner/repo/pull/123\n';
        }
        if (cmd.includes('git remote')) return 'https://github.com/owner/repo.git\n';
        return '';
      });

      const result = await createPullRequest(mockStoryPath, mockSdlcRoot, { draft: true });

      expect(result.success).toBe(true);
    });
  });
});

describe('getSourceCodeChanges', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return source files from git diff output', async () => {
    const { getSourceCodeChanges } = await import('./review.js');
    const { spawnSync } = await import('child_process');

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'src/core/story.ts\nsrc/agents/review.ts\n',
      stderr: '',
      pid: 123,
      output: ['', 'src/core/story.ts\nsrc/agents/review.ts\n', ''],
      signal: null,
    } as any);

    const result = getSourceCodeChanges('/test/dir');

    expect(result).toEqual(['src/core/story.ts', 'src/agents/review.ts']);
    expect(spawnSync).toHaveBeenCalledWith(
      'git',
      ['diff', '--name-only', 'HEAD~1'],
      {
        cwd: '/test/dir',
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  });

  it('should filter out test files', async () => {
    const { getSourceCodeChanges } = await import('./review.js');
    const { spawnSync } = await import('child_process');

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'src/core/story.ts\nsrc/core/story.test.ts\nsrc/agents/review.spec.ts\n',
      stderr: '',
      pid: 123,
      output: ['', 'src/core/story.ts\nsrc/core/story.test.ts\nsrc/agents/review.spec.ts\n', ''],
      signal: null,
    } as any);

    const result = getSourceCodeChanges('/test/dir');

    expect(result).toEqual(['src/core/story.ts']);
  });

  it('should filter out story files', async () => {
    const { getSourceCodeChanges } = await import('./review.js');
    const { spawnSync } = await import('child_process');

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'src/core/story.ts\n.ai-sdlc/stories/S-0001/story.md\n',
      stderr: '',
      pid: 123,
      output: ['', 'src/core/story.ts\n.ai-sdlc/stories/S-0001/story.md\n', ''],
      signal: null,
    } as any);

    const result = getSourceCodeChanges('/test/dir');

    expect(result).toEqual(['src/core/story.ts']);
  });

  it('should handle empty git diff output', async () => {
    const { getSourceCodeChanges } = await import('./review.js');
    const { spawnSync } = await import('child_process');

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 123,
      output: ['', '', ''],
      signal: null,
    } as any);

    const result = getSourceCodeChanges('/test/dir');

    expect(result).toEqual([]);
  });

  it('should return unknown if git command fails', async () => {
    const { getSourceCodeChanges } = await import('./review.js');
    const { spawnSync } = await import('child_process');

    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'fatal: not a git repository',
      pid: 123,
      output: ['', '', 'fatal: not a git repository'],
      signal: null,
    } as any);

    const result = getSourceCodeChanges('/test/dir');

    expect(result).toEqual(['unknown']);
  });

  it('should return unknown if git throws exception', async () => {
    const { getSourceCodeChanges } = await import('./review.js');
    const { spawnSync } = await import('child_process');

    vi.mocked(spawnSync).mockImplementation(() => {
      throw new Error('ENOENT: git command not found');
    });

    const result = getSourceCodeChanges('/test/dir');

    expect(result).toEqual(['unknown']);
  });

  it('should only include source file extensions', async () => {
    const { getSourceCodeChanges } = await import('./review.js');
    const { spawnSync } = await import('child_process');

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'src/file.ts\nsrc/file.tsx\nsrc/file.js\nsrc/file.jsx\nREADME.md\npackage.json\n',
      stderr: '',
      pid: 123,
      output: ['', 'src/file.ts\nsrc/file.tsx\nsrc/file.js\nsrc/file.jsx\nREADME.md\npackage.json\n', ''],
      signal: null,
    } as any);

    const result = getSourceCodeChanges('/test/dir');

    expect(result).toEqual(['src/file.ts', 'src/file.tsx', 'src/file.js', 'src/file.jsx']);
  });
});

describe('Pre-check Gate Logic', () => {
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
      implementation_retry_count: 0,
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
    implementation: {
      maxRetries: 3,
      maxRetriesUpperBound: 10,
    },
    defaultLabels: [],
    theme: 'auto',
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
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
  });

  it('should return RECOVERY decision when no source changes and retry count < max', async () => {
    const { spawnSync } = await import('child_process');

    // Mock git diff to return no source files
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '.ai-sdlc/stories/S-0001/story.md\n',
      stderr: '',
      pid: 123,
      output: ['', '.ai-sdlc/stories/S-0001/story.md\n', ''],
      signal: null,
    } as any);

    const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

    expect(result.success).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.decision).toBe(ReviewDecision.RECOVERY);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('critical');
    expect(result.issues[0].category).toBe('implementation');
    expect(result.issues[0].description).toContain('No source code modifications detected');

    // Verify that implementation_complete was reset to false
    expect(storyModule.updateStoryField).toHaveBeenCalledWith(
      expect.anything(),
      'implementation_complete',
      false
    );

    // Verify that last_restart_reason was set
    expect(storyModule.updateStoryField).toHaveBeenCalledWith(
      expect.anything(),
      'last_restart_reason',
      'No source code changes detected. Implementation wrote documentation only.'
    );

    // Verify LLM reviews were NOT called
    expect(clientModule.runAgentQuery).not.toHaveBeenCalled();
  });

  it('should return FAILED decision when no source changes and retry count >= max', async () => {
    const { spawnSync } = await import('child_process');

    // Mock story with retry count at max
    const storyAtMax = {
      ...mockStory,
      frontmatter: {
        ...mockStory.frontmatter,
        implementation_retry_count: 3,
      },
    };
    vi.mocked(storyModule.parseStory).mockReturnValue(storyAtMax);

    // Mock git diff to return no source files
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '.ai-sdlc/stories/S-0001/story.md\n',
      stderr: '',
      pid: 123,
      output: ['', '.ai-sdlc/stories/S-0001/story.md\n', ''],
      signal: null,
    } as any);

    const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

    expect(result.success).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.decision).toBe(ReviewDecision.FAILED);
    expect(result.severity).toBe(ReviewSeverity.CRITICAL);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('blocker');
    expect(result.issues[0].category).toBe('implementation');
    expect(result.issues[0].description).toContain('no source code was modified');
    expect(result.issues[0].description).toContain('Manual intervention required');
    expect(result.issues[0].suggestedFix).toBeTruthy();

    // Verify LLM reviews were NOT called
    expect(clientModule.runAgentQuery).not.toHaveBeenCalled();
  });

  it('should proceed to normal review flow when source changes exist', async () => {
    const { spawnSync } = await import('child_process');
    const { spawn } = await import('child_process');

    // Mock git diff to return source files
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'src/core/story.ts\nsrc/agents/review.ts\n',
      stderr: '',
      pid: 123,
      output: ['', 'src/core/story.ts\nsrc/agents/review.ts\n', ''],
      signal: null,
    } as any);

    // Mock spawn for build/test commands
    vi.mocked(spawn).mockImplementation(((command: string, args: string[]) => {
      const mockProcess: any = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10); // Success
          }
        }),
      };

      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('All tests passed\n'));
        }
      }, 5);

      return mockProcess;
    }) as any);

    // Mock LLM reviews to return approvals
    vi.mocked(clientModule.runAgentQuery).mockResolvedValue(
      '{"passed": true, "issues": []}'
    );

    const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

    // Should proceed to normal review flow (not early return)
    expect(result.decision).not.toBe(ReviewDecision.RECOVERY);

    // Verify LLM review WAS called (1 unified review instead of 3)
    expect(clientModule.runAgentQuery).toHaveBeenCalledTimes(1);
  });

  it('should fail open when git command fails (assume changes exist)', async () => {
    const { spawnSync } = await import('child_process');
    const { spawn } = await import('child_process');

    // Mock git diff to fail
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'fatal: not a git repository',
      pid: 123,
      output: ['', '', 'fatal: not a git repository'],
      signal: null,
    } as any);

    // Mock spawn for build/test commands
    vi.mocked(spawn).mockImplementation(((command: string, args: string[]) => {
      const mockProcess: any = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('Success\n'));
        }
      }, 5);

      return mockProcess;
    }) as any);

    // Mock LLM reviews
    vi.mocked(clientModule.runAgentQuery).mockResolvedValue(
      '{"passed": true, "issues": []}'
    );

    const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

    // Should proceed to normal review (fail open, not blocked)
    expect(result.decision).not.toBe(ReviewDecision.RECOVERY);
    expect(clientModule.runAgentQuery).toHaveBeenCalled();
  });
});

describe('Unified Collaborative Review', () => {
  describe('deriveIndividualPassFailFromPerspectives', () => {
    it('should export deriveIndividualPassFailFromPerspectives function', () => {
      expect(deriveIndividualPassFailFromPerspectives).toBeDefined();
      expect(typeof deriveIndividualPassFailFromPerspectives).toBe('function');
    });

    it('should return all pass when no blocker/critical issues', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'major',
          category: 'code_quality',
          description: 'Minor issue',
          perspectives: ['code', 'security'],
        },
        {
          severity: 'minor',
          category: 'style',
          description: 'Style issue',
          perspectives: ['code'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(true);
      expect(result.poReviewPassed).toBe(true);
    });

    it('should fail code perspective when blocker issue flagged for code', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'blocker',
          category: 'testing',
          description: 'No tests',
          perspectives: ['code'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      expect(result.codeReviewPassed).toBe(false);
      expect(result.securityReviewPassed).toBe(true);
      expect(result.poReviewPassed).toBe(true);
    });

    it('should fail security perspective when critical issue flagged for security', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'critical',
          category: 'security',
          description: 'SQL injection vulnerability',
          perspectives: ['security'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(false);
      expect(result.poReviewPassed).toBe(true);
    });

    it('should fail PO perspective when blocker issue flagged for po', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'blocker',
          category: 'requirements',
          description: 'Acceptance criteria not met',
          perspectives: ['po'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(true);
      expect(result.poReviewPassed).toBe(false);
    });

    it('should fail multiple perspectives when issue affects them', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'blocker',
          category: 'implementation',
          description: 'No implementation exists',
          perspectives: ['code', 'security', 'po'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      expect(result.codeReviewPassed).toBe(false);
      expect(result.securityReviewPassed).toBe(false);
      expect(result.poReviewPassed).toBe(false);
    });

    it('should handle issues without perspectives field (backward compatibility)', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'blocker',
          category: 'testing',
          description: 'No tests',
          // No perspectives field
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      // Without perspectives, all should pass (no issues attributed to them)
      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(true);
      expect(result.poReviewPassed).toBe(true);
    });

    it('should handle empty issues array', () => {
      const result = deriveIndividualPassFailFromPerspectives([]);

      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(true);
      expect(result.poReviewPassed).toBe(true);
    });

    it('should only fail on blocker/critical, not major/minor', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'major',
          category: 'code_quality',
          description: 'Major issue',
          perspectives: ['code'],
        },
        {
          severity: 'minor',
          category: 'security',
          description: 'Minor security issue',
          perspectives: ['security'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      // Major/minor don't fail perspectives
      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(true);
      expect(result.poReviewPassed).toBe(true);
    });

    it('should handle mixed severity issues correctly', () => {
      const issues: ReviewIssue[] = [
        {
          severity: 'major',
          category: 'style',
          description: 'Style issue',
          perspectives: ['code'],
        },
        {
          severity: 'critical',
          category: 'security',
          description: 'Security flaw',
          perspectives: ['security'],
        },
        {
          severity: 'minor',
          category: 'documentation',
          description: 'Missing docs',
          perspectives: ['po'],
        },
      ];

      const result = deriveIndividualPassFailFromPerspectives(issues);

      // Only security has critical issue
      expect(result.codeReviewPassed).toBe(true);
      expect(result.securityReviewPassed).toBe(false);
      expect(result.poReviewPassed).toBe(true);
    });
  });

  describe('Unified review integration', () => {
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
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
    });

    it('should parse unified review response with perspectives', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10);
            }
          }),
        };
        return mockProcess;
      }) as any);

      // Mock unified review response with perspectives
      const unifiedResponse = JSON.stringify({
        passed: false,
        issues: [
          {
            severity: 'blocker',
            category: 'implementation',
            description: 'No implementation exists',
            perspectives: ['code', 'security', 'po'],
          },
          {
            severity: 'critical',
            category: 'testing',
            description: 'No tests written',
            perspectives: ['code'],
          },
        ],
      });

      vi.mocked(clientModule.runAgentQuery).mockResolvedValue(unifiedResponse);

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].perspectives).toEqual(['code', 'security', 'po']);
      expect(result.issues[1].perspectives).toEqual(['code']);
    });

    it('should make only 1 LLM call for unified review', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10);
            }
          }),
        };
        return mockProcess;
      }) as any);

      vi.mocked(clientModule.runAgentQuery).mockResolvedValue('{"passed": true, "issues": []}');

      await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Should call LLM only once (unified review), not 3 times
      expect(clientModule.runAgentQuery).toHaveBeenCalledTimes(1);
    });

    it('should derive correct pass/fail for each perspective', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10);
            }
          }),
        };
        return mockProcess;
      }) as any);

      // Security has critical issue, others don't
      const unifiedResponse = JSON.stringify({
        passed: false,
        issues: [
          {
            severity: 'critical',
            category: 'security',
            description: 'SQL injection vulnerability',
            perspectives: ['security'],
          },
        ],
      });

      vi.mocked(clientModule.runAgentQuery).mockResolvedValue(unifiedResponse);

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Parse the review history to check derived values
      expect(vi.mocked(storyModule.appendReviewHistory)).toHaveBeenCalled();
      const reviewAttempt = vi.mocked(storyModule.appendReviewHistory).mock.calls[0][1];

      expect(reviewAttempt.codeReviewPassed).toBe(true);
      expect(reviewAttempt.securityReviewPassed).toBe(false);
      expect(reviewAttempt.poReviewPassed).toBe(true);
    });
  });
});
