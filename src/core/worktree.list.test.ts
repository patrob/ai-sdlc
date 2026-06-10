import * as cp from 'child_process';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
});
