// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as cp from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

import { type Story } from '../types/index.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getLastCompletedPhase, getNextPhase,GitWorktreeService } from './worktree.js';

// Mock child_process and fs
vi.mock('child_process');
vi.mock('fs');

describe('getLastCompletedPhase', () => {
  const createMockStory = (overrides: any = {}): Story => ({
    path: '/test/story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'S-0001',
      title: 'Test Story',
      status: 'in-progress',
      type: 'feature',
      priority: 100,
      created: '2024-01-01',
      labels: [],
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
      ...overrides,
    },
    content: '',
  });

  it('returns null when no phases are complete', () => {
    const story = createMockStory();
    expect(getLastCompletedPhase(story)).toBeNull();
  });

  it('returns "research" when only research is complete', () => {
    const story = createMockStory({
      research_complete: true,
    });
    expect(getLastCompletedPhase(story)).toBe('research');
  });

  it('returns "plan" when research and plan are complete', () => {
    const story = createMockStory({
      research_complete: true,
      plan_complete: true,
    });
    expect(getLastCompletedPhase(story)).toBe('plan');
  });

  it('returns "implementation" when research, plan, and implementation are complete', () => {
    const story = createMockStory({
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
    });
    expect(getLastCompletedPhase(story)).toBe('implementation');
  });

  it('returns "review" when all phases are complete', () => {
    const story = createMockStory({
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
      reviews_complete: true,
    });
    expect(getLastCompletedPhase(story)).toBe('review');
  });

  it('returns highest completed phase even when earlier phases are incomplete', () => {
    const story = createMockStory({
      research_complete: false,
      plan_complete: false,
      implementation_complete: true,
      reviews_complete: false,
    });
    expect(getLastCompletedPhase(story)).toBe('implementation');
  });
});

describe('getNextPhase', () => {
  const createMockStory = (overrides: any = {}): Story => ({
    path: '/test/story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'S-0001',
      title: 'Test Story',
      status: 'ready',
      type: 'feature',
      priority: 100,
      created: '2024-01-01',
      labels: [],
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
      ...overrides,
    },
    content: '',
  });

  it('returns null for blocked stories', () => {
    const story = createMockStory({ status: 'blocked' });
    expect(getNextPhase(story)).toBeNull();
  });

  it('returns null for done stories', () => {
    const story = createMockStory({ status: 'done' });
    expect(getNextPhase(story)).toBeNull();
  });

  it('returns "refine" for backlog stories', () => {
    const story = createMockStory({ status: 'backlog' });
    expect(getNextPhase(story)).toBe('refine');
  });

  describe('ready stories', () => {
    it('returns "research" when no phases are complete', () => {
      const story = createMockStory({ status: 'ready' });
      expect(getNextPhase(story)).toBe('research');
    });

    it('returns "plan" when research is complete', () => {
      const story = createMockStory({
        status: 'ready',
        research_complete: true,
      });
      expect(getNextPhase(story)).toBe('plan');
    });

    it('returns "implement" when research and plan are complete', () => {
      const story = createMockStory({
        status: 'ready',
        research_complete: true,
        plan_complete: true,
      });
      expect(getNextPhase(story)).toBe('implement');
    });
  });

  describe('in-progress stories', () => {
    it('returns "implement" when implementation is not complete', () => {
      const story = createMockStory({
        status: 'in-progress',
        research_complete: true,
        plan_complete: true,
        implementation_complete: false,
      });
      expect(getNextPhase(story)).toBe('implement');
    });

    it('returns "review" when implementation is complete', () => {
      const story = createMockStory({
        status: 'in-progress',
        research_complete: true,
        plan_complete: true,
        implementation_complete: true,
        reviews_complete: false,
      });
      expect(getNextPhase(story)).toBe('review');
    });

    it('returns "create_pr" when all phases are complete', () => {
      const story = createMockStory({
        status: 'in-progress',
        research_complete: true,
        plan_complete: true,
        implementation_complete: true,
        reviews_complete: true,
      });
      expect(getNextPhase(story)).toBe('create_pr');
    });
  });
});
