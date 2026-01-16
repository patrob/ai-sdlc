import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import {
  isCleanWorkingDirectory,
  hasUntrackedFiles,
  isOnProtectedBranch,
  isLocalBehindRemote,
  validateGitState,
  GitValidationResult,
  GitValidationOptions,
  CleanWorkingDirectoryOptions,
} from './git-utils.js';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

const mockSpawnSync = vi.mocked(spawnSync);

function createSpawnResult(
  stdout: string,
  status: number = 0
): SpawnSyncReturns<string> {
  return {
    stdout,
    stderr: '',
    status,
    signal: null,
    pid: 12345,
    output: [null, stdout, ''],
  };
}

describe('git-utils', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('isCleanWorkingDirectory', () => {
    it('returns true when git status --porcelain outputs empty string', () => {
      mockSpawnSync.mockReturnValue(createSpawnResult(''));

      const result = isCleanWorkingDirectory('/test/dir');

      expect(result).toBe(true);
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['status', '--porcelain'],
        expect.objectContaining({
          cwd: '/test/dir',
          shell: false,
        })
      );
    });

    it('returns false when there are modified files', () => {
      mockSpawnSync.mockReturnValue(createSpawnResult(' M src/file.ts\n'));

      const result = isCleanWorkingDirectory('/test/dir');

      expect(result).toBe(false);
    });

    it('returns false when there are staged files', () => {
      mockSpawnSync.mockReturnValue(createSpawnResult('M  src/file.ts\n'));

      const result = isCleanWorkingDirectory('/test/dir');

      expect(result).toBe(false);
    });

    it('returns false when git command fails', () => {
      mockSpawnSync.mockReturnValue(createSpawnResult('', 1));

      const result = isCleanWorkingDirectory('/test/dir');

      expect(result).toBe(false);
    });

    describe('with excludePatterns', () => {
      it('returns true when all changes are in excluded paths', () => {
        // Changes only in .ai-sdlc/ directory
        mockSpawnSync.mockReturnValue(
          createSpawnResult(' M .ai-sdlc/stories/S-0001/story.md\n M .ai-sdlc/config.json\n')
        );

        const options: CleanWorkingDirectoryOptions = {
          excludePatterns: ['.ai-sdlc/**'],
        };
        const result = isCleanWorkingDirectory('/test/dir', options);

        expect(result).toBe(true);
      });

      it('returns false when there are non-excluded changes', () => {
        // Mix of .ai-sdlc changes and source code changes
        mockSpawnSync.mockReturnValue(
          createSpawnResult(' M .ai-sdlc/stories/S-0001/story.md\n M src/index.ts\n')
        );

        const options: CleanWorkingDirectoryOptions = {
          excludePatterns: ['.ai-sdlc/**'],
        };
        const result = isCleanWorkingDirectory('/test/dir', options);

        expect(result).toBe(false);
      });

      it('returns true when directory is completely clean even with exclude patterns', () => {
        mockSpawnSync.mockReturnValue(createSpawnResult(''));

        const options: CleanWorkingDirectoryOptions = {
          excludePatterns: ['.ai-sdlc/**'],
        };
        const result = isCleanWorkingDirectory('/test/dir', options);

        expect(result).toBe(true);
      });

      it('handles multiple exclude patterns', () => {
        mockSpawnSync.mockReturnValue(
          createSpawnResult(' M .ai-sdlc/stories/story.md\n M node_modules/pkg/file.js\n')
        );

        const options: CleanWorkingDirectoryOptions = {
          excludePatterns: ['.ai-sdlc/**', 'node_modules/**'],
        };
        const result = isCleanWorkingDirectory('/test/dir', options);

        expect(result).toBe(true);
      });

      it('handles quoted paths in git status output', () => {
        // Git quotes paths with special characters
        mockSpawnSync.mockReturnValue(createSpawnResult(' M ".ai-sdlc/stories/S-0001/story.md"\n'));

        const options: CleanWorkingDirectoryOptions = {
          excludePatterns: ['.ai-sdlc/**'],
        };
        const result = isCleanWorkingDirectory('/test/dir', options);

        expect(result).toBe(true);
      });

      it('handles staged and unstaged changes in excluded paths', () => {
        // M = staged, second M = unstaged, A = added, ? = untracked
        mockSpawnSync.mockReturnValue(
          createSpawnResult(
            'M  .ai-sdlc/stories/S-0001/story.md\n' +
              ' M .ai-sdlc/config.json\n' +
              'A  .ai-sdlc/stories/S-0002/story.md\n'
          )
        );

        const options: CleanWorkingDirectoryOptions = {
          excludePatterns: ['.ai-sdlc/**'],
        };
        const result = isCleanWorkingDirectory('/test/dir', options);

        expect(result).toBe(true);
      });

      it('correctly excludes nested paths', () => {
        mockSpawnSync.mockReturnValue(
          createSpawnResult(' M .ai-sdlc/stories/in-progress/S-0001/story.md\n')
        );

        const options: CleanWorkingDirectoryOptions = {
          excludePatterns: ['.ai-sdlc/**'],
        };
        const result = isCleanWorkingDirectory('/test/dir', options);

        expect(result).toBe(true);
      });

      it('only excludes exact pattern matches', () => {
        // .ai-sdlc-backup should NOT be excluded by .ai-sdlc/**
        mockSpawnSync.mockReturnValue(createSpawnResult(' M .ai-sdlc-backup/file.txt\n'));

        const options: CleanWorkingDirectoryOptions = {
          excludePatterns: ['.ai-sdlc/**'],
        };
        const result = isCleanWorkingDirectory('/test/dir', options);

        expect(result).toBe(false);
      });
    });
  });

  describe('hasUntrackedFiles', () => {
    it('returns false when no untracked files', () => {
      mockSpawnSync.mockReturnValue(createSpawnResult(''));

      const result = hasUntrackedFiles('/test/dir');

      expect(result).toBe(false);
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['ls-files', '--others', '--exclude-standard'],
        expect.objectContaining({
          cwd: '/test/dir',
          shell: false,
        })
      );
    });

    it('returns true when there are untracked files', () => {
      mockSpawnSync.mockReturnValue(createSpawnResult('new-file.ts\nanother.ts\n'));

      const result = hasUntrackedFiles('/test/dir');

      expect(result).toBe(true);
    });

    it('returns false when git command fails', () => {
      mockSpawnSync.mockReturnValue(createSpawnResult('', 128));

      const result = hasUntrackedFiles('/test/dir');

      expect(result).toBe(false);
    });
  });

  describe('isOnProtectedBranch', () => {
    it('returns true when on main branch', () => {
      mockSpawnSync.mockReturnValue(createSpawnResult('main\n'));

      const result = isOnProtectedBranch('/test/dir');

      expect(result).toBe(true);
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        expect.objectContaining({
          cwd: '/test/dir',
          shell: false,
        })
      );
    });

    it('returns true when on master branch', () => {
      mockSpawnSync.mockReturnValue(createSpawnResult('master\n'));

      const result = isOnProtectedBranch('/test/dir');

      expect(result).toBe(true);
    });

    it('returns false when on feature branch', () => {
      mockSpawnSync.mockReturnValue(createSpawnResult('feature/my-feature\n'));

      const result = isOnProtectedBranch('/test/dir');

      expect(result).toBe(false);
    });

    it('returns false when on ai-sdlc prefixed branch', () => {
      mockSpawnSync.mockReturnValue(createSpawnResult('ai-sdlc/story-123\n'));

      const result = isOnProtectedBranch('/test/dir');

      expect(result).toBe(false);
    });

    it('uses custom protected branches when provided', () => {
      mockSpawnSync.mockReturnValue(createSpawnResult('develop\n'));

      const result = isOnProtectedBranch('/test/dir', ['main', 'master', 'develop']);

      expect(result).toBe(true);
    });

    it('returns false when git command fails', () => {
      mockSpawnSync.mockReturnValue(createSpawnResult('', 128));

      const result = isOnProtectedBranch('/test/dir');

      expect(result).toBe(false);
    });
  });

  describe('isLocalBehindRemote', () => {
    it('returns false when local is up to date with remote', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult('')) // git fetch
        .mockReturnValueOnce(createSpawnResult('0\t0\n')); // git rev-list

      const result = isLocalBehindRemote('/test/dir');

      expect(result).toBe(false);
    });

    it('returns true when local is behind remote', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult('')) // git fetch
        .mockReturnValueOnce(createSpawnResult('3\t0\n')); // git rev-list (3 commits behind)

      const result = isLocalBehindRemote('/test/dir');

      expect(result).toBe(true);
    });

    it('returns false when local is ahead of remote', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult('')) // git fetch
        .mockReturnValueOnce(createSpawnResult('0\t2\n')); // git rev-list (2 commits ahead)

      const result = isLocalBehindRemote('/test/dir');

      expect(result).toBe(false);
    });

    it('returns false when no remote tracking branch', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult('')) // git fetch
        .mockReturnValueOnce(createSpawnResult('', 128)); // git rev-list fails

      const result = isLocalBehindRemote('/test/dir');

      expect(result).toBe(false);
    });

    it('returns false when fetch fails (offline mode)', () => {
      mockSpawnSync.mockReturnValueOnce(createSpawnResult('', 1)); // git fetch fails

      const result = isLocalBehindRemote('/test/dir');

      expect(result).toBe(false);
    });
  });

  describe('validateGitState', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('returns valid result when all checks pass', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult('')) // git status --porcelain (clean)
        .mockReturnValueOnce(createSpawnResult('')) // git ls-files (no untracked)
        .mockReturnValueOnce(createSpawnResult('feature/test\n')) // git rev-parse (branch name)
        .mockReturnValueOnce(createSpawnResult('')) // git fetch
        .mockReturnValueOnce(createSpawnResult('0\t0\n')); // git rev-list (not behind)

      const result = validateGitState('/test/dir');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error when working directory is dirty', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult(' M src/file.ts\n')) // git status --porcelain (dirty)
        .mockReturnValueOnce(createSpawnResult('')) // git ls-files
        .mockReturnValueOnce(createSpawnResult('feature/test\n')) // branch
        .mockReturnValueOnce(createSpawnResult('')) // fetch
        .mockReturnValueOnce(createSpawnResult('0\t0\n')); // rev-list

      const result = validateGitState('/test/dir');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Working directory has uncommitted changes. Commit or stash your changes first.'
      );
    });

    it('returns error when on protected branch', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult('')) // git status --porcelain (clean)
        .mockReturnValueOnce(createSpawnResult('')) // git ls-files (no untracked)
        .mockReturnValueOnce(createSpawnResult('main\n')) // git rev-parse (on main!)
        .mockReturnValueOnce(createSpawnResult('')) // git fetch
        .mockReturnValueOnce(createSpawnResult('0\t0\n')); // git rev-list

      const result = validateGitState('/test/dir');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Cannot run on protected branch "main". Create a feature branch first.'
      );
    });

    it('returns error when local is behind remote', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult('')) // clean
        .mockReturnValueOnce(createSpawnResult('')) // no untracked
        .mockReturnValueOnce(createSpawnResult('feature/test\n')) // on feature branch
        .mockReturnValueOnce(createSpawnResult('')) // fetch
        .mockReturnValueOnce(createSpawnResult('2\t0\n')); // 2 commits behind

      const result = validateGitState('/test/dir');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Local branch is behind remote. Pull latest changes first: git pull'
      );
    });

    it('returns warning when there are untracked files', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult('')) // clean
        .mockReturnValueOnce(createSpawnResult('new-file.ts\n')) // untracked files!
        .mockReturnValueOnce(createSpawnResult('feature/test\n')) // feature branch
        .mockReturnValueOnce(createSpawnResult('')) // fetch
        .mockReturnValueOnce(createSpawnResult('0\t0\n')); // not behind

      const result = validateGitState('/test/dir');

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'There are untracked files that may conflict with implementation.'
      );
    });

    it('includes current branch name in result', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('feature/my-branch\n'))
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('0\t0\n'));

      const result = validateGitState('/test/dir');

      expect(result.currentBranch).toBe('feature/my-branch');
    });

    it('respects skipCleanCheck option', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult(' M dirty.ts\n')) // dirty
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('feature/test\n'))
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('0\t0\n'));

      const options: GitValidationOptions = { skipCleanCheck: true };
      const result = validateGitState('/test/dir', options);

      expect(result.valid).toBe(true);
      expect(result.errors).not.toContain(
        'Working directory has uncommitted changes. Commit or stash your changes first.'
      );
    });

    it('respects skipBranchCheck option', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('main\n')) // on main
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('0\t0\n'));

      const options: GitValidationOptions = { skipBranchCheck: true };
      const result = validateGitState('/test/dir', options);

      expect(result.valid).toBe(true);
      expect(result.errors).not.toContain(
        'Cannot run on protected branch "main". Create a feature branch first.'
      );
    });

    it('respects skipRemoteCheck option', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('feature/test\n'))
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('5\t0\n')); // behind by 5

      const options: GitValidationOptions = { skipRemoteCheck: true };
      const result = validateGitState('/test/dir', options);

      expect(result.valid).toBe(true);
      expect(result.errors).not.toContain(
        'Local branch is behind remote. Pull latest changes first: git pull'
      );
    });

    it('collects multiple errors', () => {
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult(' M dirty.ts\n')) // dirty
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('main\n')) // on main
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('3\t0\n')); // behind

      const result = validateGitState('/test/dir');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3);
    });

    it('respects excludePatterns option for clean check', () => {
      // Only .ai-sdlc files are modified - should be excluded
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult(' M .ai-sdlc/stories/S-0001/story.md\n')) // dirty but in .ai-sdlc
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('feature/test\n'))
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('0\t0\n'));

      const options: GitValidationOptions = { excludePatterns: ['.ai-sdlc/**'] };
      const result = validateGitState('/test/dir', options);

      expect(result.valid).toBe(true);
      expect(result.errors).not.toContain(
        'Working directory has uncommitted changes. Commit or stash your changes first.'
      );
    });

    it('still fails when non-excluded files are dirty with excludePatterns', () => {
      // Mix of .ai-sdlc and src changes - src should still cause failure
      mockSpawnSync
        .mockReturnValueOnce(createSpawnResult(' M .ai-sdlc/stories/S-0001/story.md\n M src/index.ts\n'))
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('feature/test\n'))
        .mockReturnValueOnce(createSpawnResult(''))
        .mockReturnValueOnce(createSpawnResult('0\t0\n'));

      const options: GitValidationOptions = { excludePatterns: ['.ai-sdlc/**'] };
      const result = validateGitState('/test/dir', options);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Working directory has uncommitted changes. Commit or stash your changes first.'
      );
    });
  });
});
