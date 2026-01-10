import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import {
  getEffectiveMaxRetries,
  isAtMaxRetries,
  resetRPIVCycle,
  appendReviewHistory,
} from './story.js';
import { Story, Config, ReviewAttempt, ReviewDecision, ReviewSeverity } from '../types/index.js';
import { DEFAULT_CONFIG } from './config.js';

// Mock fs to prevent actual file writes
vi.mock('fs');

beforeEach(() => {
  vi.resetAllMocks();
  // Mock writeFileSync to do nothing (functions modify story in memory and write to disk)
  vi.mocked(fs.writeFileSync).mockImplementation(() => {});
});

describe('story retry functions', () => {
  const mockStory: Story = {
    path: '/test/story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'test-1',
      title: 'Test Story',
      priority: 1,
      status: 'in-progress',
      type: 'feature',
      created: '2024-01-01',
      labels: [],
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
      reviews_complete: false,
    },
    content: '# Test Story\n\nContent',
  };

  const mockConfig: Config = {
    ...DEFAULT_CONFIG,
    reviewConfig: {
      maxRetries: 3,
      maxRetriesUpperBound: 10,
      autoCompleteOnApproval: true,
      autoRestartOnRejection: true,
    },
  };

  describe('getEffectiveMaxRetries', () => {
    it('should return story-specific max_retries if set', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          max_retries: 5,
        },
      };
      expect(getEffectiveMaxRetries(story, mockConfig)).toBe(5);
    });

    it('should return config default if story max_retries not set', () => {
      expect(getEffectiveMaxRetries(mockStory, mockConfig)).toBe(3);
    });

    it('should handle max_retries of 0', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          max_retries: 0,
        },
      };
      expect(getEffectiveMaxRetries(story, mockConfig)).toBe(0);
    });
  });

  describe('isAtMaxRetries', () => {
    it('should return false when retry_count is undefined', () => {
      expect(isAtMaxRetries(mockStory, mockConfig)).toBe(false);
    });

    it('should return false when retry_count is below max', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          retry_count: 2,
        },
      };
      expect(isAtMaxRetries(story, mockConfig)).toBe(false);
    });

    it('should return true when retry_count equals max', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          retry_count: 3,
        },
      };
      expect(isAtMaxRetries(story, mockConfig)).toBe(true);
    });

    it('should return true when retry_count exceeds max', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          retry_count: 5,
        },
      };
      expect(isAtMaxRetries(story, mockConfig)).toBe(true);
    });

    it('should use story-specific max_retries when checking', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          retry_count: 3,
          max_retries: 5,
        },
      };
      expect(isAtMaxRetries(story, mockConfig)).toBe(false);
    });
  });

  describe('resetRPIVCycle', () => {
    it('should reset workflow flags except research', () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      const result = resetRPIVCycle(story, 'Test rejection reason');

      expect(result.frontmatter.research_complete).toBe(true);
      expect(result.frontmatter.plan_complete).toBe(false);
      expect(result.frontmatter.implementation_complete).toBe(false);
      expect(result.frontmatter.reviews_complete).toBe(false);
    });

    it('should increment retry_count', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          retry_count: 1,
        },
      };
      const result = resetRPIVCycle(story, 'Test rejection reason');

      expect(result.frontmatter.retry_count).toBe(2);
    });

    it('should initialize retry_count to 1 if undefined', () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      const result = resetRPIVCycle(story, 'Test rejection reason');

      expect(result.frontmatter.retry_count).toBe(1);
    });

    it('should set last_restart_reason and timestamp', () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      const result = resetRPIVCycle(story, 'Code quality issues found');

      expect(result.frontmatter.last_restart_reason).toBe('Code quality issues found');
      expect(result.frontmatter.last_restart_timestamp).toBeDefined();
    });
  });

  describe('appendReviewHistory', () => {
    it('should initialize review_history array if not present', () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      const attempt: ReviewAttempt = {
        timestamp: new Date().toISOString(),
        decision: ReviewDecision.REJECTED,
        severity: ReviewSeverity.MEDIUM,
        feedback: 'Test feedback',
        blockers: [],
        codeReviewPassed: true,
        securityReviewPassed: true,
        poReviewPassed: false,
      };

      const result = appendReviewHistory(story, attempt);

      expect(result.frontmatter.review_history).toBeDefined();
      expect(result.frontmatter.review_history).toHaveLength(1);
      expect(result.frontmatter.review_history![0]).toEqual(attempt);
    });

    it('should append to existing review_history', () => {
      const existingAttempt: ReviewAttempt = {
        timestamp: '2024-01-01T10:00:00Z',
        decision: ReviewDecision.REJECTED,
        severity: ReviewSeverity.HIGH,
        feedback: 'Previous feedback',
        blockers: [],
        codeReviewPassed: false,
        securityReviewPassed: true,
        poReviewPassed: true,
      };

      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          review_history: [existingAttempt],
        },
      };

      const newAttempt: ReviewAttempt = {
        timestamp: new Date().toISOString(),
        decision: ReviewDecision.APPROVED,
        feedback: 'All good now',
        blockers: [],
        codeReviewPassed: true,
        securityReviewPassed: true,
        poReviewPassed: true,
      };

      const result = appendReviewHistory(story, newAttempt);

      expect(result.frontmatter.review_history).toHaveLength(2);
      expect(result.frontmatter.review_history![0]).toEqual(existingAttempt);
      expect(result.frontmatter.review_history![1]).toEqual(newAttempt);
    });

    it('should limit review_history to 10 entries', () => {
      const attempts: ReviewAttempt[] = Array.from({ length: 12 }, (_, i) => ({
        timestamp: `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        decision: ReviewDecision.REJECTED,
        severity: ReviewSeverity.LOW,
        feedback: `Attempt ${i + 1}`,
        blockers: [],
        codeReviewPassed: true,
        securityReviewPassed: true,
        poReviewPassed: false,
      }));

      let story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      for (const attempt of attempts) {
        story = appendReviewHistory(story, attempt);
      }

      expect(story.frontmatter.review_history).toHaveLength(10);
      // Should keep the last 10
      expect(story.frontmatter.review_history![0].feedback).toBe('Attempt 3');
      expect(story.frontmatter.review_history![9].feedback).toBe('Attempt 12');
    });
  });
});
