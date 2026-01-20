import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => '{}'),
  },
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => '{}'),
}));

// Mock config
vi.mock('../core/config.js', () => ({
  getSdlcRoot: vi.fn(() => '/test/.ai-sdlc'),
  loadConfig: vi.fn(() => ({
    worktree: { enabled: true, basePath: '.ai-sdlc/worktrees' },
    epic: { maxConcurrent: 3, keepWorktrees: false, continueOnFailure: true },
  })),
  validateWorktreeBasePath: vi.fn(() => '/test/.ai-sdlc/worktrees'),
}));

// Mock kanban
vi.mock('../core/kanban.js', () => ({
  findStoriesByEpic: vi.fn(() => []),
}));

// Mock worktree service
vi.mock('../core/worktree.js', () => ({
  GitWorktreeService: vi.fn().mockImplementation(() => ({
    create: vi.fn(() => '/test/worktree/S-001-test'),
    remove: vi.fn(),
  })),
}));

// Mock theme
vi.mock('../core/theme.js', () => ({
  getThemedChalk: vi.fn(() => ({
    info: (s: string) => s,
    error: (s: string) => s,
    warning: (s: string) => s,
    success: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
  })),
}));

// Mock story logger
vi.mock('../core/story-logger.js', () => ({
  StoryLogger: vi.fn().mockImplementation(() => ({
    log: vi.fn(),
  })),
}));

// Mock progress dashboard
vi.mock('./progress-dashboard.js', () => ({
  createDashboard: vi.fn(() => ({ stories: new Map() })),
  updateStoryStatus: vi.fn(),
  markStorySkipped: vi.fn(),
  markStoryFailed: vi.fn(),
  advancePhase: vi.fn(),
  startDashboardRenderer: vi.fn(() => vi.fn()),
}));

// Mock dependency resolver
vi.mock('./dependency-resolver.js', () => ({
  groupStoriesByPhase: vi.fn((stories) => [stories]),
  validateDependencies: vi.fn(() => ({ valid: true, errors: [] })),
}));

describe('epic-processor subprocess invocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should spawn subprocess using process.execPath and process.argv[1]', async () => {
    // This test verifies we use the same invocation method as the parent process
    // instead of hardcoding 'node dist/index.js' which only works in dev mode

    const mockProc = new EventEmitter() as any;
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();

    const spawnMock = vi.mocked(spawn);
    spawnMock.mockReturnValue(mockProc);

    // Import after mocks are set up
    const { findStoriesByEpic } = await import('../core/kanban.js');
    vi.mocked(findStoriesByEpic).mockReturnValue([
      {
        path: '/test/stories/S-001/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'S-001',
          title: 'Test Story',
          slug: 'test-story',
          priority: 10,
          status: 'ready',
          type: 'feature',
          created: '2026-01-01T00:00:00Z',
          labels: ['epic-test'],
          dependencies: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
        },
        content: 'Test content',
      },
    ]);

    // Start the epic processing (don't await - we'll simulate completion)
    const { processEpic } = await import('./epic-processor.js');
    const epicPromise = processEpic({
      epicId: 'test',
      dryRun: false,
      force: true,
    });

    // Wait for spawn to be called
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify spawn was called with process.execPath and process.argv[1]
    expect(spawnMock).toHaveBeenCalled();
    const [execPath, args, options] = spawnMock.mock.calls[0];

    // Should use process.execPath (the node binary)
    expect(execPath).toBe(process.execPath);

    // Should use process.argv[1] (the script being run)
    expect(args[0]).toBe(process.argv[1]);

    // Should include the run command with story flag
    expect(args).toContain('run');
    expect(args).toContain('--story');
    expect(args).toContain('--auto');
    expect(args).toContain('--no-worktree');

    // Should run in the worktree directory
    expect(options.cwd).toBe('/test/worktree/S-001-test');

    // Simulate process completion to clean up
    mockProc.emit('close', 0);
    await epicPromise.catch(() => {}); // Ignore any errors from incomplete mocking
  });

  it('should NOT use hardcoded node dist/index.js path', async () => {
    const mockProc = new EventEmitter() as any;
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();

    const spawnMock = vi.mocked(spawn);
    spawnMock.mockReturnValue(mockProc);

    const { findStoriesByEpic } = await import('../core/kanban.js');
    vi.mocked(findStoriesByEpic).mockReturnValue([
      {
        path: '/test/stories/S-001/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'S-001',
          title: 'Test Story',
          slug: 'test-story',
          priority: 10,
          status: 'ready',
          type: 'feature',
          created: '2026-01-01T00:00:00Z',
          labels: ['epic-test'],
          dependencies: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
        },
        content: 'Test content',
      },
    ]);

    const { processEpic } = await import('./epic-processor.js');
    const epicPromise = processEpic({
      epicId: 'test',
      dryRun: false,
      force: true,
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    if (spawnMock.mock.calls.length > 0) {
      const [execPath, args] = spawnMock.mock.calls[0];

      // Should NOT be hardcoded 'node'
      expect(execPath).not.toBe('node');

      // Should NOT contain hardcoded 'dist/index.js'
      expect(args[0]).not.toBe('dist/index.js');
    }

    mockProc.emit('close', 0);
    await epicPromise.catch(() => {});
  });
});
