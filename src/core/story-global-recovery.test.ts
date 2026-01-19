import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import {
  getTotalRecoveryAttempts,
  isAtGlobalRecoveryLimit,
  resetTotalRecoveryAttempts,
  incrementTotalRecoveryAttempts,
} from './story.js';
import { Story } from '../types/index.js';
import * as properLockfile from 'proper-lockfile';

// Mock fs to prevent actual file writes
vi.mock('fs');

// Mock proper-lockfile to prevent actual file locking
vi.mock('proper-lockfile');

beforeEach(() => {
  vi.resetAllMocks();
  // Mock writeFileSync to do nothing (functions modify story in memory and write to disk)
  vi.mocked(fs.writeFileSync).mockImplementation(() => {});
  // Mock proper-lockfile lock to return a release function
  vi.mocked(properLockfile.lock).mockResolvedValue(async () => {});
});

describe('story global recovery circuit breaker functions', () => {
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

  describe('getTotalRecoveryAttempts', () => {
    it('should return 0 when total_recovery_attempts is undefined', () => {
      expect(getTotalRecoveryAttempts(mockStory)).toBe(0);
    });

    it('should return 0 when total_recovery_attempts is 0', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          total_recovery_attempts: 0,
        },
      };
      expect(getTotalRecoveryAttempts(story)).toBe(0);
    });

    it('should return the current total_recovery_attempts', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          total_recovery_attempts: 5,
        },
      };
      expect(getTotalRecoveryAttempts(story)).toBe(5);
    });
  });

  describe('isAtGlobalRecoveryLimit', () => {
    it('should return false when total_recovery_attempts is 0', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          total_recovery_attempts: 0,
        },
      };
      expect(isAtGlobalRecoveryLimit(story)).toBe(false);
    });

    it('should return false when total_recovery_attempts is 9', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          total_recovery_attempts: 9,
        },
      };
      expect(isAtGlobalRecoveryLimit(story)).toBe(false);
    });

    it('should return true when total_recovery_attempts is 10', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          total_recovery_attempts: 10,
        },
      };
      expect(isAtGlobalRecoveryLimit(story)).toBe(true);
    });

    it('should return true when total_recovery_attempts is 15', () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          total_recovery_attempts: 15,
        },
      };
      expect(isAtGlobalRecoveryLimit(story)).toBe(true);
    });

    it('should return false when total_recovery_attempts is undefined', () => {
      expect(isAtGlobalRecoveryLimit(mockStory)).toBe(false);
    });
  });

  describe('incrementTotalRecoveryAttempts', () => {
    it('should increment from undefined to 1', async () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      const result = await incrementTotalRecoveryAttempts(story);
      expect(result.frontmatter.total_recovery_attempts).toBe(1);
    });

    it('should increment from 0 to 1', async () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          total_recovery_attempts: 0,
        },
      };
      const result = await incrementTotalRecoveryAttempts(story);
      expect(result.frontmatter.total_recovery_attempts).toBe(1);
    });

    it('should increment from 9 to 10', async () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          total_recovery_attempts: 9,
        },
      };
      const result = await incrementTotalRecoveryAttempts(story);
      expect(result.frontmatter.total_recovery_attempts).toBe(10);
    });

    it('should update the updated timestamp', async () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      const result = await incrementTotalRecoveryAttempts(story);
      expect(result.frontmatter.updated).toBeDefined();
    });

    it('should call writeStory (writeFileSync)', async () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      await incrementTotalRecoveryAttempts(story);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('resetTotalRecoveryAttempts', () => {
    it('should reset from 10 to 0', async () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          total_recovery_attempts: 10,
        },
      };
      const result = await resetTotalRecoveryAttempts(story);
      expect(result.frontmatter.total_recovery_attempts).toBe(0);
    });

    it('should reset from undefined to 0', async () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      const result = await resetTotalRecoveryAttempts(story);
      expect(result.frontmatter.total_recovery_attempts).toBe(0);
    });

    it('should update the updated timestamp', async () => {
      const story = { ...mockStory, frontmatter: { ...mockStory.frontmatter } };
      const result = await resetTotalRecoveryAttempts(story);
      expect(result.frontmatter.updated).toBeDefined();
    });

    it('should call writeStory (writeFileSync)', async () => {
      const story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          total_recovery_attempts: 5,
        },
      };
      await resetTotalRecoveryAttempts(story);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });
});
