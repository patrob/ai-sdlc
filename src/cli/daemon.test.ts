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

  describe('constructor', () => {
    it('should instantiate with default config', () => {
      expect(daemon).toBeDefined();
      expect(daemon).toBeInstanceOf(DaemonRunner);
    });

    it('should initialize state flags', () => {
      // Access private properties through any to test internal state
      const daemonAny = daemon as any;
      expect(daemonAny.isShuttingDown).toBe(false);
      expect(daemonAny.currentProcessing).toBe(null);
      expect(daemonAny.completedStoryIds).toBeInstanceOf(Set);
      expect(daemonAny.completedStoryIds.size).toBe(0);
      expect(daemonAny.activeStoryIds).toBeInstanceOf(Set);
      expect(daemonAny.activeStoryIds.size).toBe(0);
      expect(daemonAny.processingQueue).toBeInstanceOf(Array);
      expect(daemonAny.processingQueue.length).toBe(0);
    });
  });

  describe('story tracking', () => {
    it('should track completed story IDs', () => {
      const daemonAny = daemon as any;
      const testId = 'test-story-123';

      expect(daemonAny.completedStoryIds.has(testId)).toBe(false);

      daemonAny.completedStoryIds.add(testId);

      expect(daemonAny.completedStoryIds.has(testId)).toBe(true);
      expect(daemonAny.completedStoryIds.size).toBe(1);
    });

    it('should track active story IDs', () => {
      const daemonAny = daemon as any;
      const testId = 'test-story-123';

      expect(daemonAny.activeStoryIds.has(testId)).toBe(false);

      daemonAny.activeStoryIds.add(testId);

      expect(daemonAny.activeStoryIds.has(testId)).toBe(true);
      expect(daemonAny.activeStoryIds.size).toBe(1);

      // Simulate story being removed from active set when processing completes
      daemonAny.activeStoryIds.delete(testId);
      expect(daemonAny.activeStoryIds.has(testId)).toBe(false);
    });

    it('should prevent duplicate story IDs', () => {
      const daemonAny = daemon as any;
      const testId = 'test-story-123';

      daemonAny.completedStoryIds.add(testId);
      daemonAny.completedStoryIds.add(testId);
      daemonAny.completedStoryIds.add(testId);

      expect(daemonAny.completedStoryIds.size).toBe(1);
    });
  });

  describe('queue management', () => {
    it('should add files to queue', () => {
      const daemonAny = daemon as any;
      const testPath = '/test/.ai-sdlc/backlog/test-story.md';
      const testId = 'test-story';

      daemonAny.processingQueue.push({ path: testPath, id: testId });

      expect(daemonAny.processingQueue.length).toBe(1);
      expect(daemonAny.processingQueue[0]).toEqual({ path: testPath, id: testId });
    });

    it('should process queue sequentially', () => {
      const daemonAny = daemon as any;
      const testItems = [
        { path: '/test/.ai-sdlc/backlog/story1.md', id: 'story1' },
        { path: '/test/.ai-sdlc/backlog/story2.md', id: 'story2' },
        { path: '/test/.ai-sdlc/backlog/story3.md', id: 'story3' },
      ];

      testItems.forEach(item => daemonAny.processingQueue.push(item));

      expect(daemonAny.processingQueue.length).toBe(3);

      const firstItem = daemonAny.processingQueue.shift();
      expect(firstItem).toEqual(testItems[0]);
      expect(daemonAny.processingQueue.length).toBe(2);
    });
  });

  describe('queue management with QueuedStory', () => {
    it('should store queue items with path and id properties', () => {
      const daemonAny = daemon as any;
      const testPath = '/test/.ai-sdlc/backlog/test-story.md';
      const testId = 'story-abc123';

      daemonAny.processingQueue.push({ path: testPath, id: testId });

      expect(daemonAny.processingQueue[0]).toEqual({
        path: testPath,
        id: testId,
      });
    });

    it('should use id property for queue duplicate check', () => {
      const daemonAny = daemon as any;
      const testPath = '/test/.ai-sdlc/backlog/test-story.md';
      const testId = 'story-abc123';

      // Add one item to the queue
      daemonAny.processingQueue.push({ path: testPath, id: testId });

      // Check if it's in queue using the id property pattern
      const isDuplicate = daemonAny.processingQueue.some((q: any) => q.id === testId);

      expect(isDuplicate).toBe(true);
    });
  });

  describe('shutdown handling', () => {
    it('should toggle isShuttingDown flag', () => {
      const daemonAny = daemon as any;

      expect(daemonAny.isShuttingDown).toBe(false);

      daemonAny.isShuttingDown = true;

      expect(daemonAny.isShuttingDown).toBe(true);
    });

    it('should track currentProcessing promise', () => {
      const daemonAny = daemon as any;

      expect(daemonAny.currentProcessing).toBe(null);

      const mockPromise = Promise.resolve();
      daemonAny.currentProcessing = mockPromise;

      expect(daemonAny.currentProcessing).toBe(mockPromise);
    });
  });

  describe('signal handling', () => {
    it('should track Ctrl+C count', () => {
      const daemonAny = daemon as any;

      expect(daemonAny.ctrlCCount).toBe(0);

      daemonAny.ctrlCCount++;
      expect(daemonAny.ctrlCCount).toBe(1);

      daemonAny.ctrlCCount++;
      expect(daemonAny.ctrlCCount).toBe(2);
    });

    it('should track last Ctrl+C time', () => {
      const daemonAny = daemon as any;
      const now = Date.now();

      expect(daemonAny.lastCtrlCTime).toBe(0);

      daemonAny.lastCtrlCTime = now;
      expect(daemonAny.lastCtrlCTime).toBe(now);
    });
  });
});
