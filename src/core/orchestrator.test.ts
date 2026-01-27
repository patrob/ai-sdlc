/**
 * Unit tests for Multi-Process Orchestrator
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Orchestrator } from './orchestrator.js';
import type { Story, ProcessOrchestratorOptions } from '../types/index.js';
import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';

// Create mock child process
function createMockChildProcess(): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.pid = Math.floor(Math.random() * 10000);
  proc.stdout = new EventEmitter() as any;
  proc.stderr = new EventEmitter() as any;
  proc.kill = vi.fn().mockReturnValue(true);
  proc.send = vi.fn();
  return proc;
}

// Mock dependencies
vi.mock('./worktree.js', () => ({
  GitWorktreeService: vi.fn().mockImplementation(() => ({
    getWorktreePath: (storyId: string, slug: string) => `/tmp/worktrees/${storyId}-${slug}`,
    getBranchName: (storyId: string, slug: string) => `ai-sdlc/${storyId}-${slug}`,
    create: vi.fn().mockResolvedValue('/tmp/worktrees/test'),
    remove: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('./process-manager.js', () => ({
  ProcessManager: {
    getInstance: vi.fn().mockReturnValue({
      registerChild: vi.fn(),
      killAll: vi.fn(),
      killAllWithTimeout: vi.fn(),
    }),
  },
}));

vi.mock('./config.js', () => ({
  getSdlcRoot: vi.fn().mockReturnValue('/tmp/test-project'),
}));

// Store mock implementation so we can control it per test
let mockSpawn: ReturnType<typeof vi.fn>;

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  const defaultOptions: ProcessOrchestratorOptions = {
    concurrency: 2,
    shutdownTimeout: 1000,
    keepWorktrees: false,
  };

  const createMockStory = (id: string, title: string): Story => ({
    path: `/tmp/stories/${id}/story.md`,
    frontmatter: {
      id,
      title,
      status: 'ready',
      labels: [],
      created: '2024-01-01',
      type: 'feature',
      effort: 'medium',
      content_type: 'code',
    },
    content: `# ${title}`,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset spawn mock before each test
    mockSpawn = vi.mocked(spawn);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create orchestrator with correct options', () => {
      orchestrator = new Orchestrator(defaultOptions);
      expect(orchestrator).toBeDefined();
      expect(orchestrator.getActiveCount()).toBe(0);
    });
  });

  describe('execute', () => {
    it('should return empty array for empty story list', async () => {
      orchestrator = new Orchestrator(defaultOptions);
      const results = await orchestrator.execute([]);
      expect(results).toEqual([]);
    });

    it('should track results correctly', () => {
      orchestrator = new Orchestrator(defaultOptions);
      expect(orchestrator.getResults()).toEqual([]);
    });
  });

  describe('concurrency limiting', () => {
    it('should respect concurrency limit', () => {
      const options: ProcessOrchestratorOptions = {
        concurrency: 2,
        shutdownTimeout: 1000,
      };
      orchestrator = new Orchestrator(options);
      expect(orchestrator.getActiveCount()).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should handle shutdown with no active children', async () => {
      orchestrator = new Orchestrator(defaultOptions);
      await expect(orchestrator.shutdown()).resolves.not.toThrow();
    });
  });

  describe('getActiveCount', () => {
    it('should return 0 for new orchestrator', () => {
      orchestrator = new Orchestrator(defaultOptions);
      expect(orchestrator.getActiveCount()).toBe(0);
    });
  });

  describe('input validation', () => {
    it('should handle invalid concurrency gracefully', () => {
      const options: ProcessOrchestratorOptions = {
        concurrency: 0,
        shutdownTimeout: 1000,
      };
      // Should not throw on construction
      expect(() => new Orchestrator(options)).not.toThrow();
    });
  });

  describe('child process spawning', () => {
    it('should spawn child process for each story', async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc);

      orchestrator = new Orchestrator(defaultOptions);
      const stories = [createMockStory('S-001', 'Test Story')];

      // Execute stories (will spawn child)
      const executePromise = orchestrator.execute(stories);

      // Simulate child process completing
      setTimeout(() => {
        mockProc.emit('close', 0, null);
      }, 10);

      const results = await executePromise;

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].exitCode).toBe(0);
    });

    it('should respect concurrency limit', async () => {
      const mockProcs: ChildProcess[] = [];
      mockSpawn.mockImplementation(() => {
        const proc = createMockChildProcess();
        mockProcs.push(proc);
        return proc;
      });

      const options: ProcessOrchestratorOptions = {
        concurrency: 2,
        shutdownTimeout: 1000,
      };
      orchestrator = new Orchestrator(options);

      const stories = [
        createMockStory('S-001', 'Story 1'),
        createMockStory('S-002', 'Story 2'),
        createMockStory('S-003', 'Story 3'),
      ];

      const executePromise = orchestrator.execute(stories);

      // Wait a bit for first two to spawn
      await new Promise(resolve => setTimeout(resolve, 20));

      // Should have spawned 2 (concurrency limit), not 3
      expect(mockSpawn).toHaveBeenCalledTimes(2);

      // Complete first two
      mockProcs[0].emit('close', 0, null);
      mockProcs[1].emit('close', 0, null);

      // Wait for third to spawn
      await new Promise(resolve => setTimeout(resolve, 20));

      // Now third should spawn
      expect(mockSpawn).toHaveBeenCalledTimes(3);

      // Complete third
      mockProcs[2].emit('close', 0, null);

      const results = await executePromise;
      expect(results).toHaveLength(3);
    });

    it('should handle child process error without crashing parent', async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc);

      orchestrator = new Orchestrator(defaultOptions);
      const stories = [createMockStory('S-001', 'Test Story')];

      const executePromise = orchestrator.execute(stories);

      // Simulate child process error
      setTimeout(() => {
        mockProc.emit('close', 1, null);
      }, 10);

      const results = await executePromise;

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].exitCode).toBe(1);
      // Parent should still be running (test completes without crashing)
    });

    it('should handle child crash without affecting siblings', async () => {
      const mockProcs: ChildProcess[] = [];
      mockSpawn.mockImplementation(() => {
        const proc = createMockChildProcess();
        mockProcs.push(proc);
        return proc;
      });

      const options: ProcessOrchestratorOptions = {
        concurrency: 2,
        shutdownTimeout: 1000,
      };
      orchestrator = new Orchestrator(options);

      const stories = [
        createMockStory('S-001', 'Story 1'),
        createMockStory('S-002', 'Story 2'),
      ];

      const executePromise = orchestrator.execute(stories);

      // Wait for both to spawn
      await new Promise(resolve => setTimeout(resolve, 20));

      // First crashes, second succeeds
      mockProcs[0].emit('close', 1, null);
      mockProcs[1].emit('close', 0, null);

      const results = await executePromise;

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });
  });

  describe('IPC communication', () => {
    it('should handle IPC messages from child', async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc);

      orchestrator = new Orchestrator(defaultOptions);
      const stories = [createMockStory('S-001', 'Test Story')];

      const executePromise = orchestrator.execute(stories);

      // Simulate IPC messages
      setTimeout(() => {
        mockProc.emit('message', {
          type: 'status_update',
          storyId: 'S-001',
          timestamp: Date.now(),
          payload: { progress: 50 }
        });
        mockProc.emit('message', {
          type: 'complete',
          storyId: 'S-001',
          timestamp: Date.now(),
          payload: { result: { success: true } }
        });
        mockProc.emit('close', 0, null);
      }, 10);

      const results = await executePromise;

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });
  });
});
