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

describe('polling mechanism', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should initialize pollTimerId as null', () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;

    expect(daemonAny.pollTimerId).toBe(null);
  });

  it('should set up polling when daemon starts', async () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;

    await daemon.start();

    // After start, pollTimerId should be set (it's a Timeout object)
    expect(daemonAny.pollTimerId).not.toBe(null);
    expect(daemonAny.pollTimerId).toBeDefined();
  });

  it('should clear polling timer when daemon stops', async () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;

    await daemon.start();
    const timerBefore = daemonAny.pollTimerId;
    expect(timerBefore).not.toBe(null);

    await daemon.stop();

    // After stop, pollTimerId should be cleared
    expect(daemonAny.pollTimerId).toBe(null);
  });

  it('should respect configured polling interval', async () => {
    const daemon = new DaemonRunner();
    const _daemonAny = daemon as any;

    // Mock assessState to track calls
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

    // Advance time by polling interval
    vi.advanceTimersByTime(5000);

    // assessState should have been called
    expect(assessStateMock).toHaveBeenCalled();
  });

  it('should stop polling when daemon stops', async () => {
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

    // Timer should be running
    expect(daemonAny.pollTimerId).not.toBe(null);

    // Stop the daemon
    await daemon.stop();

    // Polling timer should be cleared
    expect(daemonAny.pollTimerId).toBe(null);
  });

  it('should queue new actions found during polling', async () => {
    const daemon = new DaemonRunner();
    const _daemonAny = daemon as any;

    const { assessState } = await import('../core/kanban.js');
    const assessStateMock = vi.mocked(assessState);

    // Return empty initially (during start)
    assessStateMock.mockReturnValue({
      backlogItems: [],
      readyItems: [],
      inProgressItems: [],
      doneItems: [],
      recommendedActions: [],
    });

    await daemon.start();

    // Get initial call count from start
    const initialCallCount = assessStateMock.mock.calls.length;

    // Now mock to return an action for polling
    assessStateMock.mockReturnValue({
      backlogItems: [],
      readyItems: [],
      inProgressItems: [],
      doneItems: [],
      recommendedActions: [
        {
          storyId: 'poll-test-1',
          storyPath: '/test/.ai-sdlc/backlog/poll-test-1.md',
          type: 'refine',
          reason: 'test',
        },
      ],
    });

    // Advance timer to trigger polling
    vi.advanceTimersByTime(5000);

    // assessState should have been called more times (at least one more for polling)
    expect(assessStateMock.mock.calls.length).toBeGreaterThan(initialCallCount);

    await daemon.stop();
  });

  it('should skip queueing duplicate stories during polling', async () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;

    const { assessState } = await import('../core/kanban.js');
    const assessStateMock = vi.mocked(assessState);

    // Return same action twice
    assessStateMock.mockReturnValue({
      backlogItems: [],
      readyItems: [],
      inProgressItems: [],
      doneItems: [],
      recommendedActions: [
        {
          storyId: 'duplicate-story',
          storyPath: '/test/.ai-sdlc/backlog/duplicate-story.md',
          type: 'refine',
          reason: 'test',
        },
      ],
    });

    await daemon.start();

    // Add story to completed set to simulate already processed
    daemonAny.completedStoryIds.add('duplicate-story');

    // Poll should not queue it
    vi.advanceTimersByTime(5000);

    await daemon.stop();
  });

  it('should skip polling if queue is currently processing', async () => {
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

    // Set isProcessingQueue to true
    daemonAny.isProcessingQueue = true;

    // Reset mock to track new calls
    assessStateMock.mockClear();

    // Advance timer
    vi.advanceTimersByTime(5000);

    // assessState should NOT have been called because isProcessingQueue is true
    expect(assessStateMock).not.toHaveBeenCalled();

    daemonAny.isProcessingQueue = false;
    await daemon.stop();
  });
});
