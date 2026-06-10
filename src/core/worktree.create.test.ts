import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Story } from '../types/index.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getLastCompletedPhase, getNextPhase,GitWorktreeService } from './worktree.js';

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
});
