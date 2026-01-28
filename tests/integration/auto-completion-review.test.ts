import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { autoCompleteStoryAfterReview, parseStory, writeStory } from '../../src/core/story.js';
import { ReviewDecision, ReviewResult, Config } from '../../src/types/index.js';

describe('Auto-completion after review approval - Integration', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary directory for tests
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-')));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
  });

  afterEach(() => {
    // Always restore real timers to prevent test pollution
    vi.useRealTimers();
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createTestStory(slug: string, status: 'backlog' | 'in-progress' | 'done' = 'in-progress'): string {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, slug);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');

    const content = `---
id: ${slug}
title: Test Story ${slug}
slug: ${slug}
priority: 1
status: ${status}
type: feature
created: '2024-01-01'
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: false
---

# Test Story ${slug}

This is a test story for integration testing.
`;

    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  function createMockConfig(autoCompleteOnApproval: boolean): Config {
    return {
      reviewConfig: {
        autoCompleteOnApproval,
        autoRestartOnRejection: false,
        maxRetries: 3,
        enableCodeReview: true,
        enableSecurityReview: true,
        enableProductOwnerReview: false,
        issueThreshold: {
          critical: 0,
          high: 0,
          medium: 5,
          low: Infinity,
        },
      },
    } as Config;
  }

  function createMockReviewResult(decision: ReviewDecision): ReviewResult {
    return {
      success: true,
      passed: decision === ReviewDecision.APPROVED,
      decision,
      reviewType: 'combined',
      issues: [],
      feedback: 'Test feedback',
      story: {} as any, // Mock story (not used in auto-completion logic)
      changesMade: [],
    };
  }

  describe('End-to-end auto-completion flow', () => {
    it('should auto-complete story from in-progress to done after approved review', async () => {
      // Mock date for consistent timestamps
      const mockDate = new Date('2024-06-15T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      const storyPath = createTestStory('E2E-001', 'in-progress');
      const config = createMockConfig(true);
      const reviewResult = createMockReviewResult(ReviewDecision.APPROVED);

      // Initial state
      let story = parseStory(storyPath);
      expect(story.frontmatter.status).toBe('in-progress');
      expect(story.frontmatter.reviews_complete).toBe(false);

      // Simulate review approval with auto-completion
      story = await autoCompleteStoryAfterReview(story, config, reviewResult);

      // Final state
      expect(story.frontmatter.status).toBe('done');
      expect(story.frontmatter.research_complete).toBe(true);
      expect(story.frontmatter.plan_complete).toBe(true);
      expect(story.frontmatter.implementation_complete).toBe(true);
      expect(story.frontmatter.reviews_complete).toBe(true);
      expect(story.frontmatter.updated).toBe('2024-06-15');

      // Verify file persistence
      const persistedStory = parseStory(storyPath);
      expect(persistedStory.frontmatter.status).toBe('done');
      expect(persistedStory.frontmatter.reviews_complete).toBe(true);
    });

    it('should not auto-complete when autoCompleteOnApproval config is disabled', async () => {
      const storyPath = createTestStory('E2E-002', 'in-progress');
      const config = createMockConfig(false);
      const reviewResult = createMockReviewResult(ReviewDecision.APPROVED);

      // Initial state
      let story = parseStory(storyPath);
      expect(story.frontmatter.status).toBe('in-progress');

      // Simulate review approval WITHOUT auto-completion
      story = await autoCompleteStoryAfterReview(story, config, reviewResult);

      // Status should remain unchanged
      expect(story.frontmatter.status).toBe('in-progress');
      expect(story.frontmatter.reviews_complete).toBe(false);

      // Verify file was not modified
      const persistedStory = parseStory(storyPath);
      expect(persistedStory.frontmatter.status).toBe('in-progress');
      expect(persistedStory.frontmatter.reviews_complete).toBe(false);
    });

    it('should not auto-complete when review is rejected', async () => {
      const storyPath = createTestStory('E2E-003', 'in-progress');
      const config = createMockConfig(true);
      const reviewResult = createMockReviewResult(ReviewDecision.REJECTED);

      // Initial state
      let story = parseStory(storyPath);
      expect(story.frontmatter.status).toBe('in-progress');

      // Simulate review rejection
      story = await autoCompleteStoryAfterReview(story, config, reviewResult);

      // Status should remain unchanged
      expect(story.frontmatter.status).toBe('in-progress');
      expect(story.frontmatter.reviews_complete).toBe(false);
    });

    it('should handle review failure gracefully', async () => {
      const storyPath = createTestStory('E2E-004', 'in-progress');
      const config = createMockConfig(true);
      const reviewResult = createMockReviewResult(ReviewDecision.FAILED);

      // Initial state
      let story = parseStory(storyPath);
      expect(story.frontmatter.status).toBe('in-progress');

      // Simulate review failure
      story = await autoCompleteStoryAfterReview(story, config, reviewResult);

      // Status should remain unchanged
      expect(story.frontmatter.status).toBe('in-progress');
      expect(story.frontmatter.reviews_complete).toBe(false);
    });

    it('should preserve workflow flags when story already in done status', async () => {
      const storyPath = createTestStory('E2E-005', 'done');
      const config = createMockConfig(true);
      const reviewResult = createMockReviewResult(ReviewDecision.APPROVED);

      // Initial state
      let story = parseStory(storyPath);
      story.frontmatter.status = 'done';
      await writeStory(story);

      // Simulate review approval on already-done story
      story = await autoCompleteStoryAfterReview(story, config, reviewResult);

      // Status should remain done
      expect(story.frontmatter.status).toBe('done');
      expect(story.frontmatter.reviews_complete).toBe(true);
    });
  });

  describe('Backward compatibility', () => {
    it('should still allow manual move_to_done after auto-completion is disabled', async () => {
      const storyPath = createTestStory('BC-001', 'in-progress');
      const config = createMockConfig(false);
      const reviewResult = createMockReviewResult(ReviewDecision.APPROVED);

      // Review approved but auto-completion disabled
      let story = await autoCompleteStoryAfterReview(parseStory(storyPath), config, reviewResult);
      expect(story.frontmatter.status).toBe('in-progress');

      // Manually transition to done (simulating move_to_done action)
      // Note: Must set completion flags first due to status transition validation
      const { updateStoryStatus, markStoryComplete } = await import('../../src/core/story.js');
      story = await markStoryComplete(story);
      story = await updateStoryStatus(story, 'done');

      // Should successfully transition
      expect(story.frontmatter.status).toBe('done');

      // Verify persistence
      const persistedStory = parseStory(storyPath);
      expect(persistedStory.frontmatter.status).toBe('done');
    });
  });

  describe('Multiple workflow cycles', () => {
    it('should handle multiple review cycles correctly', async () => {
      // Mock date for consistent timestamps
      const mockDate = new Date('2024-06-15T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      const storyPath = createTestStory('MWC-001', 'in-progress');
      const config = createMockConfig(true);

      // First review: rejection
      let story = parseStory(storyPath);
      const rejectedResult = createMockReviewResult(ReviewDecision.REJECTED);
      story = await autoCompleteStoryAfterReview(story, config, rejectedResult);
      expect(story.frontmatter.status).toBe('in-progress');

      // Second review: approval
      const approvedResult = createMockReviewResult(ReviewDecision.APPROVED);
      story = await autoCompleteStoryAfterReview(story, config, approvedResult);
      expect(story.frontmatter.status).toBe('done');
      expect(story.frontmatter.reviews_complete).toBe(true);
    });
  });

  describe('Error scenarios', () => {
    it('should handle write errors gracefully', async () => {
      const storyPath = createTestStory('ERR-001', 'in-progress');
      const config = createMockConfig(true);
      const reviewResult = createMockReviewResult(ReviewDecision.APPROVED);

      let story = parseStory(storyPath);

      // Set an invalid path that will cause writeStory to fail
      story.path = '/nonexistent/directory/that/does/not/exist/story.md';

      // Mock console.error to capture error logs
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Should handle error gracefully (writeStory will fail because path doesn't exist)
      const result = await autoCompleteStoryAfterReview(story, config, reviewResult);

      // Should return story even though write failed
      expect(result).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to auto-complete story after review:', expect.any(Error));

      // Cleanup
      consoleErrorSpy.mockRestore();
    });
  });
});
