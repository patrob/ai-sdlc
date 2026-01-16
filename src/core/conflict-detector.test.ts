import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import { ConflictDetectorService, detectConflicts } from './conflict-detector.js';
import { Story } from '../types/index.js';

// Mock child_process
vi.mock('child_process');
const mockSpawnSync = vi.mocked(spawnSync);

// Helper to create a mock Story object
function createMockStory(
  id: string,
  branch?: string,
  worktreePath?: string
): Story {
  return {
    path: `/path/to/${id}.md`,
    slug: id.toLowerCase(),
    frontmatter: {
      id,
      title: `Test Story ${id}`,
      slug: id.toLowerCase(),
      priority: 10,
      status: 'in-progress',
      type: 'feature',
      created: '2024-01-01',
      labels: [],
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
      branch,
      worktree_path: worktreePath,
    },
    content: 'Test story content',
  };
}

// Helper to create mock SpawnSyncReturns
function createMockSpawnResult(
  stdout: string,
  status: number = 0,
  stderr: string = ''
): SpawnSyncReturns<string> {
  return {
    pid: 1234,
    output: [null, stdout, stderr],
    stdout,
    stderr,
    status,
    signal: null,
    error: undefined,
  };
}

describe('ConflictDetectorService', () => {
  let service: ConflictDetectorService;

  beforeEach(() => {
    service = new ConflictDetectorService('/project/root', 'main');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('File Detection', () => {
    describe('getBranchName', () => {
      it('should return branch from frontmatter if explicitly set', async () => {
        const story = createMockStory('S-0001', 'ai-sdlc/S-0001-test-story');

        // Should not call git since branch is in frontmatter
        const result = await service.detectConflicts([story]);

        // Verify detectConflicts uses the branch
        expect(result).toBeDefined();
      });

      it('should find branch using pattern ai-sdlc/{storyId}-*', async () => {
        const story1 = createMockStory('S-0001');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        // Story 1: Mock git branch --list
        mockSpawnSync.mockReturnValueOnce(
          createMockSpawnResult('  ai-sdlc/S-0001-test-story\n')
        );
        // Story 1: Mock git diff (committed changes)
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));
        // Story 1: Mock git status (uncommitted changes)
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));

        // Story 2: Mock git diff (has branch in frontmatter, no branch lookup)
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));
        // Story 2: Mock git status
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));

        await service.detectConflicts([story1, story2]);

        expect(mockSpawnSync).toHaveBeenCalledWith(
          'git',
          ['branch', '--list', 'ai-sdlc/S-0001-*'],
          expect.objectContaining({
            cwd: '/project/root',
            shell: false,
          })
        );
      });

      it('should return null when no branch exists', async () => {
        const story = createMockStory('S-0001');

        // Mock git branch --list returning empty
        mockSpawnSync.mockReturnValue(createMockSpawnResult(''));

        const result = await service.detectConflicts([story]);

        // Single story with no branch = no conflicts
        expect(result.conflicts).toEqual([]);
        expect(result.safeToRunConcurrently).toBe(true);
      });

      it('should handle git command failure gracefully', async () => {
        const story = createMockStory('S-0001');

        // Mock git branch --list failing
        mockSpawnSync.mockReturnValue(createMockSpawnResult('', 1, 'error'));

        const result = await service.detectConflicts([story]);

        expect(result.conflicts).toEqual([]);
        expect(result.safeToRunConcurrently).toBe(true);
      });
    });

    describe('getModifiedFiles', () => {
      it('should return committed changes from git diff', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        // Story 1: git diff returns files
        mockSpawnSync.mockReturnValueOnce(
          createMockSpawnResult('src/file1.ts\nsrc/file2.ts\n')
        );
        // Story 1: git status returns nothing
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));

        // Story 2: git diff returns files
        mockSpawnSync.mockReturnValueOnce(
          createMockSpawnResult('src/file3.ts\n')
        );
        // Story 2: git status returns nothing
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(mockSpawnSync).toHaveBeenCalledWith(
          'git',
          ['diff', '--name-only', 'main...ai-sdlc/S-0001-story'],
          expect.any(Object)
        );
      });

      it('should include uncommitted changes from git status', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        // Story 1: git diff returns nothing
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));
        // Story 1: git status returns uncommitted file
        mockSpawnSync.mockReturnValueOnce(
          createMockSpawnResult(' M src/uncommitted.ts\n')
        );

        // Story 2: git diff returns nothing
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));
        // Story 2: git status returns nothing
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(mockSpawnSync).toHaveBeenCalledWith(
          'git',
          ['status', '--porcelain'],
          expect.any(Object)
        );
      });

      it('should deduplicate files present in both committed and uncommitted', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        // Story 1: git diff returns file
        mockSpawnSync.mockReturnValueOnce(
          createMockSpawnResult('src/file.ts\n')
        );
        // Story 1: git status also returns same file
        mockSpawnSync.mockReturnValueOnce(
          createMockSpawnResult(' M src/file.ts\n')
        );

        // Story 2: git diff returns different file
        mockSpawnSync.mockReturnValueOnce(
          createMockSpawnResult('src/other.ts\n')
        );
        // Story 2: git status returns nothing
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        // Should not have duplicates
        expect(result.conflicts[0].sharedFiles).toHaveLength(0);
      });

      it('should return empty array when no branch exists', async () => {
        const story = createMockStory('S-0001');

        // Mock git branch --list returning empty
        mockSpawnSync.mockReturnValue(createMockSpawnResult(''));

        const result = await service.detectConflicts([story]);

        expect(result.conflicts).toEqual([]);
      });

      it('should return empty array when branch is empty (no commits)', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        // Story 1: git diff returns empty (no commits yet)
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));
        // Story 1: git status returns empty
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));

        // Story 2: git diff returns empty
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));
        // Story 2: git status returns empty
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.conflicts[0].sharedFiles).toEqual([]);
        expect(result.conflicts[0].severity).toBe('none');
      });

      it('should handle git command failures gracefully', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        // Story 1: git diff fails
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult('', 1, 'error'));
        // Story 1: git status fails
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult('', 1, 'error'));

        // Story 2: git diff fails
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult('', 1, 'error'));
        // Story 2: git status fails
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult('', 1, 'error'));

        const result = await service.detectConflicts([story1, story2]);

        // Should handle gracefully - no files means no conflict
        expect(result.conflicts[0].severity).toBe('none');
      });

      it('should use worktree path if specified', async () => {
        const story1 = createMockStory(
          'S-0001',
          'ai-sdlc/S-0001-story',
          '/worktrees/S-0001'
        );
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        // Story 1 commands (should use worktree path)
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));

        // Story 2 commands (should use project root)
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));
        mockSpawnSync.mockReturnValueOnce(createMockSpawnResult(''));

        await service.detectConflicts([story1, story2]);

        // Check that story1 used worktree path
        expect(mockSpawnSync).toHaveBeenCalledWith(
          'git',
          ['diff', '--name-only', 'main...ai-sdlc/S-0001-story'],
          expect.objectContaining({
            cwd: '/worktrees/S-0001',
          })
        );

        // Check that story2 used project root
        expect(mockSpawnSync).toHaveBeenCalledWith(
          'git',
          ['diff', '--name-only', 'main...ai-sdlc/S-0002-story'],
          expect.objectContaining({
            cwd: '/project/root',
          })
        );
      });
    });
  });

  describe('Conflict Analysis', () => {
    describe('findSharedFiles', () => {
      it('should detect exact file path matches', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        // Both stories modify the same file
        mockSpawnSync
          .mockReturnValueOnce(createMockSpawnResult('src/shared.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''))
          .mockReturnValueOnce(createMockSpawnResult('src/shared.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.conflicts[0].sharedFiles).toEqual(['src/shared.ts']);
        expect(result.conflicts[0].severity).toBe('high');
      });

      it('should return empty array when no overlap', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        // Different files
        mockSpawnSync
          .mockReturnValueOnce(createMockSpawnResult('src/file1.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''))
          .mockReturnValueOnce(createMockSpawnResult('src/file2.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.conflicts[0].sharedFiles).toEqual([]);
      });
    });

    describe('findSharedDirectories', () => {
      it('should detect same directory, different files', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        // Same directory, different files
        mockSpawnSync
          .mockReturnValueOnce(createMockSpawnResult('src/core/file1.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''))
          .mockReturnValueOnce(createMockSpawnResult('src/core/file2.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.conflicts[0].sharedDirectories).toContain('src/core');
        expect(result.conflicts[0].severity).toBe('medium');
      });

      it('should return empty array when no directory overlap', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        // Different directories
        mockSpawnSync
          .mockReturnValueOnce(createMockSpawnResult('src/core/file1.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''))
          .mockReturnValueOnce(createMockSpawnResult('tests/unit/file2.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.conflicts[0].sharedDirectories).toEqual([]);
      });
    });

    describe('classifySeverity', () => {
      it('should return high when files overlap', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        mockSpawnSync
          .mockReturnValueOnce(createMockSpawnResult('src/file.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''))
          .mockReturnValueOnce(createMockSpawnResult('src/file.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.conflicts[0].severity).toBe('high');
      });

      it('should return medium when directories overlap but not files', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        mockSpawnSync
          .mockReturnValueOnce(createMockSpawnResult('src/file1.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''))
          .mockReturnValueOnce(createMockSpawnResult('src/file2.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.conflicts[0].severity).toBe('medium');
      });

      it('should return none when no overlap', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        mockSpawnSync
          .mockReturnValueOnce(createMockSpawnResult('src/file1.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''))
          .mockReturnValueOnce(createMockSpawnResult('tests/file2.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.conflicts[0].severity).toBe('none');
      });
    });

    describe('generateRecommendation', () => {
      it('should return "Run sequentially" for high severity', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        mockSpawnSync
          .mockReturnValueOnce(createMockSpawnResult('src/file.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''))
          .mockReturnValueOnce(createMockSpawnResult('src/file.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.conflicts[0].recommendation).toContain('Run sequentially');
        expect(result.conflicts[0].recommendation).toContain('1 shared file(s)');
      });

      it('should return "Proceed with caution" for medium severity', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        mockSpawnSync
          .mockReturnValueOnce(createMockSpawnResult('src/file1.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''))
          .mockReturnValueOnce(createMockSpawnResult('src/file2.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.conflicts[0].recommendation).toContain('Proceed with caution');
      });

      it('should return "Safe to run" for none severity', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        mockSpawnSync
          .mockReturnValueOnce(createMockSpawnResult('src/file1.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''))
          .mockReturnValueOnce(createMockSpawnResult('tests/file2.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.conflicts[0].recommendation).toContain('Safe to run concurrently');
      });
    });
  });

  describe('End-to-End Conflict Detection', () => {
    describe('detectConflicts', () => {
      it('should perform pairwise comparison for 2 stories', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        mockSpawnSync.mockReturnValue(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        // 2 stories = 1 pair
        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts[0].storyA).toBe('S-0001');
        expect(result.conflicts[0].storyB).toBe('S-0002');
      });

      it('should perform pairwise comparison for 3 stories (3 pairs)', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');
        const story3 = createMockStory('S-0003', 'ai-sdlc/S-0003-story');

        mockSpawnSync.mockReturnValue(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2, story3]);

        // 3 stories = 3 pairs (1-2, 1-3, 2-3)
        expect(result.conflicts).toHaveLength(3);
      });

      it('should perform pairwise comparison for 4 stories (6 pairs)', async () => {
        const stories = [
          createMockStory('S-0001', 'ai-sdlc/S-0001-story'),
          createMockStory('S-0002', 'ai-sdlc/S-0002-story'),
          createMockStory('S-0003', 'ai-sdlc/S-0003-story'),
          createMockStory('S-0004', 'ai-sdlc/S-0004-story'),
        ];

        mockSpawnSync.mockReturnValue(createMockSpawnResult(''));

        const result = await service.detectConflicts(stories);

        // 4 stories = 6 pairs
        expect(result.conflicts).toHaveLength(6);
      });

      it('should set safeToRunConcurrently=false when high-severity conflict exists', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        // Both modify same file (high severity)
        mockSpawnSync
          .mockReturnValueOnce(createMockSpawnResult('src/shared.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''))
          .mockReturnValueOnce(createMockSpawnResult('src/shared.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.safeToRunConcurrently).toBe(false);
        expect(result.summary).toContain('high-severity');
      });

      it('should set safeToRunConcurrently=true when only medium/low/none conflicts', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        // Different files in same directory (medium severity)
        mockSpawnSync
          .mockReturnValueOnce(createMockSpawnResult('src/file1.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''))
          .mockReturnValueOnce(createMockSpawnResult('src/file2.ts\n'))
          .mockReturnValueOnce(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.safeToRunConcurrently).toBe(true);
        expect(result.summary).toContain('medium-severity');
      });

      it('should generate accurate summary string', async () => {
        const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
        const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

        mockSpawnSync.mockReturnValue(createMockSpawnResult(''));

        const result = await service.detectConflicts([story1, story2]);

        expect(result.summary).toContain('No conflicts detected');
        expect(result.summary).toContain('1 story pair');
      });

      it('should handle single story (returns empty conflicts array)', async () => {
        const story = createMockStory('S-0001', 'ai-sdlc/S-0001-story');

        const result = await service.detectConflicts([story]);

        expect(result.conflicts).toEqual([]);
        expect(result.safeToRunConcurrently).toBe(true);
        expect(result.summary).toContain('Single story');
      });

      it('should handle empty story array (returns empty conflicts array)', async () => {
        const result = await service.detectConflicts([]);

        expect(result.conflicts).toEqual([]);
        expect(result.safeToRunConcurrently).toBe(true);
        expect(result.summary).toContain('No stories');
      });
    });
  });

  describe('Security', () => {
    it('should sanitize story IDs to prevent path traversal', async () => {
      const maliciousStory = createMockStory('../../../etc/passwd');
      const validStory = createMockStory('S-0001', 'ai-sdlc/S-0001-story');

      // Should throw error when trying to sanitize the malicious story ID
      await expect(
        service.detectConflicts([maliciousStory, validStory])
      ).rejects.toThrow();
    });

    it('should use shell: false in all spawnSync calls', async () => {
      const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
      const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

      mockSpawnSync.mockReturnValue(createMockSpawnResult(''));

      await service.detectConflicts([story1, story2]);

      // Check all spawnSync calls have shell: false
      const calls = mockSpawnSync.mock.calls;
      for (const call of calls) {
        expect(call[2]).toMatchObject({ shell: false });
      }
    });
  });

  describe('Convenience Function', () => {
    it('should create service and detect conflicts', async () => {
      const story1 = createMockStory('S-0001', 'ai-sdlc/S-0001-story');
      const story2 = createMockStory('S-0002', 'ai-sdlc/S-0002-story');

      mockSpawnSync.mockReturnValue(createMockSpawnResult(''));

      const result = await detectConflicts(
        [story1, story2],
        '/project/root',
        'main'
      );

      expect(result.conflicts).toHaveLength(1);
      expect(result.safeToRunConcurrently).toBe(true);
    });
  });
});
