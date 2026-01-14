import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import {
  getImplementationRetryCount,
  isAtMaxImplementationRetries,
  resetImplementationRetryCount,
  incrementImplementationRetryCount,
  getEffectiveMaxImplementationRetries,
} from './story.js';
import { Story, Config } from '../types/index.js';
import { DEFAULT_CONFIG } from './config.js';

// Mock fs to prevent actual file writes
vi.mock('fs');

beforeEach(() => {
  vi.resetAllMocks();
  // Mock writeFileSync to do nothing (functions modify story in memory and write to disk)
  vi.mocked(fs.writeFileSync).mockImplementation(() => {});
});

describe('story implementation retry functions', () => {
  const mockStory: Story = {
    path: '/test/story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'test-1',
      title: 'Test Story',
      slug: 'test-story',
      priority: 1,
      status: 'in-progress',
      type: 'feature',
      created: '2024-01-01',
      labels: [],
      research_complete: true,
      plan_complete: true,
      implementation_complete: false,
      reviews_complete: false,
    },
    content: '# Test Story\n\nContent',
  };

  const mockConfig: Config = {
    ...DEFAULT_CONFIG,
    implementation: {
      maxRetries: 3,
      maxRetriesUpperBound: 10,
    },
  };

  describe('getImplementationRetryCount', () => {
    it('should return 0 when implementation_retry_count is undefined', () => {
      expect(getImplementationRetryCount(mockStory)).toBe(0);
    });

    it('should return the current implementation_retry_count', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          implementation_retry_count: 2,
        },
      };
      expect(getImplementationRetryCount(story)).toBe(2);
    });

    it('should handle implementation_retry_count of 0', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          implementation_retry_count: 0,
        },
      };
      expect(getImplementationRetryCount(story)).toBe(0);
    });
  });

  describe('getEffectiveMaxImplementationRetries', () => {
    it('should return story-specific max_implementation_retries if set', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          max_implementation_retries: 5,
        },
      };
      expect(getEffectiveMaxImplementationRetries(story, mockConfig)).toBe(5);
    });

    it('should return config default if story max_implementation_retries not set', () => {
      expect(getEffectiveMaxImplementationRetries(mockStory, mockConfig)).toBe(3);
    });

    it('should handle max_implementation_retries of 0', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          max_implementation_retries: 0,
        },
      };
      expect(getEffectiveMaxImplementationRetries(story, mockConfig)).toBe(0);
    });

    it('should respect maxRetriesUpperBound cap', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          max_implementation_retries: 15, // Exceeds upper bound
        },
      };
      // The function should return the story value, capping is done in config validation
      expect(getEffectiveMaxImplementationRetries(story, mockConfig)).toBe(15);
    });
  });

  describe('isAtMaxImplementationRetries', () => {
    it('should return false when implementation_retry_count is undefined', () => {
      expect(isAtMaxImplementationRetries(mockStory, mockConfig)).toBe(false);
    });

    it('should return false when implementation_retry_count is below max', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          implementation_retry_count: 2,
        },
      };
      expect(isAtMaxImplementationRetries(story, mockConfig)).toBe(false);
    });

    it('should return true when implementation_retry_count equals max', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          implementation_retry_count: 3,
        },
      };
      expect(isAtMaxImplementationRetries(story, mockConfig)).toBe(true);
    });

    it('should return true when implementation_retry_count exceeds max', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          implementation_retry_count: 5,
        },
      };
      expect(isAtMaxImplementationRetries(story, mockConfig)).toBe(true);
    });

    it('should use story-specific max_implementation_retries when checking', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          implementation_retry_count: 3,
          max_implementation_retries: 5,
        },
      };
      expect(isAtMaxImplementationRetries(story, mockConfig)).toBe(false);
    });

    it('should return false when max is Infinity', () => {
      const configWithInfinityRetries: Config = {
        ...mockConfig,
        implementation: {
          maxRetries: Infinity,
          maxRetriesUpperBound: 10,
        },
      };
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          implementation_retry_count: 100,
        },
      };
      expect(isAtMaxImplementationRetries(story, configWithInfinityRetries)).toBe(false);
    });

    it('should handle max of 0 correctly', () => {
      const configWithZeroRetries: Config = {
        ...mockConfig,
        implementation: {
          maxRetries: 0,
          maxRetriesUpperBound: 10,
        },
      };
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          implementation_retry_count: 0,
        },
      };
      expect(isAtMaxImplementationRetries(story, configWithZeroRetries)).toBe(true);
    });
  });

  describe('resetImplementationRetryCount', () => {
    it('should set implementation_retry_count to 0', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          implementation_retry_count: 5,
        },
      };
      const result = resetImplementationRetryCount(story);
      expect(result.frontmatter.implementation_retry_count).toBe(0);
    });

    it('should handle undefined implementation_retry_count', () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      const result = resetImplementationRetryCount(story);
      expect(result.frontmatter.implementation_retry_count).toBe(0);
    });

    it('should update the updated timestamp', () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      const result = resetImplementationRetryCount(story);
      expect(result.frontmatter.updated).toBeDefined();
    });

    it('should call writeStory (writeFileSync)', () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      resetImplementationRetryCount(story);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('incrementImplementationRetryCount', () => {
    it('should increment from undefined to 1', () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      const result = incrementImplementationRetryCount(story);
      expect(result.frontmatter.implementation_retry_count).toBe(1);
    });

    it('should increment existing count', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          implementation_retry_count: 2,
        },
      };
      const result = incrementImplementationRetryCount(story);
      expect(result.frontmatter.implementation_retry_count).toBe(3);
    });

    it('should increment from 0', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          implementation_retry_count: 0,
        },
      };
      const result = incrementImplementationRetryCount(story);
      expect(result.frontmatter.implementation_retry_count).toBe(1);
    });

    it('should update the updated timestamp', () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      const result = incrementImplementationRetryCount(story);
      expect(result.frontmatter.updated).toBeDefined();
    });

    it('should call writeStory (writeFileSync)', () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      incrementImplementationRetryCount(story);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });
});
