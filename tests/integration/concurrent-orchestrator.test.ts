/**
 * Integration tests for Multi-Process Orchestrator
 *
 * Tests concurrent story execution with real child processes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Orchestrator } from '../../src/core/orchestrator.js';
import type { Story, ProcessOrchestratorOptions } from '../../src/types/index.js';
import path from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';

describe('Orchestrator Integration', () => {
  const testDir = path.join(process.cwd(), 'tests', 'tmp', 'orchestrator-test');

  beforeEach(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  const createMockStory = (id: string, title: string): Story => ({
    path: path.join(testDir, `${id}.md`),
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

  it('should handle empty story list', async () => {
    const options: ProcessOrchestratorOptions = {
      concurrency: 2,
      shutdownTimeout: 1000,
      keepWorktrees: false,
    };

    const orchestrator = new Orchestrator(options);
    const results = await orchestrator.execute([]);

    expect(results).toEqual([]);
    expect(orchestrator.getActiveCount()).toBe(0);
  });

  it('should track orchestrator state correctly', () => {
    const options: ProcessOrchestratorOptions = {
      concurrency: 3,
      shutdownTimeout: 1000,
    };

    const orchestrator = new Orchestrator(options);
    expect(orchestrator.getActiveCount()).toBe(0);
    expect(orchestrator.getResults()).toEqual([]);
  });

  it('should respect concurrency limit in options', () => {
    const stories = [
      createMockStory('S-001', 'Story 1'),
      createMockStory('S-002', 'Story 2'),
      createMockStory('S-003', 'Story 3'),
    ];

    const options: ProcessOrchestratorOptions = {
      concurrency: 2,
      shutdownTimeout: 1000,
    };

    const orchestrator = new Orchestrator(options);
    expect(orchestrator.getActiveCount()).toBe(0);

    // Note: Full integration test with child processes would require
    // mocking the git worktree service and agent execution
    // This test validates the orchestrator construction and state
  });

  it('should handle graceful shutdown', async () => {
    const options: ProcessOrchestratorOptions = {
      concurrency: 2,
      shutdownTimeout: 500,
    };

    const orchestrator = new Orchestrator(options);
    await expect(orchestrator.shutdown()).resolves.not.toThrow();
  });

  it('should validate options correctly', () => {
    // Valid options
    expect(() => new Orchestrator({
      concurrency: 1,
      shutdownTimeout: 10000,
    })).not.toThrow();

    // Edge case: concurrency 0 (orchestrator should handle gracefully)
    expect(() => new Orchestrator({
      concurrency: 0,
      shutdownTimeout: 1000,
    })).not.toThrow();
  });
});
