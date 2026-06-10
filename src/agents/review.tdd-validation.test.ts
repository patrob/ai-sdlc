// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { execSync,spawn, spawnSync } from 'child_process';
import fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { beforeEach, describe, expect, it, Mock,vi } from 'vitest';

import * as clientModule from '../core/client.js';
import * as configModule from '../core/config.js';
import * as storyModule from '../core/story.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { type Config, ContentType,ReviewDecision, ReviewIssue, ReviewSeverity, Story, type TDDTestCycle } from '../types/index.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { createPullRequest, deriveIndividualPassFailFromPerspectives, determineEffectiveContentType, formatPRDescription, generateReviewSummary, generateTDDIssues, getConfigurationChanges, getDocumentationChanges, getSourceCodeChanges, getStoryFileURL, hasTestFiles, mergePullRequest,removeUnfinishedCheckboxes, runReviewAgent, truncatePRBody, validateTDDCycles, waitForChecks } from './review.js';

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

      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/feature.ts\nsrc/feature.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      // Mock spawn to simulate successful build/test
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              process.nextTick(() => callback(0)); // Success
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

      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/feature.ts\nsrc/feature.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      // Mock spawn to simulate successful build/test
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              process.nextTick(() => callback(0)); // Success
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
