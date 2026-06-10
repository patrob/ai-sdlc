import * as cp from 'child_process';
import * as fs from 'fs';
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

import {GitWorktreeService } from './worktree.js';

// Mock child_process and fs
vi.mock('child_process');
vi.mock('fs');

describe('GitWorktreeService', () => {
  let service: GitWorktreeService;
  const projectRoot = '/test/project';
  const worktreeBasePath = '/test/project/.ai-sdlc/worktrees';

  beforeEach(() => {
    service = new GitWorktreeService(projectRoot, worktreeBasePath);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  describe('remove', () => {
    it('executes correct git worktree remove command', () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      service.remove('/test/project/.ai-sdlc/worktrees/S-0029-test');

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', '/test/project/.ai-sdlc/worktrees/S-0029-test'],
        expect.objectContaining({
          cwd: projectRoot,
          encoding: 'utf-8',
          shell: false,
        })
      );
    });

    it('throws error for non-existent worktree', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: "fatal: '/path/to/worktree' is not a working tree",
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() =>
        service.remove('/path/to/worktree')
      ).toThrow('Worktree not found');
    });

    it('throws error for worktree with uncommitted changes', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: "fatal: cannot remove worktree: contains modified or untracked files",
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() =>
        service.remove('/path/to/worktree')
      ).toThrow('Worktree has uncommitted changes');
    });

    it('throws generic error for other git failures', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'fatal: some other error',
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() =>
        service.remove('/path/to/worktree')
      ).toThrow('Failed to remove worktree');
    });

    it('succeeds for valid worktree removal', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      // Should not throw
      expect(() => service.remove('/test/worktree')).not.toThrow();
    });
  });

  describe('findByStoryId', () => {
    it('returns worktree when found', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: `worktree /test/project
HEAD abc123
branch refs/heads/main

worktree /test/project/.ai-sdlc/worktrees/S-0029-test-story
HEAD def456
branch refs/heads/ai-sdlc/S-0029-test-story

`,
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const result = service.findByStoryId('S-0029');
      expect(result).toBeDefined();
      expect(result?.storyId).toBe('S-0029');
      expect(result?.path).toBe('/test/project/.ai-sdlc/worktrees/S-0029-test-story');
    });

    it('returns undefined when not found', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: `worktree /test/project
HEAD abc123
branch refs/heads/main

`,
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.findByStoryId('S-0099');
      expect(result).toBeUndefined();
    });

    it('returns correct worktree when multiple exist', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: `worktree /test/project
HEAD abc123
branch refs/heads/main

worktree /test/project/.ai-sdlc/worktrees/S-0029-first
HEAD def456
branch refs/heads/ai-sdlc/S-0029-first

worktree /test/project/.ai-sdlc/worktrees/S-0030-second
HEAD ghi789
branch refs/heads/ai-sdlc/S-0030-second

`,
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const result = service.findByStoryId('S-0030');
      expect(result).toBeDefined();
      expect(result?.storyId).toBe('S-0030');
      expect(result?.path).toContain('S-0030-second');
    });
  });

  describe('hasUnpushedCommits', () => {
    it('returns false when no remote tracking branch exists', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 128,
        stdout: '',
        stderr: "fatal: no upstream configured for branch 'ai-sdlc/S-0029-test'",
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.hasUnpushedCommits('/test/project/.ai-sdlc/worktrees/S-0029-test');
      expect(result.hasUnpushed).toBe(false);
      expect(result.count).toBe(0);
    });

    it('returns false and count 0 when no unpushed commits', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '0',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.hasUnpushedCommits('/test/project/.ai-sdlc/worktrees/S-0029-test');
      expect(result.hasUnpushed).toBe(false);
      expect(result.count).toBe(0);
    });

    it('returns true and correct count when unpushed commits exist', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '3',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.hasUnpushedCommits('/test/project/.ai-sdlc/worktrees/S-0029-test');
      expect(result.hasUnpushed).toBe(true);
      expect(result.count).toBe(3);
    });

    it('handles git command errors gracefully', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'fatal: some error',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.hasUnpushedCommits('/test/project/.ai-sdlc/worktrees/S-0029-test');
      expect(result.hasUnpushed).toBe(false);
      expect(result.count).toBe(0);
    });
  });

  describe('branchExistsOnRemote', () => {
    it('returns true when branch exists on remote', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: 'abc123  refs/heads/ai-sdlc/S-0029-test',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.branchExistsOnRemote('ai-sdlc/S-0029-test');
      expect(result).toBe(true);
    });

    it('returns false when branch does not exist on remote', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.branchExistsOnRemote('ai-sdlc/S-0029-test');
      expect(result).toBe(false);
    });

    it('returns false when no remote configured', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 128,
        stdout: '',
        stderr: 'fatal: could not read from remote repository',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.branchExistsOnRemote('ai-sdlc/S-0029-test');
      expect(result).toBe(false);
    });
  });

  describe('getCommitCount', () => {
    it('returns correct commit count for worktree', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '15',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.getCommitCount('/test/project/.ai-sdlc/worktrees/S-0029-test');
      expect(result).toBe(15);
    });

    it('returns 0 for new worktree with no commits', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '0',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.getCommitCount('/test/project/.ai-sdlc/worktrees/S-0029-test');
      expect(result).toBe(0);
    });

    it('returns 0 on error', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 128,
        stdout: '',
        stderr: 'fatal: not a git repository',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.getCommitCount('/test/project/.ai-sdlc/worktrees/S-0029-test');
      expect(result).toBe(0);
    });
  });

  describe('deleteBranch', () => {
    it('deletes local branch successfully', () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      service.deleteBranch('ai-sdlc/S-0029-test', true);

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'git',
        ['branch', '-D', 'ai-sdlc/S-0029-test'],
        expect.objectContaining({
          cwd: projectRoot,
          shell: false,
        })
      );
    });

    it('does not throw when branch does not exist', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: "error: branch 'ai-sdlc/S-0029-test' not found",
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() => service.deleteBranch('ai-sdlc/S-0029-test', true)).not.toThrow();
    });

    it('throws on other git errors', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'fatal: some other error',
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() => service.deleteBranch('ai-sdlc/S-0029-test', true)).toThrow('Failed to delete branch');
    });
  });

  describe('deleteRemoteBranch', () => {
    it('deletes remote branch successfully', () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      service.deleteRemoteBranch('ai-sdlc/S-0029-test');

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'git',
        ['push', 'origin', '--delete', 'ai-sdlc/S-0029-test'],
        expect.objectContaining({
          cwd: projectRoot,
          shell: false,
        })
      );
    });

    it('does not throw when remote branch does not exist', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: "error: unable to delete 'ai-sdlc/S-0029-test': remote ref does not exist",
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() => service.deleteRemoteBranch('ai-sdlc/S-0029-test')).not.toThrow();
    });

    it('throws on other git errors', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'fatal: could not read from remote repository',
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() => service.deleteRemoteBranch('ai-sdlc/S-0029-test')).toThrow('Failed to delete remote branch');
    });
  });

  describe('remove with force parameter', () => {
    it('adds --force flag when force is true', () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      service.remove('/test/project/.ai-sdlc/worktrees/S-0029-test', true);

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', '--force', '/test/project/.ai-sdlc/worktrees/S-0029-test'],
        expect.objectContaining({
          cwd: projectRoot,
          shell: false,
        })
      );
    });

    it('does not add --force flag when force is false', () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      service.remove('/test/project/.ai-sdlc/worktrees/S-0029-test', false);

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', '/test/project/.ai-sdlc/worktrees/S-0029-test'],
        expect.objectContaining({
          cwd: projectRoot,
          shell: false,
        })
      );
    });
  });
});
