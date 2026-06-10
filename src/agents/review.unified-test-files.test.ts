// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

describe('Unified Collaborative Review', () => {
  describe('hasTestFiles helper', () => {
    it('should detect test files with .test. pattern', () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/config.ts\nsrc/config.test.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const result = hasTestFiles('/test/project');
      expect(result).toBe(true);
    });

    it('should detect test files with .spec. pattern', () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/utils.ts\nsrc/utils.spec.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const result = hasTestFiles('/test/project');
      expect(result).toBe(true);
    });

    it('should detect test files in __tests__/ directory', () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/feature.ts\n__tests__/feature.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const result = hasTestFiles('/test/project');
      expect(result).toBe(true);
    });

    it('should return false when no test files exist', () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('src/calculator.ts\nsrc/utils.ts\n'),
        stderr: Buffer.from(''),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const result = hasTestFiles('/test/project');
      expect(result).toBe(false);
    });

    it('should fail open (return true) when git command fails', () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from('git error'),
        output: [],
        pid: 1,
        signal: null,
      } as any);

      const result = hasTestFiles('/test/project');
      // Should fail open to avoid false blocks
      expect(result).toBe(true);
    });
  });

  describe('missing tests blocker', () => {
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

    it('should block review when no test files exist in implementation', async () => {
      // Mock git diff to show source changes but no test files
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'diff') {
          const stdout = args?.includes('HEAD~1')
            ? 'src/calculator.ts\nsrc/utils.ts\n'  // Source files only, no tests
            : '';
          return {
            status: 0,
            stdout: Buffer.from(stdout),
            stderr: Buffer.from(''),
            output: [],
            pid: 1,
            signal: null,
          } as any;
        }
        return {
          status: 0,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
          output: [],
          pid: 1,
          signal: null,
        } as any;
      });

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Should reject with blocker
      expect(result.decision).toBe(ReviewDecision.REJECTED);
      expect(result.severity).toBe(ReviewSeverity.CRITICAL);

      // Should have testing category blocker
      const noTestsIssue = result.issues.find(i =>
        i.category === 'testing' && i.description.includes('No tests found')
      );
      expect(noTestsIssue).toBeDefined();
      expect(noTestsIssue?.severity).toBe('blocker');
      expect(noTestsIssue?.suggestedFix).toContain('Add test files');
    });

    it('should proceed with review when test files exist', async () => {
      // Mock git diff to show both source and test files
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'diff') {
          const stdout = args?.includes('HEAD~1')
            ? 'src/calculator.ts\nsrc/calculator.test.ts\n'  // Source + test files
            : '';
          return {
            status: 0,
            stdout: Buffer.from(stdout),
            stderr: Buffer.from(''),
            output: [],
            pid: 1,
            signal: null,
          } as any;
        }
        return {
          status: 0,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
          output: [],
          pid: 1,
          signal: null,
        } as any;
      });

      // Mock spawn for build/test execution
      vi.mocked(spawn).mockImplementation((() => {
        const mockProcess: any = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              process.nextTick(() => callback(0)); // Pass
            }
          }),
        };
        return mockProcess;
      }) as any);

      // Mock LLM response
      vi.mocked(clientModule.runAgentQuery).mockResolvedValue('{"passed": true, "issues": []}');

      const result = await runReviewAgent(mockStoryPath, mockWorkingDir);

      // Should not have "No tests found" blocker
      const noTestsIssue = result.issues.find(i =>
        i.description.includes('No tests found')
      );
      expect(noTestsIssue).toBeUndefined();
    });
  });
});
