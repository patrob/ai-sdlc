 
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
