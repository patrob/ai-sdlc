import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { assessState } from '../../src/core/kanban.js';
import { parseStory } from '../../src/core/story.js';
import { BLOCKED_DIR } from '../../src/types/index.js';

describe('Kanban - Block on Max Review Retries Integration', () => {
  let testDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-kanban-retries-'));
    sdlcRoot = path.join(testDir, '.ai-sdlc');

    // Create SDLC folder structure
    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, 'backlog'));
    fs.mkdirSync(path.join(sdlcRoot, 'ready'));
    fs.mkdirSync(path.join(sdlcRoot, 'in-progress'));
    fs.mkdirSync(path.join(sdlcRoot, 'done'));

    // Use fake timers for deterministic timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    // Restore real timers
    vi.useRealTimers();

    // Clean up temporary directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createConfigWithMaxRetries(maxRetries: number): void {
    const config = {
      sdlcFolder: '.ai-sdlc',
      refinement: {
        maxIterations: 5,
        escalateOnMaxAttempts: 'manual',
        enableCircuitBreaker: true,
      },
      reviewConfig: {
        maxRetries,
        maxRetriesUpperBound: Infinity,
        autoCompleteOnApproval: true,
        autoRestartOnRejection: true,
      },
      stageGates: {
        requireApprovalBeforeImplementation: false,
        requireApprovalBeforePR: false,
        autoMergeOnApproval: false,
      },
      defaultLabels: [],
      theme: 'auto',
    };
    fs.writeFileSync(
      path.join(testDir, '.ai-sdlc.json'),
      JSON.stringify(config, null, 2)
    );
  }

  function createStoryWithReviewRetries(
    slug: string,
    retryCount: number,
    maxRetries: number,
    reviewFeedback: string = 'Security vulnerabilities detected in authentication flow'
  ): string {
    const inProgressPath = path.join(sdlcRoot, 'in-progress');
    const filename = `01-${slug}.md`;
    const filePath = path.join(inProgressPath, filename);

    // Create review history with multiple rejections
    const reviewHistory = [];
    for (let i = 0; i < retryCount; i++) {
      reviewHistory.push({
        timestamp: `2024-01-${10 + i}T10:00:00Z`,
        decision: 'rejected',
        severity: 'blocker',
        feedback: `${reviewFeedback} (attempt ${i + 1})`,
        blockers: [
          `Security issue ${i + 1}`,
          `Code quality concern ${i + 1}`,
        ],
        codeReviewPassed: i % 2 === 0,
        securityReviewPassed: false,
        poReviewPassed: true,
      });
    }

    const content = `---
id: ${slug}
title: Test Story - ${slug}
priority: 1
status: in-progress
type: feature
created: '2024-01-01T00:00:00Z'
updated: '2024-01-15T11:00:00Z'
labels: ['testing', 'integration']
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: false
retry_count: ${retryCount}
max_retries: ${maxRetries}
review_history:
${reviewHistory.map(r => `  - timestamp: '${r.timestamp}'
    decision: ${r.decision}
    severity: ${r.severity}
    feedback: '${r.feedback}'
    blockers:
${r.blockers.map(b => `      - ${b}`).join('\n')}
    codeReviewPassed: ${r.codeReviewPassed}
    securityReviewPassed: ${r.securityReviewPassed}
    poReviewPassed: ${r.poReviewPassed}`).join('\n')}
---

# Test Story - ${slug}

## Implementation

This is a test story with ${retryCount} review rejections.

## Test Content

Some implementation details here.
`;

    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  it('should move story to blocked folder when max retries reached', () => {
    // Arrange
    createConfigWithMaxRetries(3);
    const originalPath = createStoryWithReviewRetries(
      'max-retries-story',
      3,
      3,
      'Failed security review multiple times'
    );

    // Verify story exists in in-progress
    expect(fs.existsSync(originalPath)).toBe(true);

    // Act
    assessState(sdlcRoot);

    // Assert
    // Story should be moved from in-progress
    expect(fs.existsSync(originalPath)).toBe(false);

    // Story should exist in blocked folder
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR);
    expect(fs.existsSync(blockedPath)).toBe(true);

    const blockedFiles = fs.readdirSync(blockedPath);
    expect(blockedFiles.length).toBe(1);
    expect(blockedFiles[0]).toContain('max-retries-story');
  });

  it('should preserve retry_count in frontmatter after blocking', () => {
    // Arrange
    createConfigWithMaxRetries(5);
    createStoryWithReviewRetries(
      'preserve-count-story',
      5,
      5,
      'Multiple review failures'
    );

    // Act
    assessState(sdlcRoot);

    // Assert
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR);
    const blockedFiles = fs.readdirSync(blockedPath);
    const blockedStoryPath = path.join(blockedPath, blockedFiles[0]);

    const blockedStory = parseStory(blockedStoryPath);

    // Verify retry_count is preserved
    expect(blockedStory.frontmatter.retry_count).toBe(5);
  });

  it('should set correct frontmatter fields after blocking', () => {
    // Arrange
    createConfigWithMaxRetries(2);
    createStoryWithReviewRetries(
      'frontmatter-check',
      2,
      2,
      'Code review and security review both failed'
    );

    // Act
    assessState(sdlcRoot);

    // Assert
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR);
    const blockedFiles = fs.readdirSync(blockedPath);
    const blockedStoryPath = path.join(blockedPath, blockedFiles[0]);

    const blockedStory = parseStory(blockedStoryPath);

    // Verify status is 'blocked'
    expect(blockedStory.frontmatter.status).toBe('blocked');

    // Verify blocked_reason contains retry counts
    expect(blockedStory.frontmatter.blocked_reason).toContain('Max review retries (2/2)');

    // Verify blocked_reason contains feedback summary
    expect(blockedStory.frontmatter.blocked_reason).toContain('last failure:');
    expect(blockedStory.frontmatter.blocked_reason).toContain('Code review and security review both failed');

    // Verify blocked_at timestamp exists
    expect(blockedStory.frontmatter.blocked_at).toBeDefined();
    expect(blockedStory.frontmatter.blocked_at).toBe('2024-01-15T12:00:00.000Z');

    // Verify updated timestamp
    expect(blockedStory.frontmatter.updated).toBeDefined();
  });

  it('should include feedback summary (first 100 chars) in blocked reason', () => {
    // Arrange
    createConfigWithMaxRetries(3);
    const longFeedback =
      'This implementation has multiple critical security vulnerabilities including SQL injection risks, ' +
      'improper input validation, missing authentication checks, and insufficient error handling. ' +
      'All of these issues must be addressed before the code can be approved.';

    createStoryWithReviewRetries(
      'long-feedback-story',
      3,
      3,
      longFeedback
    );

    // Act
    assessState(sdlcRoot);

    // Assert
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR);
    const blockedFiles = fs.readdirSync(blockedPath);
    const blockedStoryPath = path.join(blockedPath, blockedFiles[0]);

    const blockedStory = parseStory(blockedStoryPath);

    // Verify feedback is truncated to 100 chars
    expect(blockedStory.frontmatter.blocked_reason).toContain('last failure:');

    // The feedback should be truncated
    const reasonMatch = blockedStory.frontmatter.blocked_reason?.match(/last failure: (.+)/);
    expect(reasonMatch).toBeDefined();

    if (reasonMatch) {
      const feedbackPart = reasonMatch[1];
      // Should contain first 100 chars and include "(attempt 3)"
      expect(feedbackPart).toContain('This implementation has multiple critical security vulnerabilities including SQL injection');
      expect(feedbackPart.length).toBeLessThanOrEqual(120); // 100 chars + " (attempt 3)"
    }
  });

  it('should handle story with no review history', () => {
    // Arrange
    createConfigWithMaxRetries(1);

    // Create story without review_history
    const inProgressPath = path.join(sdlcRoot, 'in-progress');
    const filename = '01-no-history.md';
    const filePath = path.join(inProgressPath, filename);

    const content = `---
id: no-history
title: Story Without Review History
priority: 1
status: in-progress
type: feature
created: '2024-01-01T00:00:00Z'
updated: '2024-01-15T11:00:00Z'
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: false
retry_count: 1
max_retries: 1
---

# Story Without Review History

Implementation content.
`;

    fs.writeFileSync(filePath, content, 'utf-8');

    // Act
    assessState(sdlcRoot);

    // Assert
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR);
    const blockedFiles = fs.readdirSync(blockedPath);
    const blockedStoryPath = path.join(blockedPath, blockedFiles[0]);

    const blockedStory = parseStory(blockedStoryPath);

    // Should use "unknown" as fallback
    expect(blockedStory.frontmatter.blocked_reason).toContain('last failure: unknown');
  });

  it('should respect story-specific max_retries over config default', () => {
    // Arrange: Config says 5, but story overrides to 2
    createConfigWithMaxRetries(5);
    createStoryWithReviewRetries(
      'override-story',
      2,
      2, // Story-specific override
      'Story-specific limit reached'
    );

    // Act
    assessState(sdlcRoot);

    // Assert
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR);
    const blockedFiles = fs.readdirSync(blockedPath);
    expect(blockedFiles.length).toBe(1);

    const blockedStoryPath = path.join(blockedPath, blockedFiles[0]);
    const blockedStory = parseStory(blockedStoryPath);

    // Should show (2/2) not (2/5)
    expect(blockedStory.frontmatter.blocked_reason).toContain('(2/2)');
  });

  it('should not block stories below max retries', () => {
    // Arrange
    createConfigWithMaxRetries(5);
    const originalPath = createStoryWithReviewRetries(
      'below-max-story',
      3, // Only 3 retries
      5, // Max is 5
      'Still has retries remaining'
    );

    // Act
    const result = assessState(sdlcRoot);

    // Assert
    // Story should still be in in-progress
    expect(fs.existsSync(originalPath)).toBe(true);

    // Should not be in blocked
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR);
    if (fs.existsSync(blockedPath)) {
      const blockedFiles = fs.readdirSync(blockedPath);
      expect(blockedFiles.length).toBe(0);
    }

    // Should have a review action recommended
    expect(result.recommendedActions.some(a => a.type === 'review')).toBe(true);
  });

  it('should handle concurrent file modifications gracefully', () => {
    // Arrange
    createConfigWithMaxRetries(2);
    const originalPath = createStoryWithReviewRetries(
      'concurrent-story',
      2,
      2,
      'Concurrent modification test'
    );

    // Delete the file before assessState processes it (simulate race condition)
    // This is tricky to test since we can't easily intercept mid-execution,
    // so we'll just verify that if the file doesn't exist, we don't crash

    // Act & Assert - should not throw
    expect(() => {
      // Delete file to simulate concurrent modification
      fs.unlinkSync(originalPath);
      assessState(sdlcRoot);
    }).not.toThrow();
  });

  it('should block multiple stories that reach max retries', () => {
    // Arrange
    createConfigWithMaxRetries(3);
    createStoryWithReviewRetries('story-one', 3, 3, 'First story failure');
    createStoryWithReviewRetries('story-two', 3, 3, 'Second story failure');
    createStoryWithReviewRetries('story-three', 3, 3, 'Third story failure');

    // Act
    assessState(sdlcRoot);

    // Assert
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR);
    const blockedFiles = fs.readdirSync(blockedPath);

    expect(blockedFiles.length).toBe(3);
    expect(blockedFiles.some(f => f.includes('story-one'))).toBe(true);
    expect(blockedFiles.some(f => f.includes('story-two'))).toBe(true);
    expect(blockedFiles.some(f => f.includes('story-three'))).toBe(true);
  });

  it('should preserve all original frontmatter fields after blocking', () => {
    // Arrange
    createConfigWithMaxRetries(2);
    createStoryWithReviewRetries(
      'preserve-all-fields',
      2,
      2,
      'Testing field preservation'
    );

    // Act
    assessState(sdlcRoot);

    // Assert
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR);
    const blockedFiles = fs.readdirSync(blockedPath);
    const blockedStoryPath = path.join(blockedPath, blockedFiles[0]);

    const blockedStory = parseStory(blockedStoryPath);

    // Verify all important fields are preserved
    expect(blockedStory.frontmatter.id).toBe('preserve-all-fields');
    expect(blockedStory.frontmatter.title).toBe('Test Story - preserve-all-fields');
    expect(blockedStory.frontmatter.priority).toBe(1);
    expect(blockedStory.frontmatter.type).toBe('feature');
    expect(blockedStory.frontmatter.research_complete).toBe(true);
    expect(blockedStory.frontmatter.plan_complete).toBe(true);
    expect(blockedStory.frontmatter.implementation_complete).toBe(true);
    expect(blockedStory.frontmatter.reviews_complete).toBe(false);
    expect(blockedStory.frontmatter.retry_count).toBe(2);
    expect(blockedStory.frontmatter.max_retries).toBe(2);
    expect(blockedStory.frontmatter.labels).toEqual(['testing', 'integration']);
    expect(blockedStory.frontmatter.review_history).toBeDefined();
    expect(blockedStory.frontmatter.review_history?.length).toBe(2);
  });
});
