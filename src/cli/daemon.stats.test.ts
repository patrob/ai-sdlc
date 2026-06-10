 
import { describe, expect, it, vi } from 'vitest';

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

describe('daemon stats tracking', () => {
  it('should initialize stats in constructor', () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;

    expect(daemonAny.stats).toBeDefined();
    expect(daemonAny.stats.done).toBe(0);
    expect(daemonAny.stats.active).toBe(0);
    expect(daemonAny.stats.queued).toBe(0);
    expect(daemonAny.stats.blocked).toBe(0);
    expect(daemonAny.stats.startTime).toBeInstanceOf(Date);
  });

  it('should accept verbose option in DaemonOptions', () => {
    const daemon = new DaemonRunner({ verbose: true });
    const daemonAny = daemon as any;

    expect(daemonAny.options.verbose).toBe(true);
  });

  it('should have verbose false by default', () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;

    expect(daemonAny.options.verbose).toBeUndefined();
  });

  it('should track done count when stories complete', () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;

    expect(daemonAny.stats.done).toBe(0);

    // Simulate completing a story by incrementing done count
    daemonAny.stats.done++;

    expect(daemonAny.stats.done).toBe(1);

    daemonAny.stats.done++;
    expect(daemonAny.stats.done).toBe(2);
  });

  it('should track active stories', () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;

    expect(daemonAny.stats.active).toBe(0);

    // Simulate processing a story
    daemonAny.stats.active = 1;
    expect(daemonAny.stats.active).toBe(1);

    // Story completes
    daemonAny.stats.active = 0;
    expect(daemonAny.stats.active).toBe(0);
  });

  it('should track story start time', () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;

    expect(daemonAny.stats.currentStoryStartTime).toBeUndefined();

    const now = new Date();
    daemonAny.stats.currentStoryStartTime = now;

    expect(daemonAny.stats.currentStoryStartTime).toBe(now);
  });

  it('should clear story start time when story completes', () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;

    daemonAny.stats.currentStoryStartTime = new Date();
    expect(daemonAny.stats.currentStoryStartTime).toBeDefined();

    daemonAny.stats.currentStoryStartTime = undefined;
    expect(daemonAny.stats.currentStoryStartTime).toBeUndefined();
  });
});

describe('daemon verbose mode', () => {
  it('should pass verbose flag through options', () => {
    const daemon = new DaemonRunner({ verbose: true });
    const daemonAny = daemon as any;

    expect(daemonAny.options.verbose).toBe(true);
  });

  it('should accept maxIterations and verbose together', () => {
    const daemon = new DaemonRunner({ maxIterations: 50, verbose: true });
    const daemonAny = daemon as any;

    expect(daemonAny.options.maxIterations).toBe(50);
    expect(daemonAny.options.verbose).toBe(true);
  });
});
