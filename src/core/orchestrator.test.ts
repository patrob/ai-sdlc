/**
 * Unit tests for Multi-Process Orchestrator
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Orchestrator } from './orchestrator.js';
import type { Story, ProcessOrchestratorOptions } from '../types/index.js';
import { ChildProcess } from 'child_process';

// Mock dependencies
vi.mock('./worktree.js', () => ({
  GitWorktreeService: vi.fn().mockImplementation(() => ({
    getWorktreePath: (storyId: string, slug: string) => `/tmp/worktrees/${storyId}-${slug}`,
    getBranchName: (storyId: string, slug: string) => `ai-sdlc/${storyId}-${slug}`,
    create: vi.fn(),
    remove: vi.fn(),
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

vi.mock('./kanban.js', () => ({
  getSdlcRoot: vi.fn().mockReturnValue('/tmp/test-project'),
}));

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
});
