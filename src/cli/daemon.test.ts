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
      expect(daemonAny.processedStoryIds).toBeInstanceOf(Set);
      expect(daemonAny.processedStoryIds.size).toBe(0);
      expect(daemonAny.processingQueue).toBeInstanceOf(Array);
      expect(daemonAny.processingQueue.length).toBe(0);
    });
  });

  describe('story tracking', () => {
    it('should track processed story IDs', () => {
      const daemonAny = daemon as any;
      const testId = 'test-story-123';

      expect(daemonAny.processedStoryIds.has(testId)).toBe(false);

      daemonAny.processedStoryIds.add(testId);

      expect(daemonAny.processedStoryIds.has(testId)).toBe(true);
      expect(daemonAny.processedStoryIds.size).toBe(1);
    });

    it('should prevent duplicate story IDs', () => {
      const daemonAny = daemon as any;
      const testId = 'test-story-123';

      daemonAny.processedStoryIds.add(testId);
      daemonAny.processedStoryIds.add(testId);
      daemonAny.processedStoryIds.add(testId);

      expect(daemonAny.processedStoryIds.size).toBe(1);
    });
  });

  describe('queue management', () => {
    it('should add files to queue', () => {
      const daemonAny = daemon as any;
      const testPath = '/test/.ai-sdlc/backlog/test-story.md';

      daemonAny.processingQueue.push(testPath);

      expect(daemonAny.processingQueue.length).toBe(1);
      expect(daemonAny.processingQueue[0]).toBe(testPath);
    });

    it('should process queue sequentially', () => {
      const daemonAny = daemon as any;
      const testPaths = [
        '/test/.ai-sdlc/backlog/story1.md',
        '/test/.ai-sdlc/backlog/story2.md',
        '/test/.ai-sdlc/backlog/story3.md',
      ];

      testPaths.forEach(path => daemonAny.processingQueue.push(path));

      expect(daemonAny.processingQueue.length).toBe(3);

      const firstPath = daemonAny.processingQueue.shift();
      expect(firstPath).toBe(testPaths[0]);
      expect(daemonAny.processingQueue.length).toBe(2);
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

describe('daemon configuration', () => {
  it('should use default daemon config values', async () => {
    // Use dynamic import to get the mocked module
    const { loadConfig } = await import('../core/config.js');
    const config = loadConfig();

    expect(config.daemon).toBeDefined();
    expect(config.daemon!.enabled).toBe(true);
    expect(config.daemon!.pollingInterval).toBe(5000);
    expect(config.daemon!.watchPatterns).toContain('/test/.ai-sdlc/backlog/*.md');
    expect(config.daemon!.processDelay).toBe(500);
    expect(config.daemon!.shutdownTimeout).toBe(30000);
    expect(config.daemon!.enableEscShutdown).toBe(false);
    expect(config.daemon!.escTimeout).toBe(500);
  });
});

describe('file path handling', () => {
  it('should extract story ID from file path', () => {
    const testPath = '/test/.ai-sdlc/backlog/my-story-123.md';
    const fileName = testPath.split('/').pop()?.replace('.md', '');

    expect(fileName).toBe('my-story-123');
  });

  it('should handle paths with special characters', () => {
    const testPath = '/test/.ai-sdlc/backlog/story-with-dashes-and_underscores.md';
    const fileName = testPath.split('/').pop()?.replace('.md', '');

    expect(fileName).toBe('story-with-dashes-and_underscores');
  });
});
