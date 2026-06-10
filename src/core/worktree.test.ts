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
});
