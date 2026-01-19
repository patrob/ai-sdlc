import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../../src/cli/commands.js';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as story from '../../src/core/story.js';
import * as kanban from '../../src/core/kanban.js';
import * as workflowState from '../../src/core/workflow-state.js';
import ora from 'ora';
import * as readline from 'readline';

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

describe('Clean and Restart Integration', () => {
  const mockStory = {
    frontmatter: {
      id: 'S-0064',
      title: 'Test Clean Restart',
      slug: 'test-clean-restart',
      status: 'in-progress' as const,
      priority: 1,
      labels: [],
      effort: 'medium' as const,
      research_complete: true,
      plan_complete: true,
      implementation_complete: false,
      reviews_complete: false,
      worktree_path: '/test/project/.ai-sdlc/worktrees/S-0064-test-clean-restart',
      branch: 'ai-sdlc/S-0064-test-clean-restart',
      next_action: {
        type: 'implement' as const,
        description: 'Test implementation',
      },
    },
    path: '/test/.ai-sdlc/stories/S-0064/story.md',
    slug: 'test-clean-restart',
    content: '# Test Story\n\nTest content',
  };

  let mockSpinner: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ora spinner
    mockSpinner = {
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
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock fs operations
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const pathStr = String(p);
      // Parent directories exist
      if (pathStr.includes('.ai-sdlc') && !pathStr.includes('worktrees/')) {
        return true;
      }
      // Worktree path exists (for cleanup tests)
      if (pathStr.includes('worktrees/S-0064')) {
        return true;
      }
      return false;
    });
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => '');
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'readFileSync').mockReturnValue('---\nid: S-0064\n---\n# Test');
    vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);

    // Default git operations - clean state
    vi.spyOn(cp, 'spawnSync').mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      output: [],
      pid: 0,
      signal: null,
    });

    // Mock story operations
    vi.spyOn(story, 'parseStory').mockReturnValue(mockStory);
    vi.spyOn(story, 'writeStory').mockImplementation(() => {});
    vi.spyOn(story, 'updateStoryField').mockImplementation((s, field, value) => ({
      ...s,
      frontmatter: { ...s.frontmatter, [field]: value },
    }));
    vi.spyOn(story, 'findStoryById').mockReturnValue(mockStory);
    vi.spyOn(story, 'resetWorkflowState').mockImplementation(async (s) => ({
      ...s,
      frontmatter: {
        ...s.frontmatter,
        worktree_path: undefined,
        branch: undefined,
        status: 'ready' as const,
      },
    }));

    // Mock kanban operations
    vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(null);
    vi.spyOn(kanban, 'kanbanExists').mockReturnValue(true);
    vi.spyOn(kanban, 'assessState').mockReturnValue({
      ready: [],
      inProgress: [mockStory],
      blocked: [],
      done: [],
      recommendedActions: [
        {
          type: 'implement' as const,
          storyId: 'S-0064',
          storyPath: '/test/.ai-sdlc/stories/S-0064/story.md',
          description: 'Test implementation',
          priority: 1,
        },
      ],
    });

    // Mock workflow state operations
    vi.spyOn(workflowState, 'hasWorkflowState').mockReturnValue(false);
    vi.spyOn(workflowState, 'clearWorkflowState').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Test 1: Full Clean and Restart Workflow', () => {
    it('cleans up existing worktree and creates fresh one with --clean --force', async () => {
      // Setup: Mock existing worktree with commits and uncommitted changes
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

      // Mock git worktree list to show existing worktree
      spawnSyncSpy.mockImplementation((cmd, args) => {
        if (cmd === 'git' && Array.isArray(args)) {
          // Git worktree list --porcelain (shows existing worktree)
          if (args[0] === 'worktree' && args[1] === 'list' && args[2] === '--porcelain') {
            return {
              status: 0,
              stdout: `worktree /test/project/.ai-sdlc/worktrees/S-0064-test-clean-restart
HEAD 1234567890abcdef
branch refs/heads/ai-sdlc/S-0064-test-clean-restart
`,
              stderr: '',
              output: [],
              pid: 0,
              signal: null,
            };
          }

          // Git status --porcelain (show uncommitted changes)
          if (args[0] === 'status' && args[1] === '--porcelain') {
            return {
              status: 0,
              stdout: 'M src/file.ts\n?? temp.txt\n',
              stderr: '',
              output: [],
              pid: 0,
              signal: null,
            };
          }

          // Git rev-list @{u}..HEAD --count (unpushed commits)
          if (args[0] === 'rev-list' && args[1] === '@{u}..HEAD') {
            return { status: 0, stdout: '2', stderr: '', output: [], pid: 0, signal: null };
          }

          // Git rev-list --count HEAD (total commits)
          if (args[0] === 'rev-list' && args[1] === '--count') {
            return { status: 0, stdout: '5', stderr: '', output: [], pid: 0, signal: null };
          }

          // Git ls-remote (check remote branch)
          if (args[0] === 'ls-remote') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          // Git worktree remove --force (cleanup)
          if (args[0] === 'worktree' && args[1] === 'remove' && args[2] === '--force') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          // Git branch -D (delete branch)
          if (args[0] === 'branch' && args[1] === '-D') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          // Git rev-parse (branch detection for new worktree)
          if (args[0] === 'rev-parse') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          // Git worktree add (create new worktree)
          if (args[0] === 'worktree' && args[1] === 'add') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      // Run command with --clean --force
      await run({
        story: 'S-0064',
        worktree: true,
        clean: true,
        force: true,
      } as any);

      // Verify cleanup summary was displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Cleanup Summary'));

      // Verify worktree was force removed (due to uncommitted changes)
      const removeCall = spawnSyncSpy.mock.calls.find(
        (call) => call[0] === 'git' && Array.isArray(call[1]) && call[1][0] === 'worktree' && call[1][1] === 'remove'
      );
      expect(removeCall).toBeDefined();
      expect(removeCall![1]).toContain('--force');

      // Verify branch was deleted
      const branchDeleteCall = spawnSyncSpy.mock.calls.find(
        (call) => call[0] === 'git' && Array.isArray(call[1]) && call[1][0] === 'branch' && call[1][1] === '-D'
      );
      expect(branchDeleteCall).toBeDefined();

      // Verify story state was reset
      expect(story.resetWorkflowState).toHaveBeenCalled();

      // Verify cleanup spinner showed success
      expect(mockSpinner.succeed).toHaveBeenCalled();

      // Verify fresh worktree was created
      const worktreeAddCall = spawnSyncSpy.mock.calls.find(
        (call) => call[0] === 'git' && Array.isArray(call[1]) && call[1][0] === 'worktree' && call[1][1] === 'add'
      );
      expect(worktreeAddCall).toBeDefined();
    });
  });

  describe('Test 2: Cleanup with Unpushed Commits Warning', () => {
    it('displays warning about unpushed commits and prompts for confirmation', async () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

      // Mock existing worktree with unpushed commits
      spawnSyncSpy.mockImplementation((cmd, args) => {
        if (cmd === 'git' && Array.isArray(args)) {
          if (args[0] === 'worktree' && args[1] === 'list' && args[2] === '--porcelain') {
            return {
              status: 0,
              stdout: `worktree /test/project/.ai-sdlc/worktrees/S-0064-test-clean-restart
HEAD 1234567890abcdef
branch refs/heads/ai-sdlc/S-0064-test-clean-restart
`,
              stderr: '',
              output: [],
              pid: 0,
              signal: null,
            };
          }

          // Clean working directory
          if (args[0] === 'status' && args[1] === '--porcelain') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          // 3 unpushed commits
          if (args[0] === 'rev-list' && args[1] === '@{u}..HEAD') {
            return { status: 0, stdout: '3', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'rev-list' && args[1] === '--count') {
            return { status: 0, stdout: '8', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'ls-remote') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'worktree' && args[1] === 'remove') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'branch' && args[1] === '-D') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      // Mock readline to respond "y"
      const mockRl = {
        question: vi.fn((prompt, callback) => {
          callback('y');
        }),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      // Run command with --clean (without --force)
      await run({
        story: 'S-0064',
        worktree: true,
        clean: true,
      } as any);

      // Verify summary shows unpushed commits warning
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Unpushed Commits:'));

      // Verify data loss warning was shown
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('WARNING: This will DELETE'));

      // Verify confirmation prompt was called
      expect(mockRl.question).toHaveBeenCalled();

      // Verify cleanup proceeded after confirmation
      expect(mockSpinner.succeed).toHaveBeenCalled();
    });
  });

  describe('Test 3: Cleanup with Remote Branch', () => {
    it('prompts for remote branch deletion when branch exists on remote', async () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

      spawnSyncSpy.mockImplementation((cmd, args) => {
        if (cmd === 'git' && Array.isArray(args)) {
          if (args[0] === 'worktree' && args[1] === 'list' && args[2] === '--porcelain') {
            return {
              status: 0,
              stdout: `worktree /test/project/.ai-sdlc/worktrees/S-0064-test-clean-restart
HEAD 1234567890abcdef
branch refs/heads/ai-sdlc/S-0064-test-clean-restart
`,
              stderr: '',
              output: [],
              pid: 0,
              signal: null,
            };
          }

          if (args[0] === 'status' && args[1] === '--porcelain') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'rev-list' && args[1] === '@{u}..HEAD') {
            return { status: 0, stdout: '0', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'rev-list' && args[1] === '--count') {
            return { status: 0, stdout: '4', stderr: '', output: [], pid: 0, signal: null };
          }

          // Branch EXISTS on remote
          if (args[0] === 'ls-remote') {
            return {
              status: 0,
              stdout: '1234567890abcdef refs/heads/ai-sdlc/S-0064-test-clean-restart',
              stderr: '',
              output: [],
              pid: 0,
              signal: null,
            };
          }

          if (args[0] === 'worktree' && args[1] === 'remove') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'branch' && args[1] === '-D') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          // Git push origin --delete
          if (args[0] === 'push' && args[1] === 'origin' && args[2] === '--delete') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      // Mock readline to respond "y" twice (first for cleanup, second for remote deletion)
      let callCount = 0;
      const mockRl = {
        question: vi.fn((prompt, callback) => {
          callCount++;
          callback('y');
        }),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      await run({
        story: 'S-0064',
        worktree: true,
        clean: true,
      } as any);

      // Verify summary shows remote branch exists
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Remote Branch:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('EXISTS'));

      // Verify two prompts were shown (cleanup + remote deletion)
      expect(mockRl.question).toHaveBeenCalledTimes(2);

      // Verify remote branch was deleted
      const remotePushCall = spawnSyncSpy.mock.calls.find(
        (call) => call[0] === 'git' && Array.isArray(call[1]) && call[1][0] === 'push' && call[1][2] === '--delete'
      );
      expect(remotePushCall).toBeDefined();
    });

    it('skips remote branch deletion when user responds no', async () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

      spawnSyncSpy.mockImplementation((cmd, args) => {
        if (cmd === 'git' && Array.isArray(args)) {
          if (args[0] === 'worktree' && args[1] === 'list' && args[2] === '--porcelain') {
            return {
              status: 0,
              stdout: `worktree /test/project/.ai-sdlc/worktrees/S-0064-test-clean-restart
HEAD 1234567890abcdef
branch refs/heads/ai-sdlc/S-0064-test-clean-restart
`,
              stderr: '',
              output: [],
              pid: 0,
              signal: null,
            };
          }

          if (args[0] === 'status' && args[1] === '--porcelain') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'rev-list') {
            return { status: 0, stdout: '0', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'ls-remote') {
            return { status: 0, stdout: 'exists', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'worktree' && args[1] === 'remove') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'branch' && args[1] === '-D') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      // Mock readline: respond "y" for cleanup, "N" for remote deletion
      let callCount = 0;
      const mockRl = {
        question: vi.fn((prompt, callback) => {
          callCount++;
          callback(callCount === 1 ? 'y' : 'N');
        }),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      await run({
        story: 'S-0064',
        worktree: true,
        clean: true,
      } as any);

      // Verify remote branch was NOT deleted
      const remotePushCall = spawnSyncSpy.mock.calls.find(
        (call) => call[0] === 'git' && Array.isArray(call[1]) && call[1][0] === 'push'
      );
      expect(remotePushCall).toBeUndefined();

      // But cleanup still succeeded
      expect(mockSpinner.succeed).toHaveBeenCalled();
    });
  });

  describe('Test 4: Abort Cleanup on User Rejection', () => {
    it('aborts cleanup when user responds no to confirmation', async () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

      spawnSyncSpy.mockImplementation((cmd, args) => {
        if (cmd === 'git' && Array.isArray(args)) {
          if (args[0] === 'worktree' && args[1] === 'list' && args[2] === '--porcelain') {
            return {
              status: 0,
              stdout: `worktree /test/project/.ai-sdlc/worktrees/S-0064-test-clean-restart
HEAD 1234567890abcdef
branch refs/heads/ai-sdlc/S-0064-test-clean-restart
`,
              stderr: '',
              output: [],
              pid: 0,
              signal: null,
            };
          }

          if (args[0] === 'status' && args[1] === '--porcelain') {
            return { status: 0, stdout: 'M src/file.ts\n', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'rev-list') {
            return { status: 0, stdout: '1', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'ls-remote') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      // Mock readline to respond "N"
      const mockRl = {
        question: vi.fn((prompt, callback) => {
          callback('N');
        }),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      await run({
        story: 'S-0064',
        worktree: true,
        clean: true,
      } as any);

      // Verify confirmation prompt was called
      expect(mockRl.question).toHaveBeenCalled();

      // Verify "cancelled" message was shown
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('cancelled'));

      // Verify worktree was NOT removed
      const removeCall = spawnSyncSpy.mock.calls.find(
        (call) => call[0] === 'git' && Array.isArray(call[1]) && call[1][0] === 'worktree' && call[1][1] === 'remove'
      );
      expect(removeCall).toBeUndefined();

      // Verify branch was NOT deleted
      const branchDeleteCall = spawnSyncSpy.mock.calls.find(
        (call) => call[0] === 'git' && Array.isArray(call[1]) && call[1][0] === 'branch'
      );
      expect(branchDeleteCall).toBeUndefined();

      // Verify story state was NOT reset
      expect(story.resetWorkflowState).not.toHaveBeenCalled();
    });
  });

  describe('Test 5: Orphaned Worktree Metadata', () => {
    it('cleans up metadata when worktree path does not exist', async () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

      // Mock worktree list showing NO worktree (orphaned metadata case)
      spawnSyncSpy.mockImplementation((cmd, args) => {
        if (cmd === 'git' && Array.isArray(args)) {
          if (args[0] === 'worktree' && args[1] === 'list' && args[2] === '--porcelain') {
            // Return empty list (no worktree exists)
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'rev-parse') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'worktree' && args[1] === 'add') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      // Mock fs to show worktree path doesn't exist
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('.ai-sdlc') && !pathStr.includes('worktrees/')) {
          return true;
        }
        // Worktree path does NOT exist
        if (pathStr.includes('worktrees/S-0064')) {
          return false;
        }
        return false;
      });

      await run({
        story: 'S-0064',
        worktree: true,
        clean: true,
        force: true,
      } as any);

      // Verify no errors were thrown
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Error:'));

      // Verify fresh worktree was created
      const worktreeAddCall = spawnSyncSpy.mock.calls.find(
        (call) => call[0] === 'git' && Array.isArray(call[1]) && call[1][0] === 'worktree' && call[1][1] === 'add'
      );
      expect(worktreeAddCall).toBeDefined();
    });
  });

  describe('Test 6: Orphaned Branch Metadata', () => {
    it('handles branch not found gracefully during cleanup', async () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

      spawnSyncSpy.mockImplementation((cmd, args) => {
        if (cmd === 'git' && Array.isArray(args)) {
          if (args[0] === 'worktree' && args[1] === 'list' && args[2] === '--porcelain') {
            return {
              status: 0,
              stdout: `worktree /test/project/.ai-sdlc/worktrees/S-0064-test-clean-restart
HEAD 1234567890abcdef
branch refs/heads/ai-sdlc/S-0064-test-clean-restart
`,
              stderr: '',
              output: [],
              pid: 0,
              signal: null,
            };
          }

          if (args[0] === 'status' && args[1] === '--porcelain') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'rev-list') {
            return { status: 0, stdout: '0', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'ls-remote') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'worktree' && args[1] === 'remove') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          // Branch delete fails with "not found" error
          if (args[0] === 'branch' && args[1] === '-D') {
            return {
              status: 1,
              stdout: '',
              stderr: "error: branch 'ai-sdlc/S-0064-test-clean-restart' not found",
              output: [],
              pid: 0,
              signal: null,
            };
          }

          if (args[0] === 'rev-parse') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'worktree' && args[1] === 'add') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      await run({
        story: 'S-0064',
        worktree: true,
        clean: true,
        force: true,
      } as any);

      // Verify cleanup still succeeded (branch deletion is idempotent)
      expect(mockSpinner.succeed).toHaveBeenCalled();

      // Verify story state was reset
      expect(story.resetWorkflowState).toHaveBeenCalled();

      // Verify fresh worktree was created
      const worktreeAddCall = spawnSyncSpy.mock.calls.find(
        (call) => call[0] === 'git' && Array.isArray(call[1]) && call[1][0] === 'worktree' && call[1][1] === 'add'
      );
      expect(worktreeAddCall).toBeDefined();
    });
  });

  describe('Test 7: Worktree Locked/In-Use', () => {
    it('fails gracefully with helpful error when worktree is locked', async () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

      spawnSyncSpy.mockImplementation((cmd, args) => {
        if (cmd === 'git' && Array.isArray(args)) {
          if (args[0] === 'worktree' && args[1] === 'list' && args[2] === '--porcelain') {
            return {
              status: 0,
              stdout: `worktree /test/project/.ai-sdlc/worktrees/S-0064-test-clean-restart
HEAD 1234567890abcdef
branch refs/heads/ai-sdlc/S-0064-test-clean-restart
`,
              stderr: '',
              output: [],
              pid: 0,
              signal: null,
            };
          }

          if (args[0] === 'status' && args[1] === '--porcelain') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'rev-list') {
            return { status: 0, stdout: '0', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'ls-remote') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          // Worktree remove fails with "locked" error
          if (args[0] === 'worktree' && args[1] === 'remove') {
            return {
              status: 1,
              stdout: '',
              stderr: 'fatal: worktree is locked',
              output: [],
              pid: 0,
              signal: null,
            };
          }
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      await run({
        story: 'S-0064',
        worktree: true,
        clean: true,
        force: true,
      } as any);

      // Verify spinner failed
      expect(mockSpinner.fail).toHaveBeenCalled();

      // Verify error message was shown
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));

      // Verify story state was NOT reset (rollback)
      expect(story.resetWorkflowState).not.toHaveBeenCalled();
    });
  });

  describe('Test 8: Force Flag Skips Confirmation', () => {
    it('skips confirmation prompt when --force is provided', async () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

      spawnSyncSpy.mockImplementation((cmd, args) => {
        if (cmd === 'git' && Array.isArray(args)) {
          if (args[0] === 'worktree' && args[1] === 'list' && args[2] === '--porcelain') {
            return {
              status: 0,
              stdout: `worktree /test/project/.ai-sdlc/worktrees/S-0064-test-clean-restart
HEAD 1234567890abcdef
branch refs/heads/ai-sdlc/S-0064-test-clean-restart
`,
              stderr: '',
              output: [],
              pid: 0,
              signal: null,
            };
          }

          if (args[0] === 'status' && args[1] === '--porcelain') {
            return { status: 0, stdout: 'M file.ts\n', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'rev-list') {
            return { status: 0, stdout: '1', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'ls-remote') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'worktree' && args[1] === 'remove') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'branch') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'rev-parse') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'worktree' && args[1] === 'add') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      const mockRl = {
        question: vi.fn(),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      await run({
        story: 'S-0064',
        worktree: true,
        clean: true,
        force: true,
      } as any);

      // Verify confirmation prompt was NOT called
      expect(mockRl.question).not.toHaveBeenCalled();

      // Verify cleanup proceeded immediately
      expect(mockSpinner.succeed).toHaveBeenCalled();

      // Verify worktree was removed
      const removeCall = spawnSyncSpy.mock.calls.find(
        (call) => call[0] === 'git' && Array.isArray(call[1]) && call[1][0] === 'worktree' && call[1][1] === 'remove'
      );
      expect(removeCall).toBeDefined();
    });
  });

  describe('Test 9: Validation - Clean Requires Story Flag', () => {
    it('shows error when --clean is used without --story', async () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

      await run({
        worktree: true,
        clean: true,
        // story flag omitted
      } as any);

      // Verify error message was displayed (worktree mode requires story)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('--worktree requires --story')
      );

      // Verify no cleanup operations were attempted
      const removeCall = spawnSyncSpy.mock.calls.find(
        (call) => call[0] === 'git' && Array.isArray(call[1]) && call[1][0] === 'worktree' && call[1][1] === 'remove'
      );
      expect(removeCall).toBeUndefined();
    });
  });

  describe('Test 10: Cleanup Summary Display', () => {
    it('displays comprehensive cleanup summary with correct formatting', async () => {
      const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

      spawnSyncSpy.mockImplementation((cmd, args) => {
        if (cmd === 'git' && Array.isArray(args)) {
          if (args[0] === 'worktree' && args[1] === 'list' && args[2] === '--porcelain') {
            return {
              status: 0,
              stdout: `worktree /test/project/.ai-sdlc/worktrees/S-0064-test-clean-restart
HEAD 1234567890abcdef
branch refs/heads/ai-sdlc/S-0064-test-clean-restart
`,
              stderr: '',
              output: [],
              pid: 0,
              signal: null,
            };
          }

          // 3 modified files, 1 untracked file
          if (args[0] === 'status' && args[1] === '--porcelain') {
            return {
              status: 0,
              stdout: 'M src/file1.ts\nM src/file2.ts\nM src/file3.ts\n?? temp.txt\n',
              stderr: '',
              output: [],
              pid: 0,
              signal: null,
            };
          }

          // 2 unpushed commits
          if (args[0] === 'rev-list' && args[1] === '@{u}..HEAD') {
            return { status: 0, stdout: '2', stderr: '', output: [], pid: 0, signal: null };
          }

          // 7 total commits
          if (args[0] === 'rev-list' && args[1] === '--count') {
            return { status: 0, stdout: '7', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'ls-remote') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'worktree' && args[1] === 'remove') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }

          if (args[0] === 'branch') {
            return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
          }
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      const mockRl = {
        question: vi.fn((prompt, callback) => callback('y')),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      await run({
        story: 'S-0064',
        worktree: true,
        clean: true,
      } as any);

      // Verify all summary fields were displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Cleanup Summary:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Worktree Path:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Branch:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Total Commits:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('7')); // Total commits
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Unpushed Commits:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('2')); // Unpushed commits
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Modified Files:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('3')); // Modified files
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Untracked Files:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('1')); // Untracked files
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Remote Branch:'));

      // Verify data loss warning was shown
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('WARNING: This will DELETE'));
    });
  });
});
