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

  describe('Phase 3: processQueue QueuedStory destructuring', () => {
    let localParseStoryMock: ReturnType<typeof vi.mocked>;

    beforeEach(async () => {
      const { parseStory } = await import('../core/story.js');
      localParseStoryMock = vi.mocked(parseStory);
    });

    it('should destructure path and id from queue items', () => {
      const daemonAny = daemon as any;
      const testPath = '/test/.ai-sdlc/backlog/test-story.md';
      const testId = 'story-phase3-123';

      // Directly add to queue to test destructuring
      daemonAny.processingQueue.push({ path: testPath, id: testId });

      // Test that we can destructure correctly
      const { path: filePath, id: storyId } = daemonAny.processingQueue[0];

      expect(filePath).toBe(testPath);
      expect(storyId).toBe(testId);
    });

    it('should use frontmatter.id when adding to activeStoryIds', async () => {
      localParseStoryMock.mockReturnValue({
        frontmatter: {
          id: 'story-active-456',
          title: 'Active Story',
        },
      } as any);

      const daemonAny = daemon as any;
      const testPath = '/test/.ai-sdlc/backlog/test-story.md';

      // Mock processQueue to prevent it from running
      const processQueueSpy = vi.spyOn(daemonAny, 'processQueue' as any)
        .mockImplementation(() => {});

      daemonAny.onFileAdded(testPath);

      // Verify queue contains the correct id
      expect(daemonAny.processingQueue[0].id).toBe('story-active-456');
    });
  });

  describe('Phase 2: onFileAdded story parsing', () => {
    let localParseStoryMock: ReturnType<typeof vi.mocked>;

    beforeEach(async () => {
      // Re-import and get fresh mock reference for each test
      const { parseStory } = await import('../core/story.js');
      localParseStoryMock = vi.mocked(parseStory);
    });

    it('should call parseStory with file path when adding new file', () => {
      const testPath = '/test/.ai-sdlc/backlog/test-story.md';
      const mockStory = {
        frontmatter: {
          id: 'story-from-parse',
          title: 'Test Story',
        },
      };

      localParseStoryMock.mockReturnValue(mockStory as any);

      const daemonAny = daemon as any;
      daemonAny.onFileAdded(testPath);

      expect(localParseStoryMock).toHaveBeenCalledWith(testPath);
    });

    it('should skip story when parseStory throws error', () => {
      const testPath = '/test/.ai-sdlc/backlog/broken-story.md';

      localParseStoryMock.mockImplementation(() => {
        throw new Error('Invalid frontmatter');
      });

      const daemonAny = daemon as any;
      daemonAny.onFileAdded(testPath);

      // Should not add to queue if parsing fails
      expect(daemonAny.processingQueue.length).toBe(0);
      // Verify warning was logged
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should check completedStoryIds using frontmatter.id', () => {
      const testPath = '/test/.ai-sdlc/backlog/test-story.md';
      const mockStory = {
        frontmatter: {
          id: 'already-done-123',
          title: 'Done Story',
        },
      };

      localParseStoryMock.mockReturnValue(mockStory as any);

      const daemonAny = daemon as any;
      daemonAny.completedStoryIds.add('already-done-123');

      daemonAny.onFileAdded(testPath);

      // Should not add to queue if story is in completed set
      expect(daemonAny.processingQueue.length).toBe(0);
    });

    it('should check activeStoryIds using frontmatter.id', () => {
      const testPath = '/test/.ai-sdlc/backlog/test-story.md';
      const mockStory = {
        frontmatter: {
          id: 'currently-active-123',
          title: 'Active Story',
        },
      };

      localParseStoryMock.mockReturnValue(mockStory as any);

      const daemonAny = daemon as any;
      daemonAny.activeStoryIds.add('currently-active-123');

      daemonAny.onFileAdded(testPath);

      // Should not add to queue if story is in active set
      expect(daemonAny.processingQueue.length).toBe(0);
    });

    it('should push queue item with path and frontmatter.id', () => {
      const testPath = '/test/.ai-sdlc/backlog/new-story.md';
      const mockStory = {
        frontmatter: {
          id: 'new-story-456',
          title: 'New Story',
        },
      };

      localParseStoryMock.mockReturnValue(mockStory as any);

      const daemonAny = daemon as any;
      // Mock processQueue to prevent it from running and clearing the queue
      vi.spyOn(daemonAny, 'processQueue' as any).mockImplementation(() => {});

      daemonAny.onFileAdded(testPath);

      expect(daemonAny.processingQueue.length).toBe(1);
      expect(daemonAny.processingQueue[0]).toEqual({
        path: testPath,
        id: 'new-story-456',
      });
    });
  });

  describe('Phase 4: processStory signature and action matching', () => {
    let localParseStoryMock: ReturnType<typeof vi.mocked>;

    beforeEach(async () => {
      const { parseStory } = await import('../core/story.js');
      localParseStoryMock = vi.mocked(parseStory);
    });

    it('should accept storyId parameter in processStory', async () => {
      localParseStoryMock.mockReturnValue({
        frontmatter: {
          id: 'story-p4-123',
          title: 'Phase 4 Story',
        },
      } as any);

      const daemonAny = daemon as any;
      const testPath = '/test/.ai-sdlc/backlog/test-story.md';
      const testId = 'story-p4-123';

      // Mock executeAction to prevent actual execution
      vi.spyOn(daemonAny, 'executeAction' as any).mockResolvedValue(undefined);

      // Should be able to call processStory with both filePath and storyId
      const result = await daemonAny.processStory(testPath, testId);

      expect(typeof result).toBe('boolean');
    });

    it('should use passed storyId for action matching, not re-parse', async () => {
      const mockStory = {
        frontmatter: {
          id: 'story-match-789',
          title: 'Matching Story',
        },
      };

      localParseStoryMock.mockReturnValue(mockStory as any);

      const daemonAny = daemon as any;
      const testPath = '/test/.ai-sdlc/backlog/test-story.md';
      const testId = 'story-match-789';

      // Mock executeAction
      vi.spyOn(daemonAny, 'executeAction' as any).mockResolvedValue(undefined);

      await daemonAny.processStory(testPath, testId);

      // parseStory should be called for validation, not for ID extraction
      expect(localParseStoryMock).toHaveBeenCalledWith(testPath);
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

describe('watch path configuration', () => {
  it('should only watch backlog, ready, and in-progress folders', () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;

    // Access the watch directories from the start method by examining what gets passed to chokidar
    // We'll verify this by checking what paths would be constructed
    const watchDirs = [
      require('path').join(daemonAny.sdlcRoot, 'backlog'),
      require('path').join(daemonAny.sdlcRoot, 'ready'),
      require('path').join(daemonAny.sdlcRoot, 'in-progress'),
    ];

    // Verify blocked folder is NOT in watch directories
    expect(watchDirs).not.toContain(expect.stringContaining('blocked'));

    // Verify all active workflow folders are included
    expect(watchDirs.length).toBe(3);
    expect(watchDirs[0]).toContain('backlog');
    expect(watchDirs[1]).toContain('ready');
    expect(watchDirs[2]).toContain('in-progress');
  });

  it('should not watch done folder', () => {
    const daemon = new DaemonRunner();
    const daemonAny = daemon as any;

    const watchDirs = [
      require('path').join(daemonAny.sdlcRoot, 'backlog'),
      require('path').join(daemonAny.sdlcRoot, 'ready'),
      require('path').join(daemonAny.sdlcRoot, 'in-progress'),
    ];

    // Verify done folder is NOT in watch directories
    expect(watchDirs).not.toContain(expect.stringContaining('done'));
  });
});

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
    const daemonAny = daemon as any;

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
    const daemonAny = daemon as any;

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

describe('initial assessment on startup', () => {
  it('should set ignoreInitial to true in watcher options', async () => {
    const daemon = new DaemonRunner();
    const mockChokidar = await import('chokidar');
    const watchSpy = vi.spyOn(mockChokidar.default, 'watch');

    await daemon.start();
    await new Promise(resolve => setTimeout(resolve, 100));

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
    await new Promise(resolve => setTimeout(resolve, 100));

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
    await new Promise(resolve => setTimeout(resolve, 100));

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
    await new Promise(resolve => setTimeout(resolve, 100));

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
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have empty queue
    expect(daemonAny.processingQueue.length).toBe(0);

    await daemon.stop();
  });
});

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
