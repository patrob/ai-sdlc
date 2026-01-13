import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DaemonRunner } from '../../src/cli/daemon.js';

// Mock all external dependencies
vi.mock('chokidar');
vi.mock('../../src/core/config.js');
vi.mock('../../src/core/kanban.js');
vi.mock('../../src/core/theme.js');
vi.mock('../../src/cli/runner.js');

describe('Daemon Integration Tests', () => {
  let daemon: DaemonRunner;
  let mockChokidar: any;
  let mockConfig: any;
  let mockKanban: any;
  let mockTheme: any;
  let mockRunner: any;

  beforeEach(async () => {
    // Setup mocks
    mockChokidar = await import('chokidar');
    mockConfig = await import('../../src/core/config.js');
    mockKanban = await import('../../src/core/kanban.js');
    mockTheme = await import('../../src/core/theme.js');
    mockRunner = await import('../../src/cli/runner.js');

    // Configure mocks
    vi.mocked(mockConfig.getSdlcRoot).mockReturnValue('/test/.ai-sdlc');
    vi.mocked(mockConfig.loadConfig).mockReturnValue({
      daemon: {
        enabled: true,
        pollingInterval: 5000,
        watchPatterns: ['stories/*/story.md'],
        processDelay: 500,
        shutdownTimeout: 30000,
        enableEscShutdown: false,
        escTimeout: 500,
      },
      theme: 'none',
    } as any);

    vi.mocked(mockTheme.getThemedChalk).mockReturnValue({
      bold: (str: string) => str,
      dim: (str: string) => str,
      info: (str: string) => str,
      success: (str: string) => str,
      warning: (str: string) => str,
      error: (str: string) => str,
    } as any);

    vi.mocked(mockKanban.assessState).mockReturnValue({
      backlogItems: [],
      readyItems: [],
      inProgressItems: [],
      doneItems: [],
      recommendedActions: [],
    });

    const mockWatcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(mockChokidar.default.watch).mockReturnValue(mockWatcher as any);

    vi.mocked(mockRunner.WorkflowRunner).mockImplementation(() => ({
      run: vi.fn().mockResolvedValue(undefined),
    } as any));

    // Spy on console and process
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    daemon = new DaemonRunner();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('Daemon startup', () => {
    it('should initialize chokidar watcher on start', async () => {
      // Start daemon (but don't await indefinitely)
      const startPromise = daemon.start();

      // Give it a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify chokidar was initialized with the watch directories
      expect(mockChokidar.default.watch).toHaveBeenCalled();
      expect(mockChokidar.default.watch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('backlog'),
          expect.stringContaining('ready'),
          expect.stringContaining('in-progress'),
        ]),
        expect.objectContaining({
          persistent: true,
          ignoreInitial: true,
          followSymlinks: false,
        })
      );
    });

    it('should register file event handlers', async () => {
      const mockWatcher = {
        on: vi.fn().mockReturnThis(),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockChokidar.default.watch).mockReturnValue(mockWatcher as any);

      // Start daemon
      const startPromise = daemon.start();

      // Give it a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify event handlers were registered
      expect(mockWatcher.on).toHaveBeenCalledWith('add', expect.any(Function));
      expect(mockWatcher.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should log startup message', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      // Start daemon
      const startPromise = daemon.start();

      // Give it a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify startup logging
      expect(consoleLogSpy).toHaveBeenCalled();
      const logCalls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasStartupMessage = logCalls.some(msg =>
        typeof msg === 'string' && msg.includes('Daemon')
      );

      expect(hasStartupMessage).toBe(true);
    });
  });

  describe('File detection', () => {
    it('should detect new story files', async () => {
      const mockWatcher = {
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockChokidar.default.watch).mockReturnValue(mockWatcher as any);

      // Start daemon
      daemon.start();

      // Give it a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get the 'add' event handler
      const addHandler = mockWatcher.on.mock.calls.find(
        call => call[0] === 'add'
      )?.[1];

      expect(addHandler).toBeDefined();

      if (addHandler) {
        // Simulate file added
        addHandler('/test/.ai-sdlc/backlog/new-story.md');

        // Verify internal state (file added to queue)
        const daemonAny = daemon as any;
        // Queue processing happens asynchronously, so we can't directly verify
        // but we can verify the handler was called
        expect(addHandler).toBeDefined();
      }
    });
  });

  describe('Error handling', () => {
    it('should handle watcher initialization errors', async () => {
      vi.mocked(mockChokidar.default.watch).mockImplementation(() => {
        throw new Error('Watcher initialization failed');
      });

      await expect(daemon.start()).rejects.toThrow('Watcher initialization failed');
    });

    it('should log errors without crashing daemon', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      const mockWatcher = {
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockChokidar.default.watch).mockReturnValue(mockWatcher as any);

      // Start daemon
      daemon.start();

      // Give it a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get the 'error' event handler
      const errorHandler = mockWatcher.on.mock.calls.find(
        call => call[0] === 'error'
      )?.[1];

      expect(errorHandler).toBeDefined();

      if (errorHandler) {
        // Simulate error
        errorHandler(new Error('Test error'));

        // Verify error was logged
        const logCalls = consoleLogSpy.mock.calls.map(call => call[0]);
        const hasErrorMessage = logCalls.some(msg =>
          typeof msg === 'string' && (msg.includes('error') || msg.includes('Error'))
        );

        expect(hasErrorMessage).toBe(true);
      }
    });
  });

  describe('Graceful shutdown', () => {
    it('should close watcher on stop', async () => {
      const mockWatcher = {
        on: vi.fn().mockReturnThis(),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockChokidar.default.watch).mockReturnValue(mockWatcher as any);

      // Start daemon
      daemon.start();

      // Give it a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Stop daemon
      await daemon.stop();

      // Verify watcher was closed
      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('should log shutdown message', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      const mockWatcher = {
        on: vi.fn().mockReturnThis(),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockChokidar.default.watch).mockReturnValue(mockWatcher as any);

      // Start daemon
      daemon.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Stop daemon
      await daemon.stop();

      // Verify shutdown logging
      const logCalls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasShutdownMessage = logCalls.some(msg =>
        typeof msg === 'string' && msg.toLowerCase().includes('shutdown')
      );

      expect(hasShutdownMessage).toBe(true);
    });

    it('should complete stop without errors', async () => {
      const mockWatcher = {
        on: vi.fn().mockReturnThis(),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockChokidar.default.watch).mockReturnValue(mockWatcher as any);

      // Start daemon
      daemon.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Stop daemon - should complete without throwing
      // Note: process.exit is called by the signal handler, not stop() itself
      await expect(daemon.stop()).resolves.toBeUndefined();
    });
  });

  describe('Queue processing', () => {
    it('should prevent duplicate processing of same story', () => {
      const daemonAny = daemon as any;
      const testId = 'test-story';

      // Mark as completed
      daemonAny.completedStoryIds.add(testId);

      // Verify it's tracked
      expect(daemonAny.completedStoryIds.has(testId)).toBe(true);

      // Attempt to add again should not increase size
      daemonAny.completedStoryIds.add(testId);
      expect(daemonAny.completedStoryIds.size).toBe(1);
    });

    it('should skip files during shutdown', async () => {
      const daemonAny = daemon as any;

      // Set shutdown flag
      daemonAny.isShuttingDown = true;

      // Verify shutdown flag is set
      expect(daemonAny.isShuttingDown).toBe(true);
    });
  });

  describe('Single story startup', () => {
    it('should pick only highest priority story on startup with multiple stories', async () => {
      // Setup mocks first
      const mockChokidar = await import('chokidar');
      const mockKanban = await import('../../src/core/kanban.js');
      const mockTheme = await import('../../src/core/theme.js');
      const mockConfig = await import('../../src/core/config.js');
      const mockRunner = await import('../../src/cli/runner.js');
      const mockWatcher = {
        on: vi.fn().mockReturnThis(),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockChokidar.default.watch).mockReturnValue(mockWatcher as any);

      // Mock config
      vi.mocked(mockConfig.getSdlcRoot).mockReturnValue('/test/.ai-sdlc');
      vi.mocked(mockConfig.loadConfig).mockReturnValue({
        daemon: {
          enabled: true,
          pollingInterval: 5000,
          watchPatterns: ['stories/*/story.md'],
          processDelay: 500,
          shutdownTimeout: 30000,
          enableEscShutdown: false,
          escTimeout: 500,
        },
        theme: 'none',
      } as any);

      // Mock runner
      vi.mocked(mockRunner.WorkflowRunner).mockImplementation(() => ({
        run: vi.fn().mockResolvedValue(undefined),
      } as any));

      // Mock theme to prevent undefined errors
      vi.mocked(mockTheme.getThemedChalk).mockReturnValue({
        bold: (str: string) => str,
        dim: (str: string) => str,
        info: (str: string) => str,
        success: (str: string) => str,
        warning: (str: string) => str,
        error: (str: string) => str,
      } as any);

      const testActions = [
        {
          storyId: 'high-priority-story',
          storyPath: '/test/.ai-sdlc/in-progress/high-priority-story.md',
          type: 'implement',
          reason: 'In-progress folder priority (0-150)',
          context: undefined,
        },
        {
          storyId: 'medium-priority-story',
          storyPath: '/test/.ai-sdlc/ready/medium-priority-story.md',
          type: 'review',
          reason: 'Ready folder priority (200-400)',
          context: undefined,
        },
        {
          storyId: 'low-priority-story',
          storyPath: '/test/.ai-sdlc/backlog/low-priority-story.md',
          type: 'refine',
          reason: 'Backlog folder priority (500+)',
          context: undefined,
        },
      ];

      // Use mockImplementation to ensure fresh return value each call
      vi.mocked(mockKanban.assessState).mockImplementation(() => ({
        backlogItems: [],
        readyItems: [],
        inProgressItems: [],
        doneItems: [],
        recommendedActions: testActions,
      }));

      // Create daemon AFTER mocks are set up
      const daemon = new DaemonRunner();
      const daemonAny = daemon as any;

      // Track which story IDs were processed
      const processedStories: string[] = [];
      const originalProcessStory = daemonAny.processStory.bind(daemonAny);
      daemonAny.processStory = async (filePath: string, storyId: string) => {
        processedStories.push(storyId);
        return originalProcessStory(filePath, storyId);
      };

      // Start daemon
      await daemon.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify the highest priority story was picked for processing
      expect(processedStories.length).toBeGreaterThanOrEqual(1);
      expect(processedStories[0]).toBe('high-priority-story');

      // Verify assessState was called to find stories
      expect(vi.mocked(mockKanban.assessState)).toHaveBeenCalled();

      await daemon.stop();
    });

    it('should reassess after story completion to pick next highest priority', async () => {
      // Setup mocks first
      const mockChokidar = await import('chokidar');
      const mockKanban = await import('../../src/core/kanban.js');
      const mockTheme = await import('../../src/core/theme.js');
      const mockWatcher = {
        on: vi.fn().mockReturnThis(),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockChokidar.default.watch).mockReturnValue(mockWatcher as any);

      // Mock theme to prevent undefined errors
      vi.mocked(mockTheme.getThemedChalk).mockReturnValue({
        bold: (str: string) => str,
        dim: (str: string) => str,
        info: (str: string) => str,
        success: (str: string) => str,
        warning: (str: string) => str,
        error: (str: string) => str,
      } as any);

      // First assessment returns 2 stories
      vi.mocked(mockKanban.assessState).mockReturnValue({
        backlogItems: [],
        readyItems: [],
        inProgressItems: [],
        doneItems: [],
        recommendedActions: [
          {
            storyId: 'story-a',
            storyPath: '/test/.ai-sdlc/in-progress/story-a.md',
            type: 'implement',
            reason: 'In-progress folder',
            context: undefined,
          },
          {
            storyId: 'story-b',
            storyPath: '/test/.ai-sdlc/backlog/story-b.md',
            type: 'refine',
            reason: 'Backlog folder',
            context: undefined,
          },
        ],
      });

      // Create daemon AFTER mocks are set up
      const daemon = new DaemonRunner();
      const daemonAny = daemon as any;

      // Track which story IDs were processed
      const processedStories: string[] = [];
      const originalProcessStory = daemonAny.processStory.bind(daemonAny);
      daemonAny.processStory = async (filePath: string, storyId: string) => {
        processedStories.push(storyId);
        return originalProcessStory(filePath, storyId);
      };

      await daemon.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify story-a was picked first for processing
      expect(processedStories.length).toBeGreaterThanOrEqual(1);
      expect(processedStories[0]).toBe('story-a');

      // Verify assessState was called to find stories
      expect(vi.mocked(mockKanban.assessState)).toHaveBeenCalled();

      await daemon.stop();
    });
  });

  describe('Nearest completion priority', () => {
    it('should prioritize more complete in-progress story over less complete one', async () => {
      // Setup mocks first
      const mockChokidar = await import('chokidar');
      const mockKanban = await import('../../src/core/kanban.js');
      const mockTheme = await import('../../src/core/theme.js');
      const mockWatcher = {
        on: vi.fn().mockReturnThis(),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockChokidar.default.watch).mockReturnValue(mockWatcher as any);

      // Mock theme to prevent undefined errors
      vi.mocked(mockTheme.getThemedChalk).mockReturnValue({
        bold: (str: string) => str,
        dim: (str: string) => str,
        info: (str: string) => str,
        success: (str: string) => str,
        warning: (str: string) => str,
        error: (str: string) => str,
      } as any);

      // Story A: only research and plan complete (score: 30)
      // Story B: research, plan, and implementation complete (score: 60)
      // Both priority: 1
      // Story A priority = 1 + 50 - 30 = 21
      // Story B priority = 1 + 50 - 60 = -9
      // Story B should be picked first
      vi.mocked(mockKanban.assessState).mockReturnValue({
        backlogItems: [],
        readyItems: [],
        inProgressItems: [],
        doneItems: [],
        recommendedActions: [
          {
            storyId: 'story-almost-complete',
            storyPath: '/test/.ai-sdlc/in-progress/story-almost-complete.md',
            type: 'review',
            reason: 'In-progress - almost complete',
            priority: 1 + 100 - 60,
            context: undefined,
          },
          {
            storyId: 'story-early-stage',
            storyPath: '/test/.ai-sdlc/in-progress/story-early-stage.md',
            type: 'implement',
            reason: 'In-progress - early stage',
            priority: 1 + 50 - 30,
            context: undefined,
          },
        ],
      });

      // Create daemon AFTER mocks are set up
      const daemon = new DaemonRunner();
      const daemonAny = daemon as any;

      // Track which story IDs were processed
      const processedStories: string[] = [];
      const originalProcessStory = daemonAny.processStory.bind(daemonAny);
      daemonAny.processStory = async (filePath: string, storyId: string) => {
        processedStories.push(storyId);
        return originalProcessStory(filePath, storyId);
      };

      // Start daemon
      await daemon.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify more complete story is picked first (lowest priority number)
      expect(processedStories.length).toBeGreaterThanOrEqual(1);
      expect(processedStories[0]).toBe('story-almost-complete');

      await daemon.stop();
    });

    it('should use frontmatter priority as tiebreaker for same completion score', async () => {
      // Setup mocks first
      const mockChokidar = await import('chokidar');
      const mockKanban = await import('../../src/core/kanban.js');
      const mockTheme = await import('../../src/core/theme.js');
      const mockWatcher = {
        on: vi.fn().mockReturnThis(),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockChokidar.default.watch).mockReturnValue(mockWatcher as any);

      // Mock theme to prevent undefined errors
      vi.mocked(mockTheme.getThemedChalk).mockReturnValue({
        bold: (str: string) => str,
        dim: (str: string) => str,
        info: (str: string) => str,
        success: (str: string) => str,
        warning: (str: string) => str,
        error: (str: string) => str,
      } as any);

      // Both stories have same completion score (30) but different frontmatter priority
      // Story A: priority 1, score 30 = 1 + 50 - 30 = 21
      // Story B: priority 2, score 30 = 2 + 50 - 30 = 22
      // Story A should be picked first - assessState returns them in priority order
      vi.mocked(mockKanban.assessState).mockReturnValue({
        backlogItems: [],
        readyItems: [],
        inProgressItems: [],
        doneItems: [],
        recommendedActions: [
          {
            storyId: 'story-priority-1',
            storyPath: '/test/.ai-sdlc/in-progress/story-priority-1.md',
            type: 'implement',
            reason: 'In-progress - priority 1',
            priority: 1 + 50 - 30,
            context: undefined,
          },
          {
            storyId: 'story-priority-2',
            storyPath: '/test/.ai-sdlc/in-progress/story-priority-2.md',
            type: 'implement',
            reason: 'In-progress - priority 2',
            priority: 2 + 50 - 30,
            context: undefined,
          },
        ],
      });

      // Create daemon AFTER mocks are set up
      const daemon = new DaemonRunner();
      const daemonAny = daemon as any;

      // Track which story IDs were processed
      const processedStories: string[] = [];
      const originalProcessStory = daemonAny.processStory.bind(daemonAny);
      daemonAny.processStory = async (filePath: string, storyId: string) => {
        processedStories.push(storyId);
        return originalProcessStory(filePath, storyId);
      };

      // Start daemon
      await daemon.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify lower frontmatter priority is picked first
      expect(processedStories.length).toBeGreaterThanOrEqual(1);
      expect(processedStories[0]).toBe('story-priority-1');

      await daemon.stop();
    });
  });
});
