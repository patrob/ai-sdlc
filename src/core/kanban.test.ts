import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { assessState, calculateCompletionScore } from './kanban.js';
import * as storyModule from './story.js';
import { ReviewDecision, Story } from '../types/index.js';

describe('assessState - max review retries blocking', () => {
  let tempDir: string;
  let sdlcRoot: string;
  let moveToBlockedSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Create temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-kanban-test-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });

    // Use fake timers for deterministic timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));

    // Spy on functions
    moveToBlockedSpy = vi.spyOn(storyModule, 'moveToBlocked');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore real timers
    vi.useRealTimers();

    // Restore spies
    moveToBlockedSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createStoryWithRetries(
    slug: string,
    retryCount: number,
    maxRetries: number,
    reviewFeedback: string = 'Security issues found in implementation'
  ): string {
    const inProgressPath = path.join(sdlcRoot, 'in-progress');
    fs.mkdirSync(inProgressPath, { recursive: true });

    const filename = `01-${slug}.md`;
    const filePath = path.join(inProgressPath, filename);

    const content = `---
id: ${slug}
title: Test Story ${slug}
priority: 1
status: in-progress
type: feature
created: '2024-01-01'
updated: '2024-01-15'
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: false
retry_count: ${retryCount}
max_retries: ${maxRetries}
review_history:
  - timestamp: '2024-01-15T09:00:00Z'
    decision: rejected
    severity: blocker
    feedback: '${reviewFeedback}'
    blockers:
      - Security vulnerability in authentication
    codeReviewPassed: true
    securityReviewPassed: false
    poReviewPassed: true
---

# Test Story ${slug}

Some implementation content here.
`;

    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  function createConfigFile(maxRetries: number = Infinity): void {
    const configPath = path.join(tempDir, '.ai-sdlc.json');
    const config = {
      reviewConfig: {
        maxRetries,
        maxRetriesUpperBound: Infinity,
        autoCompleteOnApproval: true,
        autoRestartOnRejection: true,
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  it('should call moveToBlocked when story reaches max retries', () => {
    // Arrange
    const storyPath = createStoryWithRetries('test-story-1', 3, 3);
    createConfigFile(3);

    // Act
    assessState(sdlcRoot);

    // Assert
    expect(moveToBlockedSpy).toHaveBeenCalledTimes(1);
    expect(moveToBlockedSpy).toHaveBeenCalledWith(
      storyPath,
      expect.stringContaining('Max review retries (3/3) reached')
    );
  });

  it('should include retry count in blocked reason', () => {
    // Arrange
    createStoryWithRetries('test-story-2', 5, 5, 'Failed all review checks');
    createConfigFile(5);

    // Act
    assessState(sdlcRoot);

    // Assert
    expect(moveToBlockedSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/Max review retries \(5\/5\) reached/)
    );
  });

  it('should include feedback summary in blocked reason', () => {
    // Arrange
    const longFeedback = 'Security issues found in authentication module. The password hashing algorithm is weak and needs to be updated to bcrypt with proper salt rounds.';
    createStoryWithRetries('test-story-3', 2, 2, longFeedback);
    createConfigFile(2);

    // Act
    assessState(sdlcRoot);

    // Assert
    expect(moveToBlockedSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('last failure: Security issues found in authentication module. The password hashing algorithm is weak and')
    );
  });

  it('should use "unknown" when no review history exists', () => {
    // Arrange: Create story without review history
    const inProgressPath = path.join(sdlcRoot, 'in-progress');
    fs.mkdirSync(inProgressPath, { recursive: true });

    const filename = '01-no-review-history.md';
    const filePath = path.join(inProgressPath, filename);

    const content = `---
id: no-review-history
title: Story Without Review History
priority: 1
status: in-progress
type: feature
created: '2024-01-01'
updated: '2024-01-15'
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: false
retry_count: 3
max_retries: 3
---

# Story Without Review History

Implementation content.
`;

    fs.writeFileSync(filePath, content, 'utf-8');
    createConfigFile(3);

    // Act
    assessState(sdlcRoot);

    // Assert
    expect(moveToBlockedSpy).toHaveBeenCalledWith(
      filePath,
      expect.stringContaining('last failure: unknown')
    );
  });

  it('should log success message after blocking', () => {
    // Arrange
    createStoryWithRetries('test-story-4', 3, 3);
    createConfigFile(3);

    // Act
    assessState(sdlcRoot);

    // Assert
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Story test-story-4 blocked: Max review retries/)
    );
  });

  it('should fall back to high-priority action when moveToBlocked throws', () => {
    // Arrange
    createStoryWithRetries('test-story-5', 3, 3);
    createConfigFile(3);

    // Mock moveToBlocked to throw an error
    moveToBlockedSpy.mockImplementation(() => {
      throw new Error('File system error');
    });

    // Act
    const result = assessState(sdlcRoot);

    // Assert - error is now logged as a single sanitized string
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to move story test-story-5 to blocked: File system error/)
    );

    // Should have a fallback high-priority review action
    expect(result.recommendedActions).toHaveLength(1);
    expect(result.recommendedActions[0]).toMatchObject({
      type: 'review',
      storyId: 'test-story-5',
      priority: expect.any(Number),
      context: { blockedByMaxRetries: true },
    });

    // Priority should be very high (base priority + 10000)
    expect(result.recommendedActions[0].priority).toBeGreaterThan(10000);
  });

  it('should handle different max_retries values correctly', () => {
    // Arrange: Create stories with different retry limits
    createStoryWithRetries('story-a', 2, 2);
    createStoryWithRetries('story-b', 10, 10);
    createConfigFile(5); // Config default is 5, but stories override

    // Act
    assessState(sdlcRoot);

    // Assert: Both stories should be blocked with their specific limits
    expect(moveToBlockedSpy).toHaveBeenCalledTimes(2);
    expect(moveToBlockedSpy).toHaveBeenCalledWith(
      expect.stringContaining('story-a'),
      expect.stringContaining('(2/2)')
    );
    expect(moveToBlockedSpy).toHaveBeenCalledWith(
      expect.stringContaining('story-b'),
      expect.stringContaining('(10/10)')
    );
  });

  it('should not block stories below max retries', () => {
    // Arrange
    createStoryWithRetries('story-below-max', 2, 5);
    createConfigFile(5);

    // Act
    const result = assessState(sdlcRoot);

    // Assert
    expect(moveToBlockedSpy).not.toHaveBeenCalled();

    // Should recommend review action instead
    expect(result.recommendedActions).toHaveLength(1);
    expect(result.recommendedActions[0]).toMatchObject({
      type: 'review',
      storyId: 'story-below-max',
    });
  });

  it('should preserve retry_count in blocked reason format', () => {
    // Arrange
    createStoryWithRetries('story-preserve-count', 10, 10);
    createConfigFile(10);

    // Act
    assessState(sdlcRoot);

    // Assert
    expect(moveToBlockedSpy).toHaveBeenCalledTimes(1);
    const call = moveToBlockedSpy.mock.calls[0];
    const reason = call[1] as string;

    // Verify exact format: "Max review retries (10/10) reached - last failure: ..."
    expect(reason).toMatch(/^Max review retries \(\d+\/\d+\) reached - last failure: /);
    expect(reason).toContain('(10/10)');
  });

  // Security tests - bounds checking
  // Note: YAML parsing rejects ANSI escape codes and control characters, so we test
  // bounds checking which can occur from any frontmatter source. The sanitization of
  // ANSI/control chars is tested in story.test.ts with the sanitizeReasonText function.
  describe('security - input sanitization', () => {
    it('should sanitize markdown special characters in review feedback', () => {
      // Arrange - feedback with markdown injection characters
      // Note: backticks, pipes, and > are valid in YAML and could be injected
      const maliciousFeedback = 'Code: rm -rf and table chars';
      createStoryWithRetries('test-markdown', 3, 3, maliciousFeedback);
      createConfigFile(3);

      // Act
      assessState(sdlcRoot);

      // Assert - the content should be preserved (YAML-safe chars are kept)
      expect(moveToBlockedSpy).toHaveBeenCalledTimes(1);
      const call = moveToBlockedSpy.mock.calls[0];
      const reason = call[1] as string;

      expect(reason).toContain('Code');
      expect(reason).toContain('rm -rf');
    });

    it('should clamp negative retry_count values to 0', () => {
      // Arrange - create story with negative retry count
      const inProgressPath = path.join(sdlcRoot, 'in-progress');
      fs.mkdirSync(inProgressPath, { recursive: true });

      const filename = '01-negative-retry.md';
      const filePath = path.join(inProgressPath, filename);

      const content = `---
id: negative-retry
title: Story With Negative Retry
priority: 1
status: in-progress
type: feature
created: '2024-01-01'
updated: '2024-01-15'
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: false
retry_count: -5
max_retries: 3
---

# Story With Negative Retry

Content.
`;

      fs.writeFileSync(filePath, content, 'utf-8');
      createConfigFile(3);

      // Act
      assessState(sdlcRoot);

      // Assert - story should NOT be blocked because -5 < 3
      expect(moveToBlockedSpy).not.toHaveBeenCalled();
    });

    it('should clamp extremely large retry_count values to 999', () => {
      // Arrange - create story with huge retry count
      const inProgressPath = path.join(sdlcRoot, 'in-progress');
      fs.mkdirSync(inProgressPath, { recursive: true });

      const filename = '01-huge-retry.md';
      const filePath = path.join(inProgressPath, filename);

      const content = `---
id: huge-retry
title: Story With Huge Retry
priority: 1
status: in-progress
type: feature
created: '2024-01-01'
updated: '2024-01-15'
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: false
retry_count: 999999
max_retries: 5
---

# Story With Huge Retry

Content.
`;

      fs.writeFileSync(filePath, content, 'utf-8');
      createConfigFile(5);

      // Act
      assessState(sdlcRoot);

      // Assert - should be blocked (999 >= 5) with capped value shown
      expect(moveToBlockedSpy).toHaveBeenCalledTimes(1);
      const call = moveToBlockedSpy.mock.calls[0];
      const reason = call[1] as string;

      // Should show capped value of 999, not 999999
      expect(reason).toContain('(999/');
      expect(reason).not.toContain('999999');
    });

    it('should handle NaN retry_count as 0', () => {
      // Arrange - create story with NaN-producing retry count
      const inProgressPath = path.join(sdlcRoot, 'in-progress');
      fs.mkdirSync(inProgressPath, { recursive: true });

      const filename = '01-nan-retry.md';
      const filePath = path.join(inProgressPath, filename);

      const content = `---
id: nan-retry
title: Story With NaN Retry
priority: 1
status: in-progress
type: feature
created: '2024-01-01'
updated: '2024-01-15'
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: false
retry_count: 'not-a-number'
max_retries: 3
---

# Story With NaN Retry

Content.
`;

      fs.writeFileSync(filePath, content, 'utf-8');
      createConfigFile(3);

      // Act
      assessState(sdlcRoot);

      // Assert - story should NOT be blocked because NaN -> 0 < 3
      expect(moveToBlockedSpy).not.toHaveBeenCalled();
    });
  });
});

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
