import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { runReviewAgent, validateTDDCycles, generateTDDIssues } from './review.js';
import * as storyModule from '../core/story.js';
import * as clientModule from '../core/client.js';
import * as configModule from '../core/config.js';
import { ReviewDecision, ReviewSeverity, Config, TDDTestCycle, ReviewIssue, Story } from '../types/index.js';
import { spawn } from 'child_process';
import fs from 'fs';

// Mock external dependencies
vi.mock('child_process');
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

      // Verify reviews proceeded
      expect(result.changesMade).toContain('Verification passed - proceeding with code/security/PO reviews');
      expect(clientModule.runAgentQuery).toHaveBeenCalledTimes(3); // Code, Security, PO reviews
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

  describe('edge cases', () => {
    it('should skip verification if no testCommand configured', async () => {
      const configWithoutTests = { ...mockConfig, testCommand: undefined };
      vi.mocked(configModule.loadConfig).mockResolvedValue(configWithoutTests);
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
