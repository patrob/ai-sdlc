import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitWorktreeService } from './worktree.js';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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

  describe('path generation', () => {
    it('generates correct worktree path format', () => {
      const result = service.getWorktreePath('S-0029', 'core-worktree-implementation');
      expect(result).toBe(path.join(worktreeBasePath, 'S-0029-core-worktree-implementation'));
    });

    it('generates correct branch name format', () => {
      const result = service.getBranchName('S-0029', 'core-worktree-implementation');
      expect(result).toBe('ai-sdlc/S-0029-core-worktree-implementation');
    });
  });

  describe('detectBaseBranch', () => {
    it('returns "main" when it exists', () => {
      vi.spyOn(cp, 'spawnSync').mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[2] === 'main') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        }
        return { status: 1, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      const result = service.detectBaseBranch();
      expect(result).toBe('main');
    });

    it('returns "master" when main does not exist', () => {
      vi.spyOn(cp, 'spawnSync').mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[2] === 'main') {
          return { status: 1, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        }
        if (cmd === 'git' && args?.[0] === 'rev-parse' && args?.[2] === 'master') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        }
        return { status: 1, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      const result = service.detectBaseBranch();
      expect(result).toBe('master');
    });

    it('throws when neither main nor master exists', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() => service.detectBaseBranch()).toThrow('Could not detect base branch');
    });
  });

  describe('validateCanCreateWorktree', () => {
    it('returns valid:true for clean working directory', () => {
      // Mock isCleanWorkingDirectory to return true
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.validateCanCreateWorktree();
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns valid:false with error message for dirty working directory', () => {
      // Mock isCleanWorkingDirectory to return false (uncommitted changes)
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: 'M src/file.ts\n',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.validateCanCreateWorktree();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Uncommitted changes');
    });
  });

  describe('exists', () => {
    it('returns true when worktree directory exists', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const result = service.exists('/test/worktree/path');
      expect(result).toBe(true);
    });

    it('returns false when worktree directory does not exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = service.exists('/test/worktree/path');
      expect(result).toBe(false);
    });
  });

  describe('create', () => {
    it('executes correct git worktree command', () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      service.create({
        storyId: 'S-0029',
        slug: 'core-worktree-implementation',
        baseBranch: 'main',
      });

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'git',
        [
          'worktree',
          'add',
          '-b',
          'ai-sdlc/S-0029-core-worktree-implementation',
          path.join(worktreeBasePath, 'S-0029-core-worktree-implementation'),
          'main',
        ],
        expect.objectContaining({
          cwd: projectRoot,
          encoding: 'utf-8',
          shell: false,
        })
      );
    });

    it('returns worktree path on success', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = service.create({
        storyId: 'S-0029',
        slug: 'core-worktree-implementation',
        baseBranch: 'main',
      });

      expect(result).toBe(path.join(worktreeBasePath, 'S-0029-core-worktree-implementation'));
    });

    it('throws descriptive error when git command fails', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'fatal: git error',
        output: [],
        pid: 0,
        signal: null,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(() =>
        service.create({
          storyId: 'S-0029',
          slug: 'core-worktree-implementation',
          baseBranch: 'main',
        })
      ).toThrow('Failed to create worktree');
    });

    it('throws descriptive error when worktree path already exists', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      expect(() =>
        service.create({
          storyId: 'S-0029',
          slug: 'core-worktree-implementation',
          baseBranch: 'main',
        })
      ).toThrow('Worktree path already exists');
    });
  });

  describe('edge cases', () => {
    it('handles branch name already exists error', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: "fatal: a branch named 'ai-sdlc/S-0029-test' already exists",
        output: [],
        pid: 0,
        signal: null,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(() =>
        service.create({
          storyId: 'S-0029',
          slug: 'test',
          baseBranch: 'main',
        })
      ).toThrow('branch with this name already exists');
    });

    it('handles not a git repository error', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 128,
        stdout: '',
        stderr: 'fatal: not a git repository',
        output: [],
        pid: 0,
        signal: null,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(() =>
        service.create({
          storyId: 'S-0029',
          slug: 'test',
          baseBranch: 'main',
        })
      ).toThrow('Not a git repository');
    });
  });

  describe('list', () => {
    it('returns empty array when no worktrees exist', () => {
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

      const result = service.list();
      expect(result).toEqual([]);
    });

    it('returns worktrees within basePath', () => {
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

      const result = service.list();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: '/test/project/.ai-sdlc/worktrees/S-0029-test-story',
        branch: 'ai-sdlc/S-0029-test-story',
        storyId: 'S-0029',
        exists: true,
      });
    });

    it('extracts story ID from branch name', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: `worktree /test/project/.ai-sdlc/worktrees/S-0123-feature-name
HEAD abc123
branch refs/heads/ai-sdlc/S-0123-feature-name

`,
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const result = service.list();
      expect(result[0].storyId).toBe('S-0123');
    });

    it('sets storyId to undefined for non-standard branch names', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: `worktree /test/project/.ai-sdlc/worktrees/custom-branch
HEAD abc123
branch refs/heads/custom-branch

`,
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const result = service.list();
      expect(result[0].storyId).toBeUndefined();
    });

    it('indicates when worktree directory is missing', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: `worktree /test/project/.ai-sdlc/worktrees/S-0029-test
HEAD abc123
branch refs/heads/ai-sdlc/S-0029-test

`,
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = service.list();
      expect(result[0].exists).toBe(false);
    });

    it('throws error on git command failure', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'fatal: git error',
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() => service.list()).toThrow('Failed to list worktrees');
    });

    it('handles multiple worktrees', () => {
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

      const result = service.list();
      expect(result).toHaveLength(2);
      expect(result[0].storyId).toBe('S-0029');
      expect(result[1].storyId).toBe('S-0030');
    });
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
});
