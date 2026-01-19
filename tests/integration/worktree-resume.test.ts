import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../../src/cli/commands.js';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as readline from 'readline';
import * as story from '../../src/core/story.js';
import * as kanban from '../../src/core/kanban.js';
import ora from 'ora';

// Mock dependencies
vi.mock('child_process');
vi.mock('fs');
vi.mock('ora');
vi.mock('readline');
vi.mock('../../src/core/config.js');
vi.mock('../../src/core/client.js', () => ({
  runAgentQuery: vi.fn().mockResolvedValue({
    success: true,
    output: 'Mock agent output',
  }),
}));

describe('Worktree Resume Integration', () => {
  let mockSpinner: any;
  let mockReadline: any;
  let mockConfig: any;

  const createMockStory = (overrides: any = {}) => ({
    frontmatter: {
      id: 'S-0063',
      title: 'Test Resume Story',
      slug: 'test-resume-story',
      status: 'ready' as const,
      priority: 1,
      labels: [],
      type: 'feature' as const,
      created: '2024-01-01',
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
      worktree_path: undefined,
      ...overrides,
    },
    path: '/test/.ai-sdlc/stories/S-0063/story.md',
    slug: 'test-resume-story',
    content: '# Test Resume Story\n\nTest content',
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import and mock config
    mockConfig = await import('../../src/core/config.js');
    vi.mocked(mockConfig.getSdlcRoot).mockReturnValue('/test/.ai-sdlc');
    vi.mocked(mockConfig.loadConfig).mockReturnValue({
      theme: 'none',
      worktree: {
        enabled: true,
        basePath: '.ai-sdlc/worktrees',  // Relative path from working dir (/test)
      },
    } as any);

    // Mock ora spinner
    mockSpinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      info: vi.fn().mockReturnThis(),
      text: '',
    };
    vi.mocked(ora).mockReturnValue(mockSpinner);

    // Mock readline interface
    mockReadline = {
      question: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockReadline as any);

    // Mock process.cwd and chdir
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
    vi.spyOn(process, 'chdir').mockImplementation(() => {});

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Default fs mocks - will be customized per test
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const pathStr = String(p);
      // Allow .ai-sdlc directory and subdirectories (stories, worktrees parent)
      if (pathStr.includes('.ai-sdlc') && !pathStr.includes('worktrees/S-0063')) {
        return true;
      }
      return false;
    });
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => '');
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'readFileSync').mockReturnValue('---\nid: S-0063\n---\n# Test');
    vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);

    // Default git operations mock - clean working directory
    vi.spyOn(cp, 'spawnSync').mockImplementation((cmd: any, args: any) => {
      // Handle git rev-parse --verify main (for detectBaseBranch)
      if (args && args.includes('rev-parse') && args.includes('main')) {
        return { status: 0, stdout: 'abc123\n', stderr: '', output: [], pid: 0, signal: null };
      }
      return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
    });

    // Mock story operations
    vi.spyOn(story, 'parseStory').mockReturnValue(createMockStory());
    vi.spyOn(story, 'writeStory').mockResolvedValue(undefined);
    vi.spyOn(story, 'updateStoryField').mockReturnValue(createMockStory());
    vi.spyOn(story, 'findStoryById').mockReturnValue(createMockStory());

    // Mock kanban operations
    vi.spyOn(kanban, 'kanbanExists').mockReturnValue(true);
    vi.spyOn(kanban, 'assessState').mockResolvedValue({
      backlogItems: [],
      readyItems: [],
      inProgressItems: [],
      doneItems: [],
      recommendedActions: [
        {
          type: 'research' as const,
          storyId: 'S-0063',
          storyPath: '/test/.ai-sdlc/stories/S-0063/story.md',
          description: 'Research the story',
          priority: 1,
        },
      ],
    });
    vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(createMockStory());
  });

  describe('Resume after interrupted phases', () => {
    it('should resume after interrupted research phase', async () => {
      const storyWithWorktree = createMockStory({
        worktree_path: '/test/project/.ai-sdlc/worktrees/S-0063-test-resume-story',
        research_complete: false,
      });

      vi.spyOn(story, 'parseStory').mockReturnValue(storyWithWorktree);
      vi.spyOn(story, 'findStoryById').mockReturnValue(storyWithWorktree);
      vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(storyWithWorktree);

      // Mock worktree exists
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('.ai-sdlc') && !pathStr.includes('worktrees/S-0063')) {
          return true;
        }
        if (pathStr.includes('worktrees/S-0063-test-resume-story')) {
          return true; // Worktree exists
        }
        return false;
      });

      // Mock git commands - branch exists, clean status
      vi.mocked(cp.spawnSync).mockImplementation((cmd: any, args: any) => {
        if (args && args.includes('rev-parse') && args.includes('--verify')) {
          return { status: 0, stdout: 'abc123', stderr: '', output: [], pid: 0, signal: null };
        }
        if (args && args.includes('status') && args.includes('--porcelain')) {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        }
        if (args && args.includes('rev-list') && args.includes('--left-right')) {
          return { status: 0, stdout: '0\t0', stderr: '', output: [], pid: 0, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      await run({ story: 'test-resume-story', worktree: true });

      // Verify resumption messages
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Resuming in existing worktree')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Next phase: research')
      );

      // Verify process.chdir was called with worktree path
      expect(process.chdir).toHaveBeenCalledWith('/test/project/.ai-sdlc/worktrees/S-0063-test-resume-story');
    });

    it('should resume after completed research phase', async () => {
      const storyWithResearchComplete = createMockStory({
        worktree_path: '/test/project/.ai-sdlc/worktrees/S-0063-test-resume-story',
        research_complete: true,
        plan_complete: false,
        status: 'in-progress' as const,
      });

      vi.spyOn(story, 'parseStory').mockReturnValue(storyWithResearchComplete);
      vi.spyOn(story, 'findStoryById').mockReturnValue(storyWithResearchComplete);
      vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(storyWithResearchComplete);

      // Mock worktree exists
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('.ai-sdlc')) return true;
        if (pathStr.includes('worktrees/S-0063-test-resume-story')) return true;
        return false;
      });

      // Mock git commands
      vi.mocked(cp.spawnSync).mockImplementation((cmd: any, args: any) => {
        if (args && args.includes('rev-parse')) return { status: 0, stdout: 'abc123', stderr: '', output: [], pid: 0, signal: null };
        if (args && args.includes('status')) return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        if (args && args.includes('rev-list')) return { status: 0, stdout: '0\t0', stderr: '', output: [], pid: 0, signal: null };
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      await run({ story: 'test-resume-story', worktree: true });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Last completed phase: research')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Next phase: plan')
      );
    });

    it('should resume after completed implementation phase', async () => {
      const storyWithImplementationComplete = createMockStory({
        worktree_path: '/test/project/.ai-sdlc/worktrees/S-0063-test-resume-story',
        research_complete: true,
        plan_complete: true,
        implementation_complete: true,
        reviews_complete: false,
        status: 'in-progress' as const,
      });

      vi.spyOn(story, 'parseStory').mockReturnValue(storyWithImplementationComplete);
      vi.spyOn(story, 'findStoryById').mockReturnValue(storyWithImplementationComplete);
      vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(storyWithImplementationComplete);

      // Mock worktree exists
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('.ai-sdlc')) return true;
        if (pathStr.includes('worktrees/S-0063-test-resume-story')) return true;
        return false;
      });

      // Mock git commands
      vi.mocked(cp.spawnSync).mockImplementation((cmd: any, args: any) => {
        if (args && args.includes('rev-parse')) return { status: 0, stdout: 'abc123', stderr: '', output: [], pid: 0, signal: null };
        if (args && args.includes('status')) return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        if (args && args.includes('rev-list')) return { status: 0, stdout: '0\t0', stderr: '', output: [], pid: 0, signal: null };
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      await run({ story: 'test-resume-story', worktree: true });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Last completed phase: implementation')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Next phase: review')
      );
    });
  });

  describe('Uncommitted changes preservation', () => {
    it('should display uncommitted changes and preserve them', async () => {
      const storyWithWorktree = createMockStory({
        worktree_path: '/test/project/.ai-sdlc/worktrees/S-0063-test-resume-story',
        research_complete: true,
      });

      vi.spyOn(story, 'parseStory').mockReturnValue(storyWithWorktree);
      vi.spyOn(story, 'findStoryById').mockReturnValue(storyWithWorktree);
      vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(storyWithWorktree);

      // Mock worktree exists
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('.ai-sdlc')) return true;
        if (pathStr.includes('worktrees/S-0063-test-resume-story')) return true;
        return false;
      });

      // Mock git commands with uncommitted changes
      vi.mocked(cp.spawnSync).mockImplementation((cmd: any, args: any) => {
        if (args && args.includes('rev-parse')) {
          return { status: 0, stdout: 'abc123', stderr: '', output: [], pid: 0, signal: null };
        }
        if (args && args.includes('status') && args.includes('--porcelain')) {
          // Mock uncommitted changes
          return {
            status: 0,
            stdout: ' M src/core/worktree.ts\n?? tests/new-test.ts\n M src/cli/commands.ts',
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
        if (args && args.includes('rev-list')) {
          return { status: 0, stdout: '0\t0', stderr: '', output: [], pid: 0, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      await run({ story: 'test-resume-story', worktree: true });

      // Verify uncommitted changes are displayed
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Uncommitted changes: 3 file(s)')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Modified:')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Untracked:')
      );

      // Verify no destructive git commands were called (git reset, git clean)
      const spawnCalls = vi.mocked(cp.spawnSync).mock.calls;
      const gitResetCalls = spawnCalls.filter(
        (call) => call[1] && Array.isArray(call[1]) && call[1].includes('reset')
      );
      const gitCleanCalls = spawnCalls.filter(
        (call) => call[1] && Array.isArray(call[1]) && call[1].includes('clean')
      );

      expect(gitResetCalls).toHaveLength(0);
      expect(gitCleanCalls).toHaveLength(0);
    });
  });

  describe('Missing branch recreation', () => {
    it('should automatically recreate worktree when directory exists but branch is deleted', async () => {
      const storyWithWorktree = createMockStory({
        worktree_path: '/test/project/.ai-sdlc/worktrees/S-0063-test-resume-story',
      });

      vi.spyOn(story, 'parseStory').mockReturnValue(storyWithWorktree);
      vi.spyOn(story, 'findStoryById').mockReturnValue(storyWithWorktree);
      vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(storyWithWorktree);

      // Mock worktree directory exists
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('.ai-sdlc')) return true;
        if (pathStr.includes('worktrees/S-0063-test-resume-story')) return true;
        return false;
      });

      // Mock git commands - branch does NOT exist
      vi.mocked(cp.spawnSync).mockImplementation((cmd: any, args: any) => {
        if (args && args.includes('rev-parse') && args.includes('--verify')) {
          // Branch doesn't exist
          return { status: 1, stdout: '', stderr: 'fatal: branch not found', output: [], pid: 0, signal: null };
        }
        if (args && args.includes('worktree') && args.includes('add')) {
          // Worktree add succeeds
          return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      await run({ story: 'test-resume-story', worktree: true });

      // Verify recreation message
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('automatically recreating worktree')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Worktree recreated')
      );

      // Verify git worktree add was called
      const spawnCalls = vi.mocked(cp.spawnSync).mock.calls;
      const worktreeAddCalls = spawnCalls.filter(
        (call) => call[1] && Array.isArray(call[1]) && call[1].includes('worktree') && call[1].includes('add')
      );
      expect(worktreeAddCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Missing directory handling', () => {
    it('should automatically recreate when directory deleted but branch exists', async () => {
      const storyWithWorktree = createMockStory({
        worktree_path: '/test/project/.ai-sdlc/worktrees/S-0063-test-resume-story',
      });

      vi.spyOn(story, 'parseStory').mockReturnValue(storyWithWorktree);
      vi.spyOn(story, 'findStoryById').mockReturnValue(storyWithWorktree);
      vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(storyWithWorktree);

      // Mock worktree directory does NOT exist
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('.ai-sdlc') && !pathStr.includes('worktrees/S-0063')) {
          return true;
        }
        if (pathStr.includes('worktrees/S-0063-test-resume-story')) {
          return false; // Directory missing
        }
        return false;
      });

      // Mock git commands - branch EXISTS
      vi.mocked(cp.spawnSync).mockImplementation((cmd: any, args: any) => {
        if (args && args.includes('rev-parse') && args.includes('--verify')) {
          // Branch exists
          return { status: 0, stdout: 'abc123', stderr: '', output: [], pid: 0, signal: null };
        }
        if (args && args.includes('worktree') && args.includes('add')) {
          // Worktree add succeeds
          return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      await run({ story: 'test-resume-story', worktree: true });

      // Verify recreation occurred
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('automatically recreating worktree')
      );

      // Verify git worktree add was called
      const spawnCalls = vi.mocked(cp.spawnSync).mock.calls;
      const worktreeAddCalls = spawnCalls.filter(
        (call) => call[1] && Array.isArray(call[1]) && call[1].includes('worktree') && call[1].includes('add')
      );
      expect(worktreeAddCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Stale frontmatter sync', () => {
    it('should auto-sync worktree_path when missing from frontmatter but worktree exists', async () => {
      // Story has NO worktree_path in frontmatter
      const storyWithoutPath = createMockStory({
        worktree_path: undefined,
      });

      vi.spyOn(story, 'parseStory').mockReturnValue(storyWithoutPath);
      vi.spyOn(story, 'findStoryById').mockReturnValue(storyWithoutPath);
      vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(storyWithoutPath);

      // Mock that git worktree list finds an existing worktree
      vi.mocked(cp.spawnSync).mockImplementation((cmd: any, args: any) => {
        if (args && args.includes('worktree') && args.includes('list') && args.includes('--porcelain')) {
          return {
            status: 0,
            stdout: `worktree /test/project/.ai-sdlc/worktrees/S-0063-test-resume-story
branch refs/heads/ai-sdlc/S-0063-test-resume-story

`,
            stderr: '',
            output: [],
            pid: 0,
            signal: null,
          };
        }
        if (args && args.includes('rev-parse')) {
          return { status: 0, stdout: 'abc123', stderr: '', output: [], pid: 0, signal: null };
        }
        if (args && args.includes('status')) {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        }
        if (args && args.includes('rev-list')) {
          return { status: 0, stdout: '0\t0', stderr: '', output: [], pid: 0, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      // Mock existsSync to confirm worktree directory exists
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('.ai-sdlc')) return true;
        if (pathStr.includes('worktrees/S-0063-test-resume-story')) return true;
        return false;
      });

      await run({ story: 'test-resume-story', worktree: true });

      // Verify updateStoryField was called with worktree_path
      expect(story.updateStoryField).toHaveBeenCalledWith(
        expect.anything(),
        'worktree_path',
        expect.stringContaining('worktrees/S-0063-test-resume-story')
      );

      // Verify writeStory was called to persist the update
      expect(story.writeStory).toHaveBeenCalled();
    });
  });

  describe('Diverged branch warning', () => {
    it('should warn when branch has diverged significantly', async () => {
      const storyWithWorktree = createMockStory({
        worktree_path: '/test/project/.ai-sdlc/worktrees/S-0063-test-resume-story',
      });

      vi.spyOn(story, 'parseStory').mockReturnValue(storyWithWorktree);
      vi.spyOn(story, 'findStoryById').mockReturnValue(storyWithWorktree);
      vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(storyWithWorktree);

      // Mock worktree exists
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('.ai-sdlc')) return true;
        if (pathStr.includes('worktrees/S-0063-test-resume-story')) return true;
        return false;
      });

      // Mock git commands with significant divergence
      vi.mocked(cp.spawnSync).mockImplementation((cmd: any, args: any) => {
        if (args && args.includes('rev-parse')) {
          return { status: 0, stdout: 'abc123', stderr: '', output: [], pid: 0, signal: null };
        }
        if (args && args.includes('status')) {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        }
        if (args && args.includes('rev-list') && args.includes('--left-right')) {
          // 15 commits ahead, 12 commits behind
          return { status: 0, stdout: '12\t15', stderr: '', output: [], pid: 0, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      await run({ story: 'test-resume-story', worktree: true });

      // Verify divergence warning
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Branch has diverged from base: 15 ahead, 12 behind')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Consider rebasing')
      );
    });

    it('should NOT warn when divergence is below threshold', async () => {
      const storyWithWorktree = createMockStory({
        worktree_path: '/test/project/.ai-sdlc/worktrees/S-0063-test-resume-story',
      });

      vi.spyOn(story, 'parseStory').mockReturnValue(storyWithWorktree);
      vi.spyOn(story, 'findStoryById').mockReturnValue(storyWithWorktree);
      vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(storyWithWorktree);

      // Mock worktree exists
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('.ai-sdlc')) return true;
        if (pathStr.includes('worktrees/S-0063-test-resume-story')) return true;
        return false;
      });

      // Mock git commands with minor divergence
      vi.mocked(cp.spawnSync).mockImplementation((cmd: any, args: any) => {
        if (args && args.includes('rev-parse')) {
          return { status: 0, stdout: 'abc123', stderr: '', output: [], pid: 0, signal: null };
        }
        if (args && args.includes('status')) {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        }
        if (args && args.includes('rev-list') && args.includes('--left-right')) {
          // 5 commits ahead, 3 commits behind (below threshold of 10)
          return { status: 0, stdout: '3\t5', stderr: '', output: [], pid: 0, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      await run({ story: 'test-resume-story', worktree: true });

      // Verify NO divergence warning
      const logCalls = vi.mocked(console.log).mock.calls.map(call => call[0]);
      const hasDivergenceWarning = logCalls.some(
        call => typeof call === 'string' && call.includes('Branch has diverged')
      );
      expect(hasDivergenceWarning).toBe(false);
    });
  });

  describe('Done story warning', () => {
    it('should warn and prompt when story is done but has worktree', async () => {
      const doneStoryWithWorktree = createMockStory({
        status: 'done' as const,
        worktree_path: '/test/project/.ai-sdlc/worktrees/S-0063-test-resume-story',
      });

      vi.spyOn(story, 'parseStory').mockReturnValue(doneStoryWithWorktree);
      vi.spyOn(story, 'findStoryById').mockReturnValue(doneStoryWithWorktree);
      vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(doneStoryWithWorktree);

      // Mock worktree exists
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('.ai-sdlc')) return true;
        if (pathStr.includes('worktrees/S-0063-test-resume-story')) return true;
        return false;
      });

      // Mock user declining to proceed
      mockReadline.question.mockImplementation((question: string, callback: (answer: string) => void) => {
        callback('n');
      });

      await run({ story: 'test-resume-story', worktree: true });

      // Verify warning was displayed
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Story is marked as done but has an existing worktree')
      );

      // Verify user was prompted
      expect(mockReadline.question).toHaveBeenCalledWith(
        expect.stringContaining('Continue with this worktree?'),
        expect.any(Function)
      );

      // Verify aborted message
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Aborted')
      );
    });

    it('should proceed when user confirms to continue with done story worktree', async () => {
      const doneStoryWithWorktree = createMockStory({
        status: 'done' as const,
        worktree_path: '/test/project/.ai-sdlc/worktrees/S-0063-test-resume-story',
      });

      vi.spyOn(story, 'parseStory').mockReturnValue(doneStoryWithWorktree);
      vi.spyOn(story, 'findStoryById').mockReturnValue(doneStoryWithWorktree);
      vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(doneStoryWithWorktree);

      // Mock worktree exists
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('.ai-sdlc')) return true;
        if (pathStr.includes('worktrees/S-0063-test-resume-story')) return true;
        return false;
      });

      // Mock git commands
      vi.mocked(cp.spawnSync).mockImplementation((cmd: any, args: any) => {
        if (args && args.includes('rev-parse')) {
          return { status: 0, stdout: 'abc123', stderr: '', output: [], pid: 0, signal: null };
        }
        if (args && args.includes('status')) {
          return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
        }
        if (args && args.includes('rev-list')) {
          return { status: 0, stdout: '0\t0', stderr: '', output: [], pid: 0, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      // Mock user confirming to proceed
      mockReadline.question.mockImplementation((question: string, callback: (answer: string) => void) => {
        callback('y');
      });

      await run({ story: 'test-resume-story', worktree: true });

      // Verify warning was displayed
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Story is marked as done')
      );

      // Verify proceeded with resume
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Resuming in existing worktree')
      );
    });
  });

  describe('Validation failure scenarios', () => {
    it('should display clear error when both directory and branch are missing', async () => {
      const storyWithWorktree = createMockStory({
        worktree_path: '/test/project/.ai-sdlc/worktrees/S-0063-test-resume-story',
      });

      vi.spyOn(story, 'parseStory').mockReturnValue(storyWithWorktree);
      vi.spyOn(story, 'findStoryById').mockReturnValue(storyWithWorktree);
      vi.spyOn(kanban, 'findStoryBySlug').mockReturnValue(storyWithWorktree);

      // Mock worktree directory does NOT exist
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('.ai-sdlc') && !pathStr.includes('worktrees/S-0063')) {
          return true;
        }
        if (pathStr.includes('worktrees/S-0063-test-resume-story')) {
          return false; // Directory missing
        }
        return false;
      });

      // Mock git commands - branch does NOT exist
      vi.mocked(cp.spawnSync).mockImplementation((cmd: any, args: any) => {
        if (args && args.includes('rev-parse') && args.includes('--verify')) {
          // Branch doesn't exist
          return { status: 1, stdout: '', stderr: 'fatal: branch not found', output: [], pid: 0, signal: null };
        }
        return { status: 0, stdout: '', stderr: '', output: [], pid: 0, signal: null };
      });

      await run({ story: 'test-resume-story', worktree: true });

      // Verify error message
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Cannot resume worktree')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Worktree directory does not exist')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Branch does not exist')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('manual intervention')
      );
    });
  });
});
