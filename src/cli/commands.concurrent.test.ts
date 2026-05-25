import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Story } from '../types/index.js';

const detectConflictsMock = vi.fn();
const executeMock = vi.fn();

vi.mock('../core/conflict-detector.js', () => ({
  detectConflicts: (...args: unknown[]) => detectConflictsMock(...args),
}));

vi.mock('../core/orchestrator.js', () => ({
  Orchestrator: vi.fn().mockImplementation(() => ({
    execute: (...args: unknown[]) => executeMock(...args),
  })),
}));

import { runConcurrentStoryQueue, selectConflictSafeBatch } from './commands.js';

const story = (id: string): Story => ({
  path: `/tmp/stories/${id}/story.md`,
  frontmatter: {
    id,
    title: id,
    priority: 1,
    status: 'ready',
    labels: [],
    created: '2025-01-01',
    type: 'feature',
    research_complete: false,
    plan_complete: false,
    implementation_complete: false,
    reviews_complete: false,
  },
  content: `# ${id}`,
});

describe('concurrent scheduling helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selectConflictSafeBatch defers high-severity conflicts', () => {
    detectConflictsMock.mockImplementation((stories: Story[]) => ({
      conflicts: stories.length < 2
        ? []
        : [{ storyA: 'S-1', storyB: 'S-2', severity: 'high', sharedFiles: ['a.ts'], sharedDirectories: [], recommendation: 'defer' }],
      safeToRunConcurrently: false,
      summary: 'high',
    }));

    const result = selectConflictSafeBatch([story('S-1'), story('S-2'), story('S-3')], 2, '/tmp/.ai-sdlc');
    expect(result.selectedStories.map(s => s.frontmatter.id)).toEqual(['S-1', 'S-3']);
    expect(result.deferredStories.map(s => s.frontmatter.id)).toEqual(['S-2']);
  });

  it('runConcurrentStoryQueue drains all ready stories in batches', async () => {
    detectConflictsMock.mockReturnValue({ conflicts: [], safeToRunConcurrently: true, summary: 'ok' });
    executeMock.mockImplementation(async (stories: Story[]) => stories.map((s) => ({
      storyId: s.frontmatter.id,
      success: true,
      exitCode: 0,
      signal: null,
      duration: 1,
    })));

    const c = { warning: (s: string) => s } as any;
    const results = await runConcurrentStoryQueue([story('S-1'), story('S-2'), story('S-3')], 2, '/tmp/.ai-sdlc', false, c);

    expect(results).toHaveLength(3);
    expect(results.map(r => r.storyId)).toEqual(['S-1', 'S-2', 'S-3']);
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it('runConcurrentStoryQueue fails open when conflict detection errors', async () => {
    detectConflictsMock.mockImplementation(() => {
      throw new Error('boom');
    });
    executeMock.mockResolvedValue([{ storyId: 'S-1', success: true, exitCode: 0, signal: null, duration: 1 }]);

    const c = { warning: (s: string) => s } as any;
    const results = await runConcurrentStoryQueue([story('S-1')], 2, '/tmp/.ai-sdlc', false, c);

    expect(results).toHaveLength(1);
    expect(executeMock).toHaveBeenCalled();
  });
});
