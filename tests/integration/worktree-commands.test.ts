import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cp from 'child_process';
import * as fs from 'fs';
import path from 'path';

// Mock modules before importing the tested module
vi.mock('child_process');
vi.mock('fs');
vi.mock('ora', () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    text: '',
  }),
}));

// Import after mocks are set up
import { GitWorktreeService } from '../../src/core/worktree.js';

describe('Worktree Commands Integration', () => {
  const projectRoot = '/test/project';
  const worktreeBasePath = '/test/project/.ai-sdlc/worktrees';
  let service: GitWorktreeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitWorktreeService(projectRoot, worktreeBasePath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('list() integration', () => {
    it('parses porcelain output correctly for multiple worktrees', () => {
      const porcelainOutput = `worktree /test/project
HEAD abc123def456
branch refs/heads/main

worktree /test/project/.ai-sdlc/worktrees/S-0029-story-one
HEAD 111111222222
branch refs/heads/ai-sdlc/S-0029-story-one

worktree /test/project/.ai-sdlc/worktrees/S-0030-story-two
HEAD 333333444444
branch refs/heads/ai-sdlc/S-0030-story-two
detached

`;

      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: porcelainOutput,
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const worktrees = service.list();

      expect(worktrees).toHaveLength(2);
      expect(worktrees[0].storyId).toBe('S-0029');
      expect(worktrees[0].branch).toBe('ai-sdlc/S-0029-story-one');
      expect(worktrees[1].storyId).toBe('S-0030');
      expect(worktrees[1].branch).toBe('ai-sdlc/S-0030-story-two');
    });

    it('filters out worktrees outside basePath', () => {
      const porcelainOutput = `worktree /test/project
HEAD abc123
branch refs/heads/main

worktree /other/path/worktree
HEAD def456
branch refs/heads/feature

worktree /test/project/.ai-sdlc/worktrees/S-0029-test
HEAD ghi789
branch refs/heads/ai-sdlc/S-0029-test

`;

      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: porcelainOutput,
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const worktrees = service.list();

      expect(worktrees).toHaveLength(1);
      expect(worktrees[0].storyId).toBe('S-0029');
    });
  });

  describe('create() + remove() workflow', () => {
    it('create and remove follow expected git command patterns', () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Create worktree
      const worktreePath = service.create({
        storyId: 'S-0031',
        slug: 'worktree-commands',
        baseBranch: 'main',
      });

      expect(worktreePath).toBe(path.join(worktreeBasePath, 'S-0031-worktree-commands'));
      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'git',
        ['worktree', 'add', '-b', 'ai-sdlc/S-0031-worktree-commands', worktreePath, 'main'],
        expect.any(Object)
      );

      // Remove worktree
      service.remove(worktreePath);

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', worktreePath],
        expect.any(Object)
      );
    });
  });

  describe('error handling', () => {
    it('list throws descriptive error on git failure', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 128,
        stdout: '',
        stderr: 'fatal: not a git repository',
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() => service.list()).toThrow('Failed to list worktrees');
    });

    it('remove handles worktree not found gracefully', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: "fatal: '/nonexistent' is not a working tree",
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() => service.remove('/nonexistent')).toThrow('Worktree not found');
    });

    it('remove handles dirty worktree error', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'fatal: cannot remove worktree with modified or untracked files',
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() => service.remove('/dirty/worktree')).toThrow('Worktree has uncommitted changes');
    });
  });

  describe('branch name extraction', () => {
    it('extracts story ID with various formats', () => {
      const testCases = [
        { branch: 'ai-sdlc/S-0001-simple', expected: 'S-0001' },
        { branch: 'ai-sdlc/S-1234-with-dashes', expected: 'S-1234' },
        { branch: 'ai-sdlc/S-9999-long-story-name-here', expected: 'S-9999' },
        { branch: 'feature/not-ai-sdlc', expected: undefined },
        { branch: 'main', expected: undefined },
      ];

      for (const tc of testCases) {
        vi.spyOn(cp, 'spawnSync').mockReturnValue({
          status: 0,
          stdout: `worktree ${worktreeBasePath}/${tc.branch.replace('ai-sdlc/', '')}
HEAD abc123
branch refs/heads/${tc.branch}

`,
          stderr: '',
          output: [],
          pid: 0,
          signal: null,
        });
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);

        const worktrees = service.list();
        if (worktrees.length > 0) {
          expect(worktrees[0].storyId).toBe(tc.expected);
        }
      }
    });
  });
});
