 
 
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

    // Mock git diff to return source files AND test files (required by hasTestFiles pre-check)
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'src/core/story.ts\nsrc/agents/review.ts\nsrc/agents/review.test.ts\n',
      stderr: '',
      pid: 123,
      output: ['', 'src/core/story.ts\nsrc/agents/review.ts\nsrc/agents/review.test.ts\n', ''],
      signal: null,
    } as any);

    // Mock spawn for build/test commands
     
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    vi.mocked(spawn).mockImplementation(((command: string, args: string[]) => {
      const mockProcess: any = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            process.nextTick(() => callback(0)); // Success
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
     
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    vi.mocked(spawn).mockImplementation(((command: string, args: string[]) => {
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
          stdoutCallback(Buffer.from('Success\n'));
        }
      });

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
