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

describe('getSourceCodeChanges', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return source files from git diff output', async () => {
    const { getSourceCodeChanges } = await import('./review.js');
    const { spawnSync } = await import('child_process');

    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        // git rev-parse --verify main
        status: 0,
        stdout: 'refs/heads/main\n',
        stderr: '',
        pid: 123,
        output: ['', 'refs/heads/main\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
        // git merge-base main HEAD
        status: 0,
        stdout: 'abc123\n',
        stderr: '',
        pid: 123,
        output: ['', 'abc123\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
        // git diff --name-only abc123
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
      ['diff', '--name-only', 'abc123'],
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

    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'refs/heads/main\n',
        stderr: '',
        pid: 123,
        output: ['', 'refs/heads/main\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'abc123\n',
        stderr: '',
        pid: 123,
        output: ['', 'abc123\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
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

    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'refs/heads/main\n',
        stderr: '',
        pid: 123,
        output: ['', 'refs/heads/main\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'abc123\n',
        stderr: '',
        pid: 123,
        output: ['', 'abc123\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
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

    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'refs/heads/main\n',
        stderr: '',
        pid: 123,
        output: ['', 'refs/heads/main\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'abc123\n',
        stderr: '',
        pid: 123,
        output: ['', 'abc123\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
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

    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'refs/heads/main\n',
        stderr: '',
        pid: 123,
        output: ['', 'refs/heads/main\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'abc123\n',
        stderr: '',
        pid: 123,
        output: ['', 'abc123\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
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

    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'refs/heads/main\n',
        stderr: '',
        pid: 123,
        output: ['', 'refs/heads/main\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'abc123\n',
        stderr: '',
        pid: 123,
        output: ['', 'abc123\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
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

  it('should detect code changes from earlier commits in multi-commit branch', async () => {
    const { getSourceCodeChanges } = await import('./review.js');
    const { spawnSync } = await import('child_process');

    // Scenario: Code committed earlier, HEAD is metadata-only commit
    // The merge-base comparison should still see the code changes
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'refs/heads/main\n',
        stderr: '',
        pid: 123,
        output: ['', 'refs/heads/main\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'abc123\n',
        stderr: '',
        pid: 123,
        output: ['', 'abc123\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
        // git diff shows code file from earlier commit + metadata from HEAD
        status: 0,
        stdout: 'src/fix.ts\n.ai-sdlc/stories/S-0001/story.md\n',
        stderr: '',
        pid: 123,
        output: ['', 'src/fix.ts\n.ai-sdlc/stories/S-0001/story.md\n', ''],
        signal: null,
      } as any);

    const result = getSourceCodeChanges('/test/dir');

    // Should detect the code file from earlier commit
    expect(result).toEqual(['src/fix.ts']);
  });

  it('should fall back to HEAD~1 when base branch does not exist', async () => {
    const { getSourceCodeChanges } = await import('./review.js');
    const { spawnSync } = await import('child_process');

    // Neither main nor master exists - should fall back to HEAD~1
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 1,
        stdout: '',
        stderr: 'fatal: Needed a single revision',
        pid: 123,
        output: ['', '', 'fatal: Needed a single revision'],
        signal: null,
      } as any)
      .mockReturnValueOnce({
        status: 1,
        stdout: '',
        stderr: 'fatal: Needed a single revision',
        pid: 123,
        output: ['', '', 'fatal: Needed a single revision'],
        signal: null,
      } as any)
      .mockReturnValueOnce({
        // git diff with HEAD~1 fallback
        status: 0,
        stdout: 'src/file.ts\n',
        stderr: '',
        pid: 123,
        output: ['', 'src/file.ts\n', ''],
        signal: null,
      } as any);

    const result = getSourceCodeChanges('/test/dir');

    expect(result).toEqual(['src/file.ts']);
    // Verify it fell back to HEAD~1
    expect(spawnSync).toHaveBeenLastCalledWith(
      'git',
      ['diff', '--name-only', 'HEAD~1'],
      expect.any(Object)
    );
  });

  it('should fall back to HEAD~1 when merge-base fails', async () => {
    const { getSourceCodeChanges } = await import('./review.js');
    const { spawnSync } = await import('child_process');

    // Base branch exists but merge-base fails (e.g., detached HEAD, no common ancestor)
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: 'refs/heads/main\n',
        stderr: '',
        pid: 123,
        output: ['', 'refs/heads/main\n', ''],
        signal: null,
      } as any)
      .mockReturnValueOnce({
        // merge-base fails
        status: 1,
        stdout: '',
        stderr: 'fatal: Not a valid object name main',
        pid: 123,
        output: ['', '', 'fatal: Not a valid object name main'],
        signal: null,
      } as any)
      .mockReturnValueOnce({
        // git diff with HEAD~1 fallback
        status: 0,
        stdout: 'src/file.ts\n',
        stderr: '',
        pid: 123,
        output: ['', 'src/file.ts\n', ''],
        signal: null,
      } as any);

    const result = getSourceCodeChanges('/test/dir');

    expect(result).toEqual(['src/file.ts']);
    expect(spawnSync).toHaveBeenLastCalledWith(
      'git',
      ['diff', '--name-only', 'HEAD~1'],
      expect.any(Object)
    );
  });
});
