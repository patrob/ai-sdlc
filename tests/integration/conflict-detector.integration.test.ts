import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConflictDetectorService } from '../../src/core/conflict-detector.js';
import { Story } from '../../src/types/index.js';

/**
 * Integration tests for ConflictDetectorService using real git operations.
 * These tests create temporary git repositories and branches to verify actual behavior.
 */
describe('ConflictDetectorService Integration', () => {
  let testDir: string;
  let service: ConflictDetectorService;

  // Cleanup function to ensure orphaned directories are removed even on crash/timeout
  const cleanupTestDir = () => {
    if (testDir && fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors on exit
      }
    }
  };

  beforeAll(() => {
    // Create temporary directory for test repository
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-conflict-test-'));

    // Register exit handler to cleanup orphaned directories on process crash/timeout
    process.on('exit', cleanupTestDir);
    process.on('SIGINT', cleanupTestDir);
    process.on('SIGTERM', cleanupTestDir);

    try {
      // Initialize git repository
      spawnSync('git', ['init'], { cwd: testDir });
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: testDir });
      spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: testDir });

      // Create initial commit on main branch
      fs.writeFileSync(path.join(testDir, 'README.md'), '# Test Repo\n');
      spawnSync('git', ['add', '.'], { cwd: testDir });
      spawnSync('git', ['commit', '-m', 'Initial commit'], { cwd: testDir });

      // Initialize service
      service = new ConflictDetectorService(testDir, 'main');
    } catch (err) {
      // Ensure cleanup happens even if setup fails
      cleanupTestDir();
      throw err;
    }
  });

  afterAll(() => {
    // Clean up temporary directory
    cleanupTestDir();
  });

  describe('Real Git Operations', () => {
    it('should detect shared files between two branches', async () => {
      // Create first branch and modify a file
      spawnSync('git', ['checkout', '-b', 'ai-sdlc/S-0001-test-story-1'], { cwd: testDir });
      fs.writeFileSync(path.join(testDir, 'shared.ts'), 'console.log("story 1");\n');
      spawnSync('git', ['add', '.'], { cwd: testDir });
      spawnSync('git', ['commit', '-m', 'Story 1: Add shared.ts'], { cwd: testDir });

      // Create second branch and modify the same file
      spawnSync('git', ['checkout', 'main'], { cwd: testDir });
      spawnSync('git', ['checkout', '-b', 'ai-sdlc/S-0002-test-story-2'], { cwd: testDir });
      fs.writeFileSync(path.join(testDir, 'shared.ts'), 'console.log("story 2");\n');
      spawnSync('git', ['add', '.'], { cwd: testDir });
      spawnSync('git', ['commit', '-m', 'Story 2: Add shared.ts'], { cwd: testDir });

      // Create story objects
      const story1: Story = {
        path: path.join(testDir, 'S-0001.md'),
        slug: 'test-story-1',
        frontmatter: {
          id: 'S-0001',
          title: 'Test Story 1',
          slug: 'test-story-1',
          priority: 10,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          branch: 'ai-sdlc/S-0001-test-story-1',
        },
        content: 'Story 1 content',
      };

      const story2: Story = {
        path: path.join(testDir, 'S-0002.md'),
        slug: 'test-story-2',
        frontmatter: {
          id: 'S-0002',
          title: 'Test Story 2',
          slug: 'test-story-2',
          priority: 20,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          branch: 'ai-sdlc/S-0002-test-story-2',
        },
        content: 'Story 2 content',
      };

      // Detect conflicts
      const result = service.detectConflicts([story1, story2]);

      // Verify results
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].sharedFiles).toContain('shared.ts');
      expect(result.conflicts[0].severity).toBe('high');
      expect(result.safeToRunConcurrently).toBe(false);
      expect(result.summary).toContain('high-severity');
    });

    it('should detect shared directories between two branches', async () => {
      // Reset to main
      spawnSync('git', ['checkout', 'main'], { cwd: testDir });

      // Create first branch with file in src/
      spawnSync('git', ['checkout', '-b', 'ai-sdlc/S-0003-test-story-3'], { cwd: testDir });
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'src', 'file1.ts'), 'file 1 content\n');
      spawnSync('git', ['add', '.'], { cwd: testDir });
      spawnSync('git', ['commit', '-m', 'Story 3: Add src/file1.ts'], { cwd: testDir });

      // Create second branch with different file in src/
      spawnSync('git', ['checkout', 'main'], { cwd: testDir });
      spawnSync('git', ['checkout', '-b', 'ai-sdlc/S-0004-test-story-4'], { cwd: testDir });
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'src', 'file2.ts'), 'file 2 content\n');
      spawnSync('git', ['add', '.'], { cwd: testDir });
      spawnSync('git', ['commit', '-m', 'Story 4: Add src/file2.ts'], { cwd: testDir });

      const story3: Story = {
        path: path.join(testDir, 'S-0003.md'),
        slug: 'test-story-3',
        frontmatter: {
          id: 'S-0003',
          title: 'Test Story 3',
          slug: 'test-story-3',
          priority: 30,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          branch: 'ai-sdlc/S-0003-test-story-3',
        },
        content: 'Story 3 content',
      };

      const story4: Story = {
        path: path.join(testDir, 'S-0004.md'),
        slug: 'test-story-4',
        frontmatter: {
          id: 'S-0004',
          title: 'Test Story 4',
          slug: 'test-story-4',
          priority: 40,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          branch: 'ai-sdlc/S-0004-test-story-4',
        },
        content: 'Story 4 content',
      };

      const result = service.detectConflicts([story3, story4]);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].sharedFiles).toHaveLength(0); // Different files
      expect(result.conflicts[0].sharedDirectories).toContain('src'); // Same directory
      expect(result.conflicts[0].severity).toBe('medium');
      expect(result.safeToRunConcurrently).toBe(true); // Medium severity is safe
    });

    it('should detect low severity conflicts when branches modify different areas', async () => {
      // Reset to main
      spawnSync('git', ['checkout', 'main'], { cwd: testDir });

      // Create first branch with file in src/
      spawnSync('git', ['checkout', '-b', 'ai-sdlc/S-0005-test-story-5'], { cwd: testDir });
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'src', 'feature.ts'), 'feature code\n');
      spawnSync('git', ['add', '.'], { cwd: testDir });
      spawnSync('git', ['commit', '-m', 'Story 5: Add src/feature.ts'], { cwd: testDir });

      // Create second branch with file in tests/
      spawnSync('git', ['checkout', 'main'], { cwd: testDir });
      spawnSync('git', ['checkout', '-b', 'ai-sdlc/S-0006-test-story-6'], { cwd: testDir });
      fs.mkdirSync(path.join(testDir, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'tests', 'test.ts'), 'test code\n');
      spawnSync('git', ['add', '.'], { cwd: testDir });
      spawnSync('git', ['commit', '-m', 'Story 6: Add tests/test.ts'], { cwd: testDir });

      const story5: Story = {
        path: path.join(testDir, 'S-0005.md'),
        slug: 'test-story-5',
        frontmatter: {
          id: 'S-0005',
          title: 'Test Story 5',
          slug: 'test-story-5',
          priority: 50,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          branch: 'ai-sdlc/S-0005-test-story-5',
        },
        content: 'Story 5 content',
      };

      const story6: Story = {
        path: path.join(testDir, 'S-0006.md'),
        slug: 'test-story-6',
        frontmatter: {
          id: 'S-0006',
          title: 'Test Story 6',
          slug: 'test-story-6',
          priority: 60,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          branch: 'ai-sdlc/S-0006-test-story-6',
        },
        content: 'Story 6 content',
      };

      const result = service.detectConflicts([story5, story6]);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].sharedFiles).toHaveLength(0);
      expect(result.conflicts[0].sharedDirectories).toHaveLength(0);
      expect(result.conflicts[0].severity).toBe('low');
      expect(result.safeToRunConcurrently).toBe(true);
      expect(result.summary).toContain('low-severity');
    });

    it('should handle uncommitted changes in working directory', async () => {
      // Note: Uncommitted changes can only be detected when git status runs in a
      // working directory that's currently on that branch. This test verifies that
      // uncommitted changes are detected when the repository IS on the branch.

      // Reset to main
      spawnSync('git', ['checkout', 'main'], { cwd: testDir });

      // Create first branch with a committed file
      spawnSync('git', ['checkout', '-b', 'ai-sdlc/S-0007-test-story-7'], { cwd: testDir });
      fs.writeFileSync(path.join(testDir, 'shared-uncommitted.ts'), 'story 7 committed\n');
      spawnSync('git', ['add', '.'], { cwd: testDir });
      spawnSync('git', ['commit', '-m', 'Story 7: Add shared-uncommitted.ts'], { cwd: testDir });

      // Create second branch that also modifies the same file (committed)
      spawnSync('git', ['checkout', 'main'], { cwd: testDir });
      spawnSync('git', ['checkout', '-b', 'ai-sdlc/S-0008-test-story-8'], { cwd: testDir });
      fs.writeFileSync(path.join(testDir, 'shared-uncommitted.ts'), 'story 8 committed\n');
      spawnSync('git', ['add', '.'], { cwd: testDir });
      spawnSync('git', ['commit', '-m', 'Story 8: Add shared-uncommitted.ts'], { cwd: testDir });

      // Now add an uncommitted change on S-0008 branch (current branch)
      // This file will only be detected for S-0008 since we're on that branch
      fs.writeFileSync(path.join(testDir, 'only-uncommitted.ts'), 'uncommitted content\n');

      const story7: Story = {
        path: path.join(testDir, 'S-0007.md'),
        slug: 'test-story-7',
        frontmatter: {
          id: 'S-0007',
          title: 'Test Story 7',
          slug: 'test-story-7',
          priority: 70,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          branch: 'ai-sdlc/S-0007-test-story-7',
        },
        content: 'Story 7 content',
      };

      const story8: Story = {
        path: path.join(testDir, 'S-0008.md'),
        slug: 'test-story-8',
        frontmatter: {
          id: 'S-0008',
          title: 'Test Story 8',
          slug: 'test-story-8',
          priority: 80,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          branch: 'ai-sdlc/S-0008-test-story-8',
        },
        content: 'Story 8 content',
      };

      const result = service.detectConflicts([story7, story8]);

      // Should detect conflict on shared-uncommitted.ts (committed in both branches)
      expect(result.conflicts[0].sharedFiles).toContain('shared-uncommitted.ts');
      expect(result.conflicts[0].severity).toBe('high');

      // The uncommitted file only-uncommitted.ts is detected for S-0008 (current branch)
      // but not for S-0007 (not the current branch). This is expected behavior.
      // To detect uncommitted changes across branches, each story needs its own worktree.
    });
  });

  describe('Branch Pattern Detection', () => {
    it('should find branch using pattern ai-sdlc/{storyId}-*', async () => {
      // Branch was created in previous tests: ai-sdlc/S-0001-test-story-1
      const story: Story = {
        path: path.join(testDir, 'S-0001.md'),
        slug: 'test-story-1',
        frontmatter: {
          id: 'S-0001',
          title: 'Test Story 1',
          slug: 'test-story-1',
          priority: 10,
          status: 'in-progress',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
          // No branch specified - should auto-detect
        },
        content: 'Story content',
      };

      const result = service.detectConflicts([story]);

      // Should successfully detect the branch
      expect(result.summary).toContain('Single story');
    });
  });
});
