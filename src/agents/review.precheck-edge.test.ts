import { execSync,spawn, spawnSync } from 'child_process';
import fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { beforeEach, describe, expect, it, Mock,vi } from 'vitest';

import * as clientModule from '../core/client.js';
import * as configModule from '../core/config.js';
import * as storyModule from '../core/story.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { type Config, ContentType,ReviewDecision, ReviewIssue, ReviewSeverity, Story, TDDTestCycle } from '../types/index.js';
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

  describe('LLM response parsing', () => {
    it('should handle null line values in LLM response gracefully', async () => {
      // This test reproduces the ZodError: "Invalid input: expected number, received null"
      // at path ["issues", 3, "line"] when the LLM returns null for optional fields

      // Mock spawnSync (for hasTestFiles check) - tests exist
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/index.ts\nsrc/index.test.ts\n'),
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
              process.nextTick(() => callback(0)); // Success
            }
          }),
        };
        return mockProcess;
      }) as any);

      // Mock execSync to make gh CLI appear unavailable (skips PR creation)
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('gh')) {
          throw new Error('gh not installed');
        }
        return '' as any;
      });

      // Mock LLM to return JSON with null line values (as observed in real usage)
      // Note: issues are 'major'/'minor' not 'blocker'/'critical' so review passes
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
              // Build passes, test fails with no output
              const exitCode = isTestCommand ? 1 : 0;
              process.nextTick(() => callback(exitCode));
            }
          }),
        };

        // No output - simulate silent failure
        if (!isTestCommand) {
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

      expect(result.passed).toBe(false);
      expect(result.issues[0].description).toContain('Tests must pass');
      // Should not crash on empty output
      expect(result.issues[0].description).toBeDefined();
    });

    it('should handle both build and test failures', async () => {
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
              process.nextTick(() => callback(1)); // All fail
            }
          }),
        };

        process.nextTick(() => {
          const stderrCallback = mockProcess.stderr.on.mock.calls.find((call: any) => call[0] === 'data')?.[1];
          if (stderrCallback) {
            stderrCallback(Buffer.from('Error occurred\n'));
          }
        });

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
