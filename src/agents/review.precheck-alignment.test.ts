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

  describe('Test Alignment Pre-check', () => {
    it('should detect test alignment issues when tests pass but verify old behavior', async () => {
      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/config.ts\nsrc/config.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      // Mock build and tests passing (exit 0)
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              // Both build and tests pass
              process.nextTick(() => callback(0));
            }
          }),
        };

        process.nextTick(() => {
          const stdoutCallback = mockProcess.stdout.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stdoutCallback) {
            stdoutCallback(Buffer.from('Test Suites: 5 passed, 5 total\nTests:       12 passed, 12 total\n'));
          }
        });

        return mockProcess;
      }) as any);

      // Mock LLM to detect test alignment issue
      const llmResponse = JSON.stringify({
        passed: false,
        issues: [
          {
            severity: 'blocker',
            category: 'test_alignment',
            description: 'Test file src/core/config.test.ts expects synchronous behavior but production code is now async.\n\nThe test calls `loadConfig()` without await, expecting immediate return.\n\nProduction code signature changed to: `async function loadConfig(): Promise<Config>`',
            file: 'src/core/config.test.ts',
            line: 42,
            suggestedFix: 'Update test to: `const config = await loadConfig();` and mark test function as async.',
            perspectives: ['code'],
          },
        ],
      });

      vi.mocked(clientModule.runAgentQuery).mockResolvedValue(llmResponse);

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Verify: REJECTED with BLOCKER severity
      expect(result.success).toBe(true); // Agent executed successfully
      expect(result.passed).toBe(false); // Review did not pass
      expect(result.decision).toBe(ReviewDecision.REJECTED);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('blocker');
      expect(result.issues[0].category).toBe('test_alignment');
      expect(result.issues[0].description).toContain('synchronous behavior but production code is now async');
      expect(result.issues[0].file).toBe('src/core/config.test.ts');
    });

    it('should include specific misalignment details in rejection feedback', async () => {
      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/research.ts\nsrc/research.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      // Mock passing tests
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
            stdoutCallback(Buffer.from('Tests passed\n'));
          }
        });
        return mockProcess;
      }) as any);

      // Mock LLM detecting alignment issue with detailed feedback
      const llmResponse = JSON.stringify({
        passed: false,
        issues: [
          {
            severity: 'blocker',
            category: 'test_alignment',
            description: 'Test file src/agents/research.test.ts verifies OLD behavior.\n\nOLD: function returned string\nNEW: function returns Promise<string>\n\nTest assertion: expect(result).toBe("value") - this checks a Promise object, not the resolved value.',
            file: 'src/agents/research.test.ts',
            suggestedFix: 'Change to: const result = await myFunction(); expect(result).toBe("value");',
            perspectives: ['code'],
          },
        ],
      });

      vi.mocked(clientModule.runAgentQuery).mockResolvedValue(llmResponse);

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Verify feedback includes: test file name, old vs new behavior, suggested fix
      expect(result.issues[0].description).toContain('src/agents/research.test.ts');
      expect(result.issues[0].description).toContain('OLD:');
      expect(result.issues[0].description).toContain('NEW:');
      expect(result.issues[0].suggestedFix).toContain('await');
      expect(result.feedback).toContain('test_alignment');
    });

    it('should distinguish test failure from test misalignment', async () => {
      // Scenario A: Tests FAIL (exit code 1) - already tested elsewhere
      // Scenario B: Tests PASS but misaligned - this test

      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/feature.ts\nsrc/feature.test.ts\n'),
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
              process.nextTick(() => callback(0)); // Tests PASS
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

      // LLM detects misalignment
      const llmResponse = JSON.stringify({
        passed: false,
        issues: [
          {
            severity: 'blocker',
            category: 'test_alignment', // NOT 'testing'
            description: 'Tests pass but verify wrong behavior',
            perspectives: ['code'],
          },
        ],
      });

      vi.mocked(clientModule.runAgentQuery).mockResolvedValue(llmResponse);

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Verify: category is 'test_alignment', NOT 'testing'
      expect(result.issues[0].category).toBe('test_alignment');
      expect(result.issues[0].category).not.toBe('testing');

      // Verify: LLM was called (because tests passed, just misaligned)
      expect(clientModule.runAgentQuery).toHaveBeenCalled();
    });

    it('should proceed with review when tests pass and align', async () => {
      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/utils.ts\nsrc/utils.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      // Mock passing tests
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
            stdoutCallback(Buffer.from('Tests passed\n'));
          }
        });
        return mockProcess;
      }) as any);

      // LLM finds no alignment issues
      const llmResponse = JSON.stringify({
        passed: true,
        issues: [], // No issues at all
      });

      vi.mocked(clientModule.runAgentQuery).mockResolvedValue(llmResponse);

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Verify: Review proceeds normally (no early return)
      expect(result.passed).toBe(true);
      expect(result.decision).toBe(ReviewDecision.APPROVED);
      // Verify: No test_alignment issues created
      expect(result.issues.filter(i => i.category === 'test_alignment')).toHaveLength(0);
      // Verify: LLM review WAS called
      expect(clientModule.runAgentQuery).toHaveBeenCalled();
    });
  });
});
