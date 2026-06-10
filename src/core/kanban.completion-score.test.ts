import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { assessState, calculateCompletionScore, findAllStories, findStoriesByEpic } from './kanban.js';
import * as storyModule from './story.js';
import { ReviewDecision, Story } from '../types/index.js';

describe('calculateCompletionScore', () => {
  function createMockStory(overrides: Partial<Story['frontmatter']> = {}): Story {
    return {
      frontmatter: {
        id: 'test-story',
        title: 'Test Story',
        priority: 1,
        status: 'in-progress',
        type: 'feature',
        created: '2024-01-01',
        labels: [],
        research_complete: false,
        plan_complete: false,
        implementation_complete: false,
        reviews_complete: false,
        ...overrides,
      },
      slug: 'test-story',
      path: '/test/story.md',
      content: '# Test Story',
    };
  }

  it('should return 0 for story with no completed flags', () => {
    const story = createMockStory();
    expect(calculateCompletionScore(story)).toBe(0);
  });

  it('should return 10 for research_complete only', () => {
    const story = createMockStory({ research_complete: true });
    expect(calculateCompletionScore(story)).toBe(10);
  });

  it('should return 20 for plan_complete only', () => {
    const story = createMockStory({ plan_complete: true });
    expect(calculateCompletionScore(story)).toBe(20);
  });

  it('should return 30 for implementation_complete only', () => {
    const story = createMockStory({ implementation_complete: true });
    expect(calculateCompletionScore(story)).toBe(30);
  });

  it('should return 40 for reviews_complete only', () => {
    const story = createMockStory({ reviews_complete: true });
    expect(calculateCompletionScore(story)).toBe(40);
  });

  it('should return 30 for research + plan complete', () => {
    const story = createMockStory({
      research_complete: true,
      plan_complete: true,
    });
    expect(calculateCompletionScore(story)).toBe(30);
  });

  it('should return 60 for research + plan + implementation complete', () => {
    const story = createMockStory({
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
    });
    expect(calculateCompletionScore(story)).toBe(60);
  });

  it('should return 100 for all flags complete', () => {
    const story = createMockStory({
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
      reviews_complete: true,
    });
    expect(calculateCompletionScore(story)).toBe(100);
  });

  it('should prioritize more complete stories within same priority band', () => {
    // Two in-progress stories with same frontmatter priority
    const storyA = createMockStory({
      priority: 1,
      implementation_complete: false,
      research_complete: true,
      plan_complete: true,
    });

    const storyB = createMockStory({
      priority: 1,
      implementation_complete: true,
      research_complete: true,
      plan_complete: true,
    });

    const scoreA = calculateCompletionScore(storyA);
    const scoreB = calculateCompletionScore(storyB);

    // storyB should have higher completion score (more complete)
    expect(scoreB).toBeGreaterThan(scoreA);
    expect(scoreB).toBe(scoreA + 30);
  });

  it('should result in lower priority number for more complete stories', () => {
    // Simulate priority calculation with completion score
    const baseImplementPriority = 50;

    const lessComplete = createMockStory({ priority: 1, research_complete: true });
    const moreComplete = createMockStory({
      priority: 1,
      research_complete: true,
      plan_complete: true,
    });

    const lessPriorityNum = 1 + baseImplementPriority - calculateCompletionScore(lessComplete);
    const morePriorityNum = 1 + baseImplementPriority - calculateCompletionScore(moreComplete);

    // More complete story should have lower priority number (worked first)
    expect(morePriorityNum).toBeLessThan(lessPriorityNum);
  });
});
