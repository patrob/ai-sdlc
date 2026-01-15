import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../../src/cli/commands.js';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as story from '../../src/core/story.js';
import * as kanban from '../../src/core/kanban.js';
import ora from 'ora';

// Mock dependencies
vi.mock('child_process');
vi.mock('fs');
vi.mock('ora');
vi.mock('../../src/core/client.js', () => ({
  runAgentQuery: vi.fn().mockResolvedValue({
    success: true,
    output: 'Mock agent output',
  }),
}));

describe('Worktree Workflow Integration', () => {
  const mockStory = {
    frontmatter: {
      id: 'S-0029',
      title: 'Test Story',
      slug: 'test-story',
      status: 'ready' as const,
      priority: 1,
      labels: [],
      effort: 'small' as const,
      next_action: {
        type: 'implement' as const,
        description: 'Test implementation',
      },
    },
    path: '/test/.ai-sdlc/stories/S-0029/story.md',
    slug: 'test-story',
    content: '# Test Story\n\nTest content',
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

    // Mock process.cwd to return consistent path
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
    vi.spyOn(process, 'chdir').mockImplementation(() => {});

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock fs operations
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => '');
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'readFileSync').mockReturnValue('---\nid: S-0029\n---\n# Test');
    vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);

    // Mock git operations - clean working directory
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
    vi.spyOn(story, 'updateStoryField').mockReturnValue({
      ...mockStory,
      frontmatter: {
        ...mockStory.frontmatter,
        worktree_path: '/test/project/.ai-sdlc/worktrees/S-0029-test-story',
      },
    });
    vi.spyOn(story, 'findStoryById').mockReturnValue(mockStory);

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
          storyId: 'S-0029',
          storyPath: '/test/.ai-sdlc/stories/S-0029/story.md',
          description: 'Test implementation',
          priority: 1,
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('run command accepts --worktree flag', async () => {
    // This test verifies that the run function accepts the worktree option
    // without throwing an error during option parsing
    await expect(
      run({
        story: 'S-0029',
        worktree: true,
      })
    ).resolves.not.toThrow();
  });

  it('run command requires --story flag when using --worktree', async () => {
    // Mock console.log to capture error message
    const logSpy = vi.spyOn(console, 'log');

    await run({
      worktree: true,
      // story flag omitted
    } as any);

    // Should log error about missing --story flag
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('--worktree requires --story')
    );
  });

  it('worktree creation stores worktree_path in story frontmatter', async () => {
    const updateFieldSpy = vi.spyOn(story, 'updateStoryField');

    await run({
      story: 'S-0029',
      worktree: true,
    });

    // Verify updateStoryField was called with worktree_path
    expect(updateFieldSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        frontmatter: expect.objectContaining({
          id: 'S-0029',
        }),
      }),
      'worktree_path',
      expect.stringMatching(/\.ai-sdlc\/worktrees\/S-0029-test-story$/)
    );
  });

  it('working directory is restored after successful workflow', async () => {
    const chdirSpy = vi.spyOn(process, 'chdir');
    const originalCwd = '/test/project';

    // Reset mock to track calls
    chdirSpy.mockClear();

    await run({
      story: 'S-0029',
      worktree: true,
    });

    // Should call chdir twice: once to worktree, once back
    expect(chdirSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\.ai-sdlc\/worktrees\/S-0029-test-story$/)
    );
    expect(chdirSpy).toHaveBeenCalledWith(originalCwd);
  });

  it('working directory is restored after workflow error', async () => {
    const chdirSpy = vi.spyOn(process, 'chdir');
    const originalCwd = '/test/project';

    // Smart mock: pass validation and branch detection, fail on worktree add
    vi.spyOn(cp, 'spawnSync').mockImplementation((cmd, args) => {
      if (cmd === 'git' && Array.isArray(args)) {
        // Git status (validation) - return clean
        if (args[0] === 'status' && args[1] === '--porcelain') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        }
        // Branch detection - main exists
        if (args[0] === 'rev-parse' && args[2] === 'main') {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        }
        // Worktree add - FAIL with error
        if (args[0] === 'worktree' && args[1] === 'add') {
          return { status: 1, stdout: '', stderr: 'fatal: worktree error', output: [], pid: 0, signal: null };
        }
      }
      return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
    });

    chdirSpy.mockClear();

    await run({
      story: 'S-0029',
      worktree: true,
    });

    // Should restore directory even on error (chdir called with originalCwd in catch block)
    expect(chdirSpy).toHaveBeenCalledWith(originalCwd);
  });

  it('refuses worktree creation when uncommitted changes exist', async () => {
    const logSpy = vi.spyOn(console, 'log');

    // Mock git status to show uncommitted changes
    vi.spyOn(cp, 'spawnSync').mockReturnValue({
      status: 0,
      stdout: 'M src/file.ts\n',
      stderr: '',
      output: [],
      pid: 0,
      signal: null,
    });

    await run({
      story: 'S-0029',
      worktree: true,
    });

    // Should log error about uncommitted changes
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('uncommitted changes')
    );
  });

  it('executes git worktree add command with correct parameters', async () => {
    const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

    // First call will be git status (clean), second will be branch detection, third will be worktree add
    spawnSyncSpy.mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      output: [],
      pid: 0,
      signal: null,
    });

    await run({
      story: 'S-0029',
      worktree: true,
    });

    // Find the worktree add call
    const worktreeCall = spawnSyncSpy.mock.calls.find(
      (call) =>
        call[0] === 'git' &&
        Array.isArray(call[1]) &&
        call[1][0] === 'worktree' &&
        call[1][1] === 'add'
    );

    expect(worktreeCall).toBeDefined();
    expect(worktreeCall![1]).toEqual([
      'worktree',
      'add',
      '-b',
      'ai-sdlc/S-0029-test-story',
      expect.stringMatching(/\.ai-sdlc\/worktrees\/S-0029-test-story$/),
      'main', // or 'master' depending on detection
    ]);
  });

  it('handles worktree path already exists error', async () => {
    const logSpy = vi.spyOn(console, 'log');

    // Mock worktree path as already existing
    vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('worktrees/S-0029-test-story')) {
        return true;
      }
      return false;
    });

    await run({
      story: 'S-0029',
      worktree: true,
    });

    // Should log error about path already existing
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('already exists')
    );
  });

  it('detects and uses main branch as base', async () => {
    const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

    // Mock git rev-parse to succeed for 'main' branch
    spawnSyncSpy.mockImplementation((cmd, args) => {
      if (
        cmd === 'git' &&
        Array.isArray(args) &&
        args[0] === 'rev-parse' &&
        args[2] === 'main'
      ) {
        return {
          status: 0,
          stdout: '',
          stderr: '',
          output: [],
          pid: 0,
          signal: null,
        };
      }
      return {
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      };
    });

    await run({
      story: 'S-0029',
      worktree: true,
    });

    // Find the worktree add call
    const worktreeCall = spawnSyncSpy.mock.calls.find(
      (call) =>
        call[0] === 'git' &&
        Array.isArray(call[1]) &&
        call[1][0] === 'worktree' &&
        call[1][1] === 'add'
    );

    // Should use 'main' as the base branch
    expect(worktreeCall![1][5]).toBe('main');
  });

  it('falls back to master branch when main does not exist', async () => {
    const spawnSyncSpy = vi.spyOn(cp, 'spawnSync');

    // Mock git rev-parse to fail for 'main' and succeed for 'master'
    spawnSyncSpy.mockImplementation((cmd, args) => {
      if (
        cmd === 'git' &&
        Array.isArray(args) &&
        args[0] === 'rev-parse'
      ) {
        if (args[2] === 'main') {
          return {
            status: 1,
            stdout: '',
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
        if (args[2] === 'master') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
      }
      return {
        status: 0,
        stdout: '',
        stderr: '',
        output: [],
        pid: 0,
        signal: null,
      };
    });

    await run({
      story: 'S-0029',
      worktree: true,
    });

    // Find the worktree add call
    const worktreeCall = spawnSyncSpy.mock.calls.find(
      (call) =>
        call[0] === 'git' &&
        Array.isArray(call[1]) &&
        call[1][0] === 'worktree' &&
        call[1][1] === 'add'
    );

    // Should use 'master' as the base branch
    expect(worktreeCall![1][5]).toBe('master');
  });
});
