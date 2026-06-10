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

describe('waitForChecks', () => {
  const mockWorkingDir = '/test/project';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
  });

  it('should return allPassed: true when all checks pass', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify([
        { name: 'build', state: 'SUCCESS' },
        { name: 'test', state: 'SUCCESS' },
      ]),
      stderr: '',
      output: [],
      pid: 1,
      signal: null,
    } as any);

    const result = await waitForChecks('https://github.com/test/repo/pull/1', mockWorkingDir);

    expect(result.allPassed).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.checks).toHaveLength(2);
  });

  it('should return allPassed: false when checks fail', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify([
        { name: 'build', state: 'SUCCESS' },
        { name: 'test', state: 'FAILURE' },
      ]),
      stderr: '',
      output: [],
      pid: 1,
      signal: null,
    } as any);

    const result = await waitForChecks('https://github.com/test/repo/pull/1', mockWorkingDir);

    expect(result.allPassed).toBe(false);
    expect(result.error).toContain('test');
  });

  it('should return allPassed: true when no checks exist', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      output: [],
      pid: 1,
      signal: null,
    } as any);

    const result = await waitForChecks('https://github.com/test/repo/pull/1', mockWorkingDir);

    expect(result.allPassed).toBe(true);
    expect(result.checks).toHaveLength(0);
  });

  it('should extract PR number from URL', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '[]',
      stderr: '',
      output: [],
      pid: 1,
      signal: null,
    } as any);

    await waitForChecks('https://github.com/test/repo/pull/123', mockWorkingDir);

    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      ['pr', 'checks', '123', '--json', 'name,state'],
      expect.any(Object)
    );
  });

  it('should return error for invalid PR identifier', async () => {
    const result = await waitForChecks('invalid-pr', mockWorkingDir);

    expect(result.allPassed).toBe(false);
    expect(result.error).toContain('Invalid PR identifier');
  });

  it('should handle gh CLI errors', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'not authenticated',
      output: [],
      pid: 1,
      signal: null,
    } as any);

    const result = await waitForChecks('https://github.com/test/repo/pull/1', mockWorkingDir);

    expect(result.allPassed).toBe(false);
    expect(result.error).toContain('gh pr checks failed');
  });
});

describe('mergePullRequest', () => {
  const mockWorkingDir = '/test/project';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
  });

  it('should return success when merge succeeds', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'Merged pull request #1',
      stderr: '',
      output: [],
      pid: 1,
      signal: null,
    } as any);

    const result = await mergePullRequest('https://github.com/test/repo/pull/1', mockWorkingDir);

    expect(result.success).toBe(true);
    expect(result.merged).toBe(true);
  });

  it('should use squash strategy by default', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'Merged',
      stderr: '',
      output: [],
      pid: 1,
      signal: null,
    } as any);

    await mergePullRequest('https://github.com/test/repo/pull/1', mockWorkingDir);

    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['pr', 'merge', '1', '--squash']),
      expect.any(Object)
    );
  });

  it('should use specified merge strategy', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'Merged',
      stderr: '',
      output: [],
      pid: 1,
      signal: null,
    } as any);

    await mergePullRequest('https://github.com/test/repo/pull/1', mockWorkingDir, { strategy: 'rebase' });

    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--rebase']),
      expect.any(Object)
    );
  });

  it('should include --delete-branch flag by default', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'Merged',
      stderr: '',
      output: [],
      pid: 1,
      signal: null,
    } as any);

    await mergePullRequest('https://github.com/test/repo/pull/1', mockWorkingDir);

    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--delete-branch']),
      expect.any(Object)
    );
  });

  it('should not include --delete-branch when disabled', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: 'Merged',
      stderr: '',
      output: [],
      pid: 1,
      signal: null,
    } as any);

    await mergePullRequest('https://github.com/test/repo/pull/1', mockWorkingDir, { deleteBranchAfterMerge: false });

    const calls = vi.mocked(spawnSync).mock.calls;
    const ghCall = calls.find(call => call[0] === 'gh');
    expect(ghCall?.[1]).not.toContain('--delete-branch');
  });

  it('should handle merge conflicts', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'conflict detected',
      output: [],
      pid: 1,
      signal: null,
    } as any);

    const result = await mergePullRequest('https://github.com/test/repo/pull/1', mockWorkingDir);

    expect(result.success).toBe(false);
    expect(result.merged).toBe(false);
    expect(result.error).toContain('conflict');
  });

  it('should return success if already merged', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'Pull request #1 was already merged',
      output: [],
      pid: 1,
      signal: null,
    } as any);

    const result = await mergePullRequest('https://github.com/test/repo/pull/1', mockWorkingDir);

    expect(result.success).toBe(true);
    expect(result.merged).toBe(true);
  });

  it('should return error for invalid strategy', async () => {
    const result = await mergePullRequest('https://github.com/test/repo/pull/1', mockWorkingDir, { strategy: 'invalid' as any });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid merge strategy');
  });
});
