import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DaemonRunner } from './daemon.js';

// Mock dependencies
vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn(),
    })),
  },
}));

vi.mock('../core/config.js', () => ({
  getSdlcRoot: vi.fn(() => '/test/.ai-sdlc'),
  loadConfig: vi.fn(() => ({
    daemon: {
      enabled: true,
      pollingInterval: 5000,
      watchPatterns: ['/test/.ai-sdlc/backlog/*.md'],
      processDelay: 500,
      shutdownTimeout: 30000,
      enableEscShutdown: false,
      escTimeout: 500,
    },
    theme: 'none',
  })),
}));

vi.mock('../core/kanban.js', () => ({
  assessState: vi.fn(() => ({
    backlogItems: [],
    readyItems: [],
    inProgressItems: [],
    doneItems: [],
    recommendedActions: [],
  })),
}));

vi.mock('../core/theme.js', () => ({
  getThemedChalk: vi.fn(() => ({
    bold: (str: string) => str,
    dim: (str: string) => str,
    info: (str: string) => str,
    success: (str: string) => str,
    warning: (str: string) => str,
    error: (str: string) => str,
  })),
}));

vi.mock('../core/story.js', () => ({
  parseStory: vi.fn(),
  getStory: vi.fn(),
}));

vi.mock('../agents/review.js', () => ({
  runReviewAgent: vi.fn().mockResolvedValue({ success: true, changesMade: [] }),
  createPullRequest: vi.fn().mockResolvedValue({ success: true, changesMade: [] }),
}));

vi.mock('../agents/merge.js', () => ({
  runMergeAgent: vi.fn().mockResolvedValue({ success: true, changesMade: [] }),
}));

vi.mock('./runner.js', () => ({
  WorkflowRunner: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('DaemonRunner', () => {
  let daemon: DaemonRunner;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    daemon = new DaemonRunner();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    vi.clearAllMocks();
  });
  describe('PR and merge actions', () => {
    beforeEach(async () => {
      const { getStory } = await import('../core/story.js');
      vi.mocked(getStory).mockReturnValue({
        path: '/test/.ai-sdlc/stories/S-001/story.md',
        frontmatter: {
          id: 'S-001',
          title: 'Ready for PR',
        },
      } as any);
    });

    it('should create a pull request when daemon receives create_pr action', async () => {
      const { createPullRequest } = await import('../agents/review.js');
      const daemonAny = daemon as any;

      await daemonAny.executeAction({
        type: 'create_pr',
        storyId: 'S-001',
        storyPath: '/stale/path/story.md',
        reason: 'ready for PR',
        priority: 1,
      });

      expect(createPullRequest).toHaveBeenCalledWith(
        '/test/.ai-sdlc/stories/S-001/story.md',
        '/test/.ai-sdlc'
      );
    });

    it('should run merge agent when daemon receives merge action', async () => {
      const { runMergeAgent } = await import('../agents/merge.js');
      const daemonAny = daemon as any;

      await daemonAny.executeAction({
        type: 'merge',
        storyId: 'S-001',
        storyPath: '/stale/path/story.md',
        reason: 'ready to merge',
        priority: 1,
      });

      expect(runMergeAgent).toHaveBeenCalledWith(
        '/test/.ai-sdlc/stories/S-001/story.md',
        '/test/.ai-sdlc'
      );
    });
  });
});
