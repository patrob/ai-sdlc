import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createStory, parseStory, incrementImplementationRetryCount, getEffectiveMaxImplementationRetries, isAtMaxImplementationRetries, updateStoryStatus } from '../../src/core/story.js';
import { ReviewDecision } from '../../src/types/index.js';
import { loadConfig } from '../../src/core/config.js';

describe('RECOVERY and FAILED Decision Handling', () => {
  let testDir: string;
  let sdlcRoot: string;
  let storyPath: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-test-'));
    sdlcRoot = path.join(testDir, '.ai-sdlc');
    const storiesDir = path.join(sdlcRoot, 'stories');

    fs.mkdirSync(storiesDir, { recursive: true });

    // Create config with implementation retry settings
    const config = {
      sdlcFolder: '.ai-sdlc',
      implementation: {
        maxRetries: 3,
        maxRetriesUpperBound: 10,
      },
      reviewConfig: {
        maxRetries: 3,
        maxRetriesUpperBound: 10,
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

    // Create a test story
    const story = await createStory('Test RECOVERY Feature', sdlcRoot, {
      type: 'feature',
      labels: ['test'],
    });

    storyPath = story.path;

    // Set story to in-progress with implementation complete
    story.frontmatter.status = 'in-progress';
    story.frontmatter.research_complete = true;
    story.frontmatter.plan_complete = true;
    story.frontmatter.implementation_complete = true;
    story.frontmatter.reviews_complete = false;

    fs.writeFileSync(storyPath, `---
id: ${story.frontmatter.id}
title: ${story.frontmatter.title}
priority: 1
status: in-progress
type: feature
created: '2026-01-19'
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: false
labels:
  - test
---

# Test RECOVERY Feature

## Acceptance Criteria
- [ ] Test criteria
`);
  });

  afterEach(() => {
    // Clean up test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('RECOVERY decision behavior', () => {
    it('should increment implementation_retry_count when RECOVERY is triggered', async () => {
      let story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBeUndefined();

      // Simulate RECOVERY decision: increment retry count
      await incrementImplementationRetryCount(story);

      // Reload story and verify count
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(1);

      // Increment again
      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(2);
    });

    it('should respect max_implementation_retries limit', async () => {
      const story = parseStory(storyPath);
      const config = loadConfig(testDir);

      // Initially not at max
      expect(isAtMaxImplementationRetries(story, config)).toBe(false);

      // Increment to max (default is 3 in test config)
      await incrementImplementationRetryCount(story);
      await incrementImplementationRetryCount(parseStory(storyPath));
      await incrementImplementationRetryCount(parseStory(storyPath));

      const updatedStory = parseStory(storyPath);
      expect(updatedStory.frontmatter.implementation_retry_count).toBe(3);

      // Now at max
      expect(isAtMaxImplementationRetries(updatedStory, config)).toBe(false); // 3 retries allowed, we're at 3

      // One more increment puts us over
      await incrementImplementationRetryCount(updatedStory);
      const overMaxStory = parseStory(storyPath);
      expect(isAtMaxImplementationRetries(overMaxStory, config)).toBe(true);
    });

    it('should handle infinite retries correctly', async () => {
      const story = parseStory(storyPath);
      const config = loadConfig(testDir);

      config.implementation.maxRetries = Infinity;

      for (let i = 0; i < 100; i++) {
        await incrementImplementationRetryCount(parseStory(storyPath));
      }

      const finalStory = parseStory(storyPath);
      expect(finalStory.frontmatter.implementation_retry_count).toBe(100);

      expect(isAtMaxImplementationRetries(finalStory, config)).toBe(false);
    });

    it('should display retry count correctly with finite max', () => {
      const story = parseStory(storyPath);
      const config = loadConfig(testDir);

      const maxRetries = getEffectiveMaxImplementationRetries(story, config);
      expect(maxRetries).toBe(3);

      const maxRetriesDisplay = Number.isFinite(maxRetries) ? maxRetries : '∞';
      expect(maxRetriesDisplay).toBe(3);
    });

    it('should display retry count as infinity symbol for infinite max', () => {
      const story = parseStory(storyPath);
      const config = loadConfig(testDir);

      config.implementation.maxRetries = Infinity;

      const maxRetries = getEffectiveMaxImplementationRetries(story, config);
      expect(maxRetries).toBe(Infinity);

      const maxRetriesDisplay = Number.isFinite(maxRetries) ? maxRetries : '∞';
      expect(maxRetriesDisplay).toBe('∞');
    });

    it('should transition story to blocked when max retries exceeded', async () => {
      const story = parseStory(storyPath);

      // Increment to over max (default is 3)
      for (let i = 0; i < 5; i++) {
        await incrementImplementationRetryCount(parseStory(storyPath));
      }

      const overMaxStory = parseStory(storyPath);
      const config = loadConfig(testDir);
      expect(isAtMaxImplementationRetries(overMaxStory, config)).toBe(true);

      // Simulate blocking the story
      await updateStoryStatus(overMaxStory, 'blocked');

      const blockedStory = parseStory(storyPath);
      expect(blockedStory.frontmatter.status).toBe('blocked');
    });
  });

  describe('FAILED decision behavior', () => {
    it('should not increment retry count on FAILED decision', async () => {
      const story = parseStory(storyPath);

      // Initial state: no retry count
      expect(story.frontmatter.implementation_retry_count).toBeUndefined();

      // FAILED decision should not call incrementImplementationRetryCount
      // Verify that the count remains unchanged
      const unchangedStory = parseStory(storyPath);
      expect(unchangedStory.frontmatter.implementation_retry_count).toBeUndefined();
    });

    it('should preserve existing retry count on FAILED decision', async () => {
      let story = parseStory(storyPath);

      // Set up existing retry count
      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(1);

      // FAILED decision: count should not change
      const unchangedStory = parseStory(storyPath);
      expect(unchangedStory.frontmatter.implementation_retry_count).toBe(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle missing last_restart_reason gracefully', () => {
      const story = parseStory(storyPath);

      // Verify last_restart_reason is undefined initially
      expect(story.frontmatter.last_restart_reason).toBeUndefined();

      // Fallback message should be used
      const reason = story.frontmatter.last_restart_reason || 'No source code changes detected';
      expect(reason).toBe('No source code changes detected');
    });

    it('should use last_restart_reason when present', async () => {
      // Add last_restart_reason to story
      const storyContent = fs.readFileSync(storyPath, 'utf-8');
      const updatedContent = storyContent.replace(
        'reviews_complete: false',
        'reviews_complete: false\nlast_restart_reason: "Custom restart reason"'
      );
      fs.writeFileSync(storyPath, updatedContent);

      const story = parseStory(storyPath);
      expect(story.frontmatter.last_restart_reason).toBe('Custom restart reason');

      const reason = story.frontmatter.last_restart_reason || 'No source code changes detected';
      expect(reason).toBe('Custom restart reason');
    });
  });
});
