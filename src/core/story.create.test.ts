import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { moveToBlocked, parseStory, sanitizeReasonText, unblockStory, getStory, writeStory, findStoryById, sanitizeTitle, extractTitleFromContent, createStory, autoCompleteStoryAfterReview } from './story.js';
import { BLOCKED_DIR, ReviewDecision, ReviewResult, Config } from '../types/index.js';

describe('createStory with custom content', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-16T12:00:00Z'));

    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-')));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });

    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create story with custom content', async () => {
    const customContent = '# Custom Story\n\nThis is custom content from a file.';
    const story = await createStory('Custom Title', sdlcRoot, {}, customContent);

    expect(story.content).toBe(customContent);
    expect(story.frontmatter.title).toBe('Custom Title');
  });

  it('should create story with default template when no content provided', async () => {
    const story = await createStory('Default Title', sdlcRoot);

    expect(story.content).toContain('# Default Title');
    expect(story.content).toContain('## Summary');
    expect(story.content).toContain('## Acceptance Criteria');
  });

  it('should strip script tags from custom content', async () => {
    const maliciousContent = '# Title\n\n<script>alert("xss")</script>\n\nContent';
    const story = await createStory('Test', sdlcRoot, {}, maliciousContent);

    expect(story.content).not.toContain('<script>');
    expect(story.content).not.toContain('alert');
    expect(story.content).toContain('# Title');
    expect(story.content).toContain('Content');
  });

  it('should strip iframe tags from custom content', async () => {
    const maliciousContent = '# Title\n\n<iframe src="evil.com"></iframe>\n\nContent';
    const story = await createStory('Test', sdlcRoot, {}, maliciousContent);

    expect(story.content).not.toContain('<iframe');
    expect(story.content).toContain('# Title');
    expect(story.content).toContain('Content');
  });

  it('should preserve frontmatter structure with custom content', async () => {
    const customContent = '# Custom\n\nCustom content here.';
    const story = await createStory('Title', sdlcRoot, {}, customContent);

    // Verify frontmatter is still present in the written file
    const fileContent = fs.readFileSync(story.path, 'utf-8');
    expect(fileContent).toContain('---');
    expect(fileContent).toContain('title: Title');
    expect(fileContent).toContain('# Custom');
  });
});
describe('autoCompleteStoryAfterReview', () => {
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

  function createTestStory(slug: string): string {
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
status: in-progress
type: feature
created: '2024-01-01'
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: false
---

# Test Story ${slug}

This is a test story.
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

  it('should auto-complete story when review approved and autoCompleteOnApproval is true', async () => {
    // Mock date to ensure consistent timestamps
    const mockDate = new Date('2024-06-15T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);

    const storyPath = createTestStory('test-story-1');
    let story = parseStory(storyPath);
    const config = createMockConfig(true);
    const reviewResult = createMockReviewResult(ReviewDecision.APPROVED);

    // Before auto-completion
    expect(story.frontmatter.status).toBe('in-progress');
    expect(story.frontmatter.reviews_complete).toBe(false);

    // Auto-complete story
    story = await autoCompleteStoryAfterReview(story, config, reviewResult);

    // After auto-completion
    expect(story.frontmatter.status).toBe('done');
    expect(story.frontmatter.research_complete).toBe(true);
    expect(story.frontmatter.plan_complete).toBe(true);
    expect(story.frontmatter.implementation_complete).toBe(true);
    expect(story.frontmatter.reviews_complete).toBe(true);
    expect(story.frontmatter.updated).toBe('2024-06-15');

    // Verify file was updated
    const updatedStory = parseStory(storyPath);
    expect(updatedStory.frontmatter.status).toBe('done');
    expect(updatedStory.frontmatter.reviews_complete).toBe(true);
  });

  it('should not auto-complete when autoCompleteOnApproval is false', async () => {
    const storyPath = createTestStory('test-story-2');
    let story = parseStory(storyPath);
    const config = createMockConfig(false);
    const reviewResult = createMockReviewResult(ReviewDecision.APPROVED);

    // Before auto-completion
    expect(story.frontmatter.status).toBe('in-progress');
    expect(story.frontmatter.reviews_complete).toBe(false);

    // Try to auto-complete (should not happen)
    story = await autoCompleteStoryAfterReview(story, config, reviewResult);

    // Status should remain unchanged
    expect(story.frontmatter.status).toBe('in-progress');
    expect(story.frontmatter.reviews_complete).toBe(false);
  });

  it('should not auto-complete when review is rejected', async () => {
    const storyPath = createTestStory('test-story-3');
    let story = parseStory(storyPath);
    const config = createMockConfig(true);
    const reviewResult = createMockReviewResult(ReviewDecision.REJECTED);

    // Before auto-completion
    expect(story.frontmatter.status).toBe('in-progress');
    expect(story.frontmatter.reviews_complete).toBe(false);

    // Try to auto-complete (should not happen)
    story = await autoCompleteStoryAfterReview(story, config, reviewResult);

    // Status should remain unchanged
    expect(story.frontmatter.status).toBe('in-progress');
    expect(story.frontmatter.reviews_complete).toBe(false);
  });

  it('should not auto-complete when review failed', async () => {
    const storyPath = createTestStory('test-story-4');
    let story = parseStory(storyPath);
    const config = createMockConfig(true);
    const reviewResult = createMockReviewResult(ReviewDecision.FAILED);

    // Before auto-completion
    expect(story.frontmatter.status).toBe('in-progress');

    // Try to auto-complete (should not happen)
    story = await autoCompleteStoryAfterReview(story, config, reviewResult);

    // Status should remain unchanged
    expect(story.frontmatter.status).toBe('in-progress');
  });

  it('should not change status when story is already done', async () => {
    const storyPath = createTestStory('test-story-5');
    let story = parseStory(storyPath);

    // Manually set story to done
    story.frontmatter.status = 'done';
    await writeStory(story);

    const config = createMockConfig(true);
    const reviewResult = createMockReviewResult(ReviewDecision.APPROVED);

    // Auto-complete story that's already done
    story = await autoCompleteStoryAfterReview(story, config, reviewResult);

    // Status should remain done
    expect(story.frontmatter.status).toBe('done');
    expect(story.frontmatter.reviews_complete).toBe(true);
  });

  it('should handle errors gracefully and return original story', async () => {
    const storyPath = createTestStory('test-story-6');
    const story = parseStory(storyPath);
    const config = createMockConfig(true);
    const reviewResult = createMockReviewResult(ReviewDecision.APPROVED);

    // Create an invalid path that will cause writeStory to fail
    story.path = '/nonexistent/directory/that/does/not/exist/story.md';

    // Mock console.error to capture error logs
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Try to auto-complete (should handle error gracefully since path doesn't exist)
    const result = await autoCompleteStoryAfterReview(story, config, reviewResult);

    // Should return story (error was logged but operation didn't fail)
    expect(result).toBeDefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to auto-complete story after review:', expect.any(Error));

    // Cleanup
    consoleErrorSpy.mockRestore();
  });
});
