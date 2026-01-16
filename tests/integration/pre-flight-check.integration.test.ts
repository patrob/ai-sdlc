import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { run, preFlightConflictCheck } from '../../src/cli/commands.js';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as readline from 'readline';
import * as story from '../../src/core/story.js';
import * as kanban from '../../src/core/kanban.js';
import * as conflictDetector from '../../src/core/conflict-detector.js';
import ora from 'ora';
import type { Story, ConflictDetectionResult } from '../../src/types/index.js';

// Mock dependencies
vi.mock('child_process');
vi.mock('fs');
vi.mock('ora');
vi.mock('readline');
vi.mock('../../src/core/client.js', () => ({
  runAgentQuery: vi.fn().mockResolvedValue({
    success: true,
    output: 'Mock agent output',
  }),
}));
vi.mock('../../src/core/theme.js', () => ({
  getThemedChalk: vi.fn(() => ({
    success: (s: string) => s,
    warning: (s: string) => s,
    error: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
    info: (s: string) => s,
  })),
}));

describe('Pre-Flight Conflict Check Integration', () => {
  const mockTargetStory: Story = {
    frontmatter: {
      id: 'S-0002',
      title: 'Target Story',
      slug: 'target-story',
      status: 'ready',
      priority: 20,
      type: 'feature',
      created: '2025-01-01',
      labels: [],
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
    },
    path: '/test/.ai-sdlc/stories/S-0002/story.md',
    slug: 'target-story',
    content: '# Target Story\n\nTest content',
  };

  const mockActiveStory: Story = {
    frontmatter: {
      id: 'S-0001',
      title: 'Active Story',
      slug: 'active-story',
      status: 'in-progress',
      priority: 10,
      type: 'feature',
      created: '2025-01-01',
      labels: [],
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
    },
    path: '/test/.ai-sdlc/stories/S-0001/story.md',
    slug: 'active-story',
    content: '# Active Story\n\nTest content',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ora spinner
    const mockSpinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      text: '',
    };
    vi.mocked(ora).mockReturnValue(mockSpinner as any);

    // Mock process.cwd and chdir
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
    vi.spyOn(process, 'chdir').mockImplementation(() => {});

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.stdin.isTTY for interactive mode by default
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true, configurable: true });

    // Mock fs operations
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr.includes('.ai-sdlc') && !pathStr.includes('worktrees/')) {
        return true;
      }
      if (pathStr.includes('worktrees/S-0002')) {
        return false;
      }
      return false;
    });
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => '');
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'readFileSync').mockReturnValue('---\nid: S-0002\n---\n# Test');
    vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);

    // Mock git operations - clean working directory
    vi.spyOn(cp, 'spawnSync').mockReturnValue({
      status: 0,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      output: [],
      pid: 0,
      signal: null,
    });

    // Mock story operations
    vi.spyOn(story, 'parseStory').mockReturnValue(mockTargetStory);
    vi.spyOn(story, 'writeStory').mockImplementation(() => {});
    vi.spyOn(story, 'updateStoryField').mockReturnValue({
      ...mockTargetStory,
      frontmatter: {
        ...mockTargetStory.frontmatter,
        worktree_path: '/test/project/.ai-sdlc/worktrees/S-0002-target-story',
      },
    });
    vi.spyOn(story, 'findStoryById').mockReturnValue(mockTargetStory);

    // Mock kanban operations
    vi.spyOn(kanban, 'assessState').mockResolvedValue({
      recommendedActions: [
        {
          type: 'implement',
          description: 'Implement the feature',
          storyPath: mockTargetStory.path,
          priority: 1,
          dependencies: [],
          blockers: [],
        },
      ],
      inProgress: [],
      blocked: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('preFlightConflictCheck function', () => {
    it('should proceed when user confirms in interactive mode with conflicts', async () => {
      // Mock active stories
      vi.spyOn(kanban, 'findStoriesByStatus').mockReturnValue([mockActiveStory]);

      // Mock conflict detection - conflicts detected
      const mockConflictResult: ConflictDetectionResult = {
        conflicts: [
          {
            storyA: 'S-0001',
            storyB: 'S-0002',
            sharedFiles: ['src/api/user.ts'],
            sharedDirectories: [],
            severity: 'high',
            recommendation: 'Run sequentially to avoid merge conflicts',
          },
        ],
        safeToRunConcurrently: false,
        summary: 'High severity conflict',
      };
      vi.spyOn(conflictDetector, 'detectConflicts').mockReturnValue(mockConflictResult);

      // Mock readline to simulate user confirming
      const mockRl = {
        question: vi.fn((question, callback) => {
          callback('y'); // User confirms
        }),
        close: vi.fn(),
      };
      vi.spyOn(readline, 'createInterface').mockReturnValue(mockRl as any);

      const result = await preFlightConflictCheck(mockTargetStory, '/test/.ai-sdlc', {});

      expect(result.proceed).toBe(true);
      expect(result.warnings).toContain('User confirmed with conflicts');
      expect(mockRl.question).toHaveBeenCalledWith('Continue anyway? (y/N): ', expect.any(Function));
    });

    it('should abort when user declines in interactive mode with conflicts', async () => {
      // Mock active stories
      vi.spyOn(kanban, 'findStoriesByStatus').mockReturnValue([mockActiveStory]);

      // Mock conflict detection - conflicts detected
      const mockConflictResult: ConflictDetectionResult = {
        conflicts: [
          {
            storyA: 'S-0001',
            storyB: 'S-0002',
            sharedFiles: ['src/api/user.ts'],
            sharedDirectories: [],
            severity: 'high',
            recommendation: 'Run sequentially to avoid merge conflicts',
          },
        ],
        safeToRunConcurrently: false,
        summary: 'High severity conflict',
      };
      vi.spyOn(conflictDetector, 'detectConflicts').mockReturnValue(mockConflictResult);

      // Mock readline to simulate user declining
      const mockRl = {
        question: vi.fn((question, callback) => {
          callback('n'); // User declines
        }),
        close: vi.fn(),
      };
      vi.spyOn(readline, 'createInterface').mockReturnValue(mockRl as any);

      const result = await preFlightConflictCheck(mockTargetStory, '/test/.ai-sdlc', {});

      expect(result.proceed).toBe(false);
      expect(result.warnings).toContain('Conflicts detected');
    });
  });

  describe('run command with pre-flight check', () => {
    it('should abort run command when conflicts detected and user declines', async () => {
      // Mock active stories
      vi.spyOn(kanban, 'findStoriesByStatus').mockReturnValue([mockActiveStory]);

      // Mock conflict detection - conflicts detected
      const mockConflictResult: ConflictDetectionResult = {
        conflicts: [
          {
            storyA: 'S-0001',
            storyB: 'S-0002',
            sharedFiles: ['src/api/user.ts'],
            sharedDirectories: [],
            severity: 'high',
            recommendation: 'Run sequentially',
          },
        ],
        safeToRunConcurrently: false,
        summary: 'High severity conflict',
      };
      vi.spyOn(conflictDetector, 'detectConflicts').mockReturnValue(mockConflictResult);

      // Mock readline to simulate user declining
      const mockRl = {
        question: vi.fn((question, callback) => {
          callback('n'); // User declines
        }),
        close: vi.fn(),
      };
      vi.spyOn(readline, 'createInterface').mockReturnValue(mockRl as any);

      await run({ story: 'S-0002', worktree: true });

      // Verify error message was shown
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('❌ Aborting'));
    });

    it('should proceed with run command when --force flag bypasses check', async () => {
      // Mock active stories (should not be called due to --force)
      const findStoriesSpy = vi.spyOn(kanban, 'findStoriesByStatus').mockReturnValue([mockActiveStory]);

      // Mock conflict detection (should not be called due to --force)
      const detectConflictsSpy = vi.spyOn(conflictDetector, 'detectConflicts');

      await run({ story: 'S-0002', worktree: true, force: true });

      // Verify conflict check was skipped
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Skipping conflict check'));
      // findStoriesByStatus should not be called when --force is used
      expect(findStoriesSpy).not.toHaveBeenCalled();
      expect(detectConflictsSpy).not.toHaveBeenCalled();
    });

    it('should proceed with run command when no conflicts exist', async () => {
      // Mock no active stories
      vi.spyOn(kanban, 'findStoriesByStatus').mockReturnValue([]);

      await run({ story: 'S-0002', worktree: true });

      // Verify success message was shown
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✓ Conflict check: No overlapping files'));
    });

    it('should default to declining in non-interactive mode with conflicts', async () => {
      // Simulate non-interactive terminal
      Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true, configurable: true });

      // Mock active stories
      vi.spyOn(kanban, 'findStoriesByStatus').mockReturnValue([mockActiveStory]);

      // Mock conflict detection - conflicts detected
      const mockConflictResult: ConflictDetectionResult = {
        conflicts: [
          {
            storyA: 'S-0001',
            storyB: 'S-0002',
            sharedFiles: ['src/api/user.ts'],
            sharedDirectories: [],
            severity: 'high',
            recommendation: 'Run sequentially',
          },
        ],
        safeToRunConcurrently: false,
        summary: 'High severity conflict',
      };
      vi.spyOn(conflictDetector, 'detectConflicts').mockReturnValue(mockConflictResult);

      await run({ story: 'S-0002', worktree: true });

      // Verify abort message shown
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('❌ Aborting'));
      // Verify non-interactive mode message shown
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Non-interactive mode'));
    });

    it('should proceed when user confirms with conflicts in interactive mode', async () => {
      // Mock active stories
      vi.spyOn(kanban, 'findStoriesByStatus').mockReturnValue([mockActiveStory]);

      // Mock conflict detection - conflicts detected
      const mockConflictResult: ConflictDetectionResult = {
        conflicts: [
          {
            storyA: 'S-0001',
            storyB: 'S-0002',
            sharedFiles: ['src/api/user.ts'],
            sharedDirectories: [],
            severity: 'high',
            recommendation: 'Run sequentially',
          },
        ],
        safeToRunConcurrently: false,
        summary: 'High severity conflict',
      };
      vi.spyOn(conflictDetector, 'detectConflicts').mockReturnValue(mockConflictResult);

      // Mock readline to simulate user confirming
      const mockRl = {
        question: vi.fn((question, callback) => {
          callback('y'); // User confirms
        }),
        close: vi.fn(),
      };
      vi.spyOn(readline, 'createInterface').mockReturnValue(mockRl as any);

      await run({ story: 'S-0002', worktree: true });

      // Verify warning message shown but execution continues
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('User confirmed with conflicts'));
      // Verify abort message NOT shown
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('❌ Aborting'));
    });

    it('should skip pre-flight check when not using worktree mode', async () => {
      // Mock active stories (should not be called without worktree)
      const findStoriesSpy = vi.spyOn(kanban, 'findStoriesByStatus').mockReturnValue([mockActiveStory]);

      // Run without worktree flag
      await run({ story: 'S-0002' });

      // Verify conflict check was not performed
      expect(findStoriesSpy).not.toHaveBeenCalled();
    });
  });
});
