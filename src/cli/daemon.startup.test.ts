import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('initial assessment on startup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should set ignoreInitial to true in watcher options', async () => {
    const daemon = new DaemonRunner();
    const mockChokidar = await import('chokidar');
    const watchSpy = vi.spyOn(mockChokidar.default, 'watch');

    await daemon.start();
    await vi.advanceTimersByTimeAsync(100);

    expect(watchSpy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        ignoreInitial: true,
      })
    );

    await daemon.stop();
  });

  it('should call assessState on startup', async () => {
    const daemon = new DaemonRunner();
    const { assessState } = await import('../core/kanban.js');
    const assessStateMock = vi.mocked(assessState);
    assessStateMock.mockReturnValue({
      backlogItems: [],
      readyItems: [],
      inProgressItems: [],
      doneItems: [],
      recommendedActions: [],
    });

    await daemon.start();
    await vi.advanceTimersByTimeAsync(100);

    expect(assessStateMock).toHaveBeenCalled();
    await daemon.stop();
  });

  it('should queue only single highest priority story on startup', async () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;
    const { assessState } = await import('../core/kanban.js');
    const assessStateMock = vi.mocked(assessState);

    // Mock assessState to return multiple stories with different priorities
    assessStateMock.mockReturnValue({
      backlogItems: [],
      readyItems: [],
      inProgressItems: [],
      doneItems: [],
      recommendedActions: [
        {
          storyId: 'story-1',
          storyPath: '/test/.ai-sdlc/backlog/story-1.md',
          type: 'refine',
          reason: 'Highest priority',
          context: undefined,
        },
        {
          storyId: 'story-2',
          storyPath: '/test/.ai-sdlc/backlog/story-2.md',
          type: 'research',
          reason: 'Lower priority',
          context: undefined,
        },
        {
          storyId: 'story-3',
          storyPath: '/test/.ai-sdlc/backlog/story-3.md',
          type: 'plan',
          reason: 'Lowest priority',
          context: undefined,
        },
      ],
    });

    // Mock processQueue to prevent actual processing
    vi.spyOn(daemonAny, 'processQueue').mockImplementation(() => {});

    await daemon.start();
    await vi.advanceTimersByTimeAsync(100);

    // Should have exactly one story in queue (the top one)
    expect(daemonAny.processingQueue.length).toBe(1);
    expect(daemonAny.processingQueue[0].id).toBe('story-1');
    expect(daemonAny.processingQueue[0].path).toBe('/test/.ai-sdlc/backlog/story-1.md');

    await daemon.stop();
  });

  it('should log startup message with story count and reason', async () => {
    const daemon = new DaemonRunner();
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { assessState } = await import('../core/kanban.js');
    const assessStateMock = vi.mocked(assessState);

    assessStateMock.mockReturnValue({
      backlogItems: [],
      readyItems: [],
      inProgressItems: [],
      doneItems: [],
      recommendedActions: [
        {
          storyId: 'story-1',
          storyPath: '/test/.ai-sdlc/backlog/story-1.md',
          type: 'refine',
          reason: 'In-progress folder priority',
          context: undefined,
        },
      ],
    });

    await daemon.start();
    await vi.advanceTimersByTimeAsync(100);

    const logCalls = consoleLogSpy.mock.calls.map(call => call[0]);
    const hasFoundMessage = logCalls.some(msg =>
      typeof msg === 'string' && msg.includes('Found 1 stories, starting with: story-1')
    );
    const hasReasonMessage = logCalls.some(msg =>
      typeof msg === 'string' && msg.includes('In-progress folder priority')
    );

    expect(hasFoundMessage).toBe(true);
    expect(hasReasonMessage).toBe(true);

    consoleLogSpy.mockRestore();
    await daemon.stop();
  });

  it('should not queue anything if no stories available on startup', async () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;
    const { assessState } = await import('../core/kanban.js');
    const assessStateMock = vi.mocked(assessState);

    assessStateMock.mockReturnValue({
      backlogItems: [],
      readyItems: [],
      inProgressItems: [],
      doneItems: [],
      recommendedActions: [],
    });

    await daemon.start();
    await vi.advanceTimersByTimeAsync(100);

    // Should have empty queue
    expect(daemonAny.processingQueue.length).toBe(0);

    await daemon.stop();
  });
});
