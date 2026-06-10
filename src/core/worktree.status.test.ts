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
