import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitWorktreeService, getLastCompletedPhase, getNextPhase } from './worktree.js';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Story } from '../types/index.js';

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
      // Mock isCleanWorkingDirectory to return false (uncommitted changes in source code)
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

    it('returns valid:true when only .ai-sdlc files are modified', () => {
      // Story files in .ai-sdlc/ should be excluded from the clean check
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: ' M .ai-sdlc/stories/S-0001/story.md\n M .ai-sdlc/config.json\n',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.validateCanCreateWorktree();
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns valid:false when both .ai-sdlc and source files are modified', () => {
      // Source code changes should still block, even with .ai-sdlc changes
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: ' M .ai-sdlc/stories/S-0001/story.md\n M src/index.ts\n',
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

    it('returns existing path when resumeIfExists is true and worktree is valid', () => {
      // Mock worktree exists
      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        // Worktree path exists
        if (p.includes('S-0029-test')) return true;
        // Story directory exists
        if (p.includes('.ai-sdlc/stories')) return true;
        return false;
      });
      // Mock branch exists (for validateWorktreeForResume)
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.create({
        storyId: 'S-0029',
        slug: 'test',
        baseBranch: 'main',
        resumeIfExists: true,
      });

      expect(result).toBe(path.join(worktreeBasePath, 'S-0029-test'));
    });

    it('throws error when resumeIfExists is true but worktree cannot be resumed', () => {
      // Mock worktree path exists but is invalid
      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        // Worktree path exists
        if (p === path.join(worktreeBasePath, 'S-0029-test')) return true;
        // But story directory doesn't exist
        return false;
      });
      // Mock branch doesn't exist
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'fatal: Needed a single revision',
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() =>
        service.create({
          storyId: 'S-0029',
          slug: 'test',
          baseBranch: 'main',
          resumeIfExists: true,
        })
      ).toThrow('cannot resume');
    });

    it('still throws when worktree exists and resumeIfExists is false', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      expect(() =>
        service.create({
          storyId: 'S-0029',
          slug: 'test',
          baseBranch: 'main',
          resumeIfExists: false,
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

  describe('installDependencies', () => {
    it('skips installation if no package.json exists', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

      service.installDependencies('/test/worktree');

      // Should not call any package manager
      expect(spawnSyncSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/npm|yarn|pnpm/),
        expect.anything(),
        expect.anything()
      );
    });

    it('uses npm when package-lock.json exists', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        if (p.includes('package.json')) return true;
        if (p.includes('package-lock.json')) return true;
        return false;
      });
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      service.installDependencies('/test/worktree');

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'npm',
        ['install'],
        expect.objectContaining({
          cwd: '/test/worktree',
          timeout: 120000,
        })
      );
    });

    it('uses yarn when yarn.lock exists', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        if (p.includes('package.json')) return true;
        if (p.includes('yarn.lock')) return true;
        return false;
      });
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      service.installDependencies('/test/worktree');

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'yarn',
        ['install'],
        expect.objectContaining({ cwd: '/test/worktree' })
      );
    });

    it('uses pnpm when pnpm-lock.yaml exists', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        if (p.includes('package.json')) return true;
        if (p.includes('pnpm-lock.yaml')) return true;
        return false;
      });
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      service.installDependencies('/test/worktree');

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.objectContaining({ cwd: '/test/worktree' })
      );
    });

    it('defaults to npm when no lock file exists', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        if (p.includes('package.json')) return true;
        return false;
      });
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      service.installDependencies('/test/worktree');

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'npm',
        ['install'],
        expect.anything()
      );
    });

    it('throws error when installation fails', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        if (p.includes('package.json')) return true;
        return false;
      });
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'npm ERR! code ENETWORK',
        output: [],
        pid: 0,
        signal: null,
      });

      expect(() => service.installDependencies('/test/worktree')).toThrow(
        'Failed to install dependencies'
      );
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

  describe('getWorktreeStatus', () => {
    it('returns basic status for non-existent worktree', () => {
      const worktreeInfo = {
        path: '/test/project/.ai-sdlc/worktrees/S-0029-test',
        branch: 'ai-sdlc/S-0029-test',
        storyId: 'S-0029',
        exists: false,
      };

      const result = service.getWorktreeStatus(worktreeInfo);
      expect(result.exists).toBe(false);
      expect(result.workingDirectoryStatus).toBe('clean');
      expect(result.modifiedFiles).toEqual([]);
      expect(result.untrackedFiles).toEqual([]);
    });

    it('returns last commit information', () => {
      vi.spyOn(cp, 'spawnSync').mockImplementation((cmd, args) => {
        if (args?.[0] === 'log') {
          return {
            status: 0,
            stdout: 'abc1234567890\nCommit message here\n2024-01-15 10:30:00 -0500',
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
        if (args?.[0] === 'status') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
        return { status: 1, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      const worktreeInfo = {
        path: '/test/project/.ai-sdlc/worktrees/S-0029-test',
        branch: 'ai-sdlc/S-0029-test',
        storyId: 'S-0029',
        exists: true,
      };

      const result = service.getWorktreeStatus(worktreeInfo);
      expect(result.lastCommit).toBeDefined();
      expect(result.lastCommit?.hash).toBe('abc1234567890');
      expect(result.lastCommit?.message).toBe('Commit message here');
      expect(result.lastCommit?.timestamp).toBe('2024-01-15 10:30:00 -0500');
    });

    it('detects modified files', () => {
      vi.spyOn(cp, 'spawnSync').mockImplementation((cmd, args) => {
        if (args?.[0] === 'log') {
          return {
            status: 0,
            stdout: 'abc123\nMessage\n2024-01-15',
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
        if (args?.[0] === 'status') {
          return {
            status: 0,
            stdout: ' M src/index.ts\nAM src/other.ts',
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
        return { status: 1, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      const worktreeInfo = {
        path: '/test/project/.ai-sdlc/worktrees/S-0029-test',
        branch: 'ai-sdlc/S-0029-test',
        storyId: 'S-0029',
        exists: true,
      };

      const result = service.getWorktreeStatus(worktreeInfo);
      expect(result.workingDirectoryStatus).toBe('modified');
      expect(result.modifiedFiles).toContain('src/index.ts');
      expect(result.modifiedFiles).toContain('src/other.ts');
    });

    it('detects untracked files', () => {
      vi.spyOn(cp, 'spawnSync').mockImplementation((cmd, args) => {
        if (args?.[0] === 'log') {
          return {
            status: 0,
            stdout: 'abc123\nMessage\n2024-01-15',
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
        if (args?.[0] === 'status') {
          return {
            status: 0,
            stdout: '?? newfile.ts\n?? another.ts',
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
        return { status: 1, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      const worktreeInfo = {
        path: '/test/project/.ai-sdlc/worktrees/S-0029-test',
        branch: 'ai-sdlc/S-0029-test',
        storyId: 'S-0029',
        exists: true,
      };

      const result = service.getWorktreeStatus(worktreeInfo);
      expect(result.workingDirectoryStatus).toBe('untracked');
      expect(result.untrackedFiles).toContain('newfile.ts');
      expect(result.untrackedFiles).toContain('another.ts');
    });

    it('detects mixed status with both modified and untracked', () => {
      vi.spyOn(cp, 'spawnSync').mockImplementation((cmd, args) => {
        if (args?.[0] === 'log') {
          return {
            status: 0,
            stdout: 'abc123\nMessage\n2024-01-15',
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
        if (args?.[0] === 'status') {
          return {
            status: 0,
            stdout: ' M src/index.ts\n?? newfile.ts',
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
        return { status: 1, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      const worktreeInfo = {
        path: '/test/project/.ai-sdlc/worktrees/S-0029-test',
        branch: 'ai-sdlc/S-0029-test',
        storyId: 'S-0029',
        exists: true,
      };

      const result = service.getWorktreeStatus(worktreeInfo);
      expect(result.workingDirectoryStatus).toBe('mixed');
      expect(result.modifiedFiles).toContain('src/index.ts');
      expect(result.untrackedFiles).toContain('newfile.ts');
    });

    it('returns clean status when no changes', () => {
      vi.spyOn(cp, 'spawnSync').mockImplementation((cmd, args) => {
        if (args?.[0] === 'log') {
          return {
            status: 0,
            stdout: 'abc123\nMessage\n2024-01-15',
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
        if (args?.[0] === 'status') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
        return { status: 1, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      const worktreeInfo = {
        path: '/test/project/.ai-sdlc/worktrees/S-0029-test',
        branch: 'ai-sdlc/S-0029-test',
        storyId: 'S-0029',
        exists: true,
      };

      const result = service.getWorktreeStatus(worktreeInfo);
      expect(result.workingDirectoryStatus).toBe('clean');
      expect(result.modifiedFiles).toEqual([]);
      expect(result.untrackedFiles).toEqual([]);
    });

    it('handles missing storyId gracefully', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const worktreeInfo = {
        path: '/test/project/.ai-sdlc/worktrees/custom-branch',
        branch: 'custom-branch',
        storyId: undefined,
        exists: true,
      };

      const result = service.getWorktreeStatus(worktreeInfo);
      expect(result.storyId).toBe('unknown');
    });
  });

  describe('validateWorktreeForResume', () => {
    it('returns valid when directory and branch exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.validateWorktreeForResume(
        '/test/worktree/path',
        'ai-sdlc/S-0029-test'
      );

      expect(result.valid).toBe(true);
      expect(result.canResume).toBe(true);
      expect(result.requiresRecreation).toBe(false);
      expect(result.issues).toEqual([]);
    });

    it('returns invalid when directory does not exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.validateWorktreeForResume(
        '/test/worktree/path',
        'ai-sdlc/S-0029-test'
      );

      expect(result.valid).toBe(false);
      expect(result.canResume).toBe(false);
      expect(result.requiresRecreation).toBe(true);
      expect(result.issues).toContain('Worktree directory does not exist');
    });

    it('returns invalid when branch does not exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'fatal: Needed a single revision',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.validateWorktreeForResume(
        '/test/worktree/path',
        'ai-sdlc/S-0029-test'
      );

      expect(result.valid).toBe(false);
      expect(result.canResume).toBe(false);
      expect(result.requiresRecreation).toBe(true);
      expect(result.issues).toContain('Branch does not exist');
    });

    it('returns invalid when story directory not accessible', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        if (p === '/test/worktree/path') return true;
        if (p.includes('.ai-sdlc/stories')) return false;
        return false;
      });
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.validateWorktreeForResume(
        '/test/worktree/path',
        'ai-sdlc/S-0029-test'
      );

      expect(result.valid).toBe(false);
      expect(result.canResume).toBe(false);
      expect(result.issues).toContain('Story directory not accessible in worktree');
    });

    it('returns multiple issues when both directory and branch are missing', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.validateWorktreeForResume(
        '/test/worktree/path',
        'ai-sdlc/S-0029-test'
      );

      expect(result.valid).toBe(false);
      expect(result.canResume).toBe(false);
      expect(result.requiresRecreation).toBe(true);
      expect(result.issues).toHaveLength(2);
      expect(result.issues).toContain('Worktree directory does not exist');
      expect(result.issues).toContain('Branch does not exist');
    });
  });

  describe('checkBranchDivergence', () => {
    it('returns no divergence when branch is up to date', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '0\t0',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.checkBranchDivergence('ai-sdlc/S-0029-test', 'main');

      expect(result.ahead).toBe(0);
      expect(result.behind).toBe(0);
      expect(result.diverged).toBe(false);
    });

    it('returns correct values when branch is ahead', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '0\t5',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.checkBranchDivergence('ai-sdlc/S-0029-test', 'main');

      expect(result.ahead).toBe(5);
      expect(result.behind).toBe(0);
      expect(result.diverged).toBe(true);
    });

    it('returns correct values when branch is behind', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '3\t0',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.checkBranchDivergence('ai-sdlc/S-0029-test', 'main');

      expect(result.ahead).toBe(0);
      expect(result.behind).toBe(3);
      expect(result.diverged).toBe(true);
    });

    it('returns correct values when branch has diverged', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 0,
        stdout: '5\t3',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.checkBranchDivergence('ai-sdlc/S-0029-test', 'main');

      expect(result.ahead).toBe(3);
      expect(result.behind).toBe(5);
      expect(result.diverged).toBe(true);
    });

    it('handles git command failure gracefully', () => {
      vi.spyOn(cp, 'spawnSync').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'fatal: bad revision',
        output: [],
        pid: 0,
        signal: null,
      });

      const result = service.checkBranchDivergence('ai-sdlc/S-0029-test', 'main');

      expect(result.ahead).toBe(0);
      expect(result.behind).toBe(0);
      expect(result.diverged).toBe(false);
    });

    it('auto-detects base branch when not provided', () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync').mockImplementation((cmd, args) => {
        if (args?.[0] === 'rev-parse' && args?.[2] === 'main') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        }
        if (args?.[0] === 'rev-list') {
          return { status: 0, stdout: '0\t2', stderr: '', output: [], pid: 0, signal: null };
        }
        return { status: 1, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      const result = service.checkBranchDivergence('ai-sdlc/S-0029-test');

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'git',
        ['rev-list', '--left-right', '--count', 'main...ai-sdlc/S-0029-test'],
        expect.anything()
      );
      expect(result.ahead).toBe(2);
    });
  });
});

describe('getLastCompletedPhase', () => {
  const createMockStory = (overrides: any = {}): Story => ({
    path: '/test/story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'S-0001',
      title: 'Test Story',
      status: 'in-progress',
      type: 'feature',
      priority: 100,
      created: '2024-01-01',
      labels: [],
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
      ...overrides,
    },
    content: '',
  });

  it('returns null when no phases are complete', () => {
    const story = createMockStory();
    expect(getLastCompletedPhase(story)).toBeNull();
  });

  it('returns "research" when only research is complete', () => {
    const story = createMockStory({
      research_complete: true,
    });
    expect(getLastCompletedPhase(story)).toBe('research');
  });

  it('returns "plan" when research and plan are complete', () => {
    const story = createMockStory({
      research_complete: true,
      plan_complete: true,
    });
    expect(getLastCompletedPhase(story)).toBe('plan');
  });

  it('returns "implementation" when research, plan, and implementation are complete', () => {
    const story = createMockStory({
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
    });
    expect(getLastCompletedPhase(story)).toBe('implementation');
  });

  it('returns "review" when all phases are complete', () => {
    const story = createMockStory({
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
      reviews_complete: true,
    });
    expect(getLastCompletedPhase(story)).toBe('review');
  });

  it('returns highest completed phase even when earlier phases are incomplete', () => {
    const story = createMockStory({
      research_complete: false,
      plan_complete: false,
      implementation_complete: true,
      reviews_complete: false,
    });
    expect(getLastCompletedPhase(story)).toBe('implementation');
  });
});

describe('getNextPhase', () => {
  const createMockStory = (overrides: any = {}): Story => ({
    path: '/test/story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'S-0001',
      title: 'Test Story',
      status: 'ready',
      type: 'feature',
      priority: 100,
      created: '2024-01-01',
      labels: [],
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
      ...overrides,
    },
    content: '',
  });

  it('returns null for blocked stories', () => {
    const story = createMockStory({ status: 'blocked' });
    expect(getNextPhase(story)).toBeNull();
  });

  it('returns null for done stories', () => {
    const story = createMockStory({ status: 'done' });
    expect(getNextPhase(story)).toBeNull();
  });

  it('returns "refine" for backlog stories', () => {
    const story = createMockStory({ status: 'backlog' });
    expect(getNextPhase(story)).toBe('refine');
  });

  describe('ready stories', () => {
    it('returns "research" when no phases are complete', () => {
      const story = createMockStory({ status: 'ready' });
      expect(getNextPhase(story)).toBe('research');
    });

    it('returns "plan" when research is complete', () => {
      const story = createMockStory({
        status: 'ready',
        research_complete: true,
      });
      expect(getNextPhase(story)).toBe('plan');
    });

    it('returns "implement" when research and plan are complete', () => {
      const story = createMockStory({
        status: 'ready',
        research_complete: true,
        plan_complete: true,
      });
      expect(getNextPhase(story)).toBe('implement');
    });
  });

  describe('in-progress stories', () => {
    it('returns "implement" when implementation is not complete', () => {
      const story = createMockStory({
        status: 'in-progress',
        research_complete: true,
        plan_complete: true,
        implementation_complete: false,
      });
      expect(getNextPhase(story)).toBe('implement');
    });

    it('returns "review" when implementation is complete', () => {
      const story = createMockStory({
        status: 'in-progress',
        research_complete: true,
        plan_complete: true,
        implementation_complete: true,
        reviews_complete: false,
      });
      expect(getNextPhase(story)).toBe('review');
    });

    it('returns "create_pr" when all phases are complete', () => {
      const story = createMockStory({
        status: 'in-progress',
        research_complete: true,
        plan_complete: true,
        implementation_complete: true,
        reviews_complete: true,
      });
      expect(getNextPhase(story)).toBe('create_pr');
    });
  });
});
