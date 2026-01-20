import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  createStory,
  parseStory,
  incrementImplementationRetryCount,
  resetImplementationRetryCount,
  isAtMaxImplementationRetries,
  updateStoryField,
} from '../../src/core/story.js';
import { loadConfig } from '../../src/core/config.js';

/**
 * Integration tests for preventing infinite RECOVERY loops (S-0114)
 *
 * These tests verify that the implementation retry count persists through
 * verification cycles until review approval, preventing the infinite loop
 * scenario described in S-0112.
 */
describe('RECOVERY Loop Prevention', () => {
  let testDir: string;
  let sdlcRoot: string;
  let storyPath: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-loop-test-'));
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
    const story = await createStory('Test RECOVERY Loop Prevention', sdlcRoot, {
      type: 'feature',
      labels: ['test'],
    });

    storyPath = story.path;

    // Set story to in-progress with implementation complete
    story.frontmatter.status = 'in-progress';
    story.frontmatter.research_complete = true;
    story.frontmatter.plan_complete = true;
    story.frontmatter.implementation_complete = false;
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
implementation_complete: false
reviews_complete: false
labels:
  - test
---

# Test RECOVERY Loop Prevention

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

  describe('Retry count persistence through verification', () => {
    it('should persist retry count through implementation verification success', async () => {
      let story = parseStory(storyPath);

      // Start with retry count 0
      expect(story.frontmatter.implementation_retry_count).toBeUndefined();

      // Simulate RECOVERY cycle 1: increment retry count
      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(1);

      // Simulate implementation runs and verification passes
      await updateStoryField(story, 'implementation_complete', true);
      story = parseStory(storyPath);

      // CRITICAL: Retry count should still be 1 (NOT reset to 0)
      expect(story.frontmatter.implementation_retry_count).toBe(1);
      expect(story.frontmatter.implementation_complete).toBe(true);

      // Simulate review triggers RECOVERY again (no source code changes)
      await updateStoryField(story, 'implementation_complete', false);
      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);

      // Retry count should now be 2
      expect(story.frontmatter.implementation_retry_count).toBe(2);
    });

    it('should reset retry count only on review APPROVED', async () => {
      let story = parseStory(storyPath);

      // Simulate multiple RECOVERY cycles
      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(1);

      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(2);

      // Simulate review APPROVED - retry count should reset
      await resetImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(0);
    });
  });

  describe('Infinite loop prevention', () => {
    it('should prevent infinite RECOVERY loop by tracking retry count', async () => {
      let story = parseStory(storyPath);
      const config = loadConfig(testDir);

      // Simulate the S-0112 infinite loop scenario:
      // Implementation verification passes but no source code changes made

      // Cycle 1: RECOVERY increments count
      await incrementImplementationRetryCount(story);
      await updateStoryField(story, 'implementation_complete', true);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(1);
      expect(isAtMaxImplementationRetries(story, config)).toBe(false);

      // Cycle 2: RECOVERY increments count again
      await updateStoryField(story, 'implementation_complete', false);
      await incrementImplementationRetryCount(story);
      await updateStoryField(story, 'implementation_complete', true);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(2);
      expect(isAtMaxImplementationRetries(story, config)).toBe(false);

      // Cycle 3: RECOVERY increments count again
      await updateStoryField(story, 'implementation_complete', false);
      await incrementImplementationRetryCount(story);
      await updateStoryField(story, 'implementation_complete', true);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(3);
      expect(isAtMaxImplementationRetries(story, config)).toBe(false);

      // Cycle 4: Max retries exceeded - should trigger FAILED decision
      await updateStoryField(story, 'implementation_complete', false);
      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(4);
      expect(isAtMaxImplementationRetries(story, config)).toBe(true);

      // Story should now be blocked (would be done by review agent)
      // Verify that we can detect this condition
      expect(story.frontmatter.implementation_retry_count).toBeGreaterThan(config.implementation.maxRetries);
    });

    it('should not accumulate 84+ implement actions like S-0112', async () => {
      let story = parseStory(storyPath);
      const config = loadConfig(testDir);
      let implementActionCount = 0;

      // Simulate implementation attempts with retry count tracking
      for (let i = 0; i < 10; i++) {
        implementActionCount++;

        // Check if we've exceeded max retries
        if (isAtMaxImplementationRetries(story, config)) {
          // Should stop here - story is blocked
          break;
        }

        // Simulate RECOVERY cycle
        await updateStoryField(story, 'implementation_complete', false);
        await incrementImplementationRetryCount(story);
        await updateStoryField(story, 'implementation_complete', true);
        story = parseStory(storyPath);
      }

      // Should stop after max retries (3) + 1 attempt = 4 total attempts
      expect(implementActionCount).toBeLessThanOrEqual(5);
      expect(implementActionCount).not.toBe(10); // Didn't run all 10 iterations

      // Final retry count should be at max
      expect(story.frontmatter.implementation_retry_count).toBeGreaterThan(config.implementation.maxRetries);
    });
  });

  describe('Review decision integration', () => {
    it('should handle full cycle: implement → verify → review RECOVERY → blocked', async () => {
      let story = parseStory(storyPath);
      const config = loadConfig(testDir);

      // Initial state
      expect(story.frontmatter.implementation_retry_count).toBeUndefined();

      // Attempt 1: Implementation succeeds, review triggers RECOVERY
      await updateStoryField(story, 'implementation_complete', true);
      await incrementImplementationRetryCount(story); // Review triggers RECOVERY
      await updateStoryField(story, 'implementation_complete', false);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(1);

      // Attempt 2: Implementation succeeds, review triggers RECOVERY
      await updateStoryField(story, 'implementation_complete', true);
      await incrementImplementationRetryCount(story);
      await updateStoryField(story, 'implementation_complete', false);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(2);

      // Attempt 3: Implementation succeeds, review triggers RECOVERY
      await updateStoryField(story, 'implementation_complete', true);
      await incrementImplementationRetryCount(story);
      await updateStoryField(story, 'implementation_complete', false);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(3);

      // Attempt 4: Max retries exceeded, review should return FAILED
      await updateStoryField(story, 'implementation_complete', true);
      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(4);
      expect(isAtMaxImplementationRetries(story, config)).toBe(true);

      // Story should be blocked at this point (by review agent returning FAILED)
      expect(story.frontmatter.implementation_retry_count).toBe(4);
    });

    it('should reset retry count only on APPROVED, not on RECOVERY', async () => {
      let story = parseStory(storyPath);

      // Increment retry count
      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(1);

      // Simulate RECOVERY decision - count should persist
      await updateStoryField(story, 'implementation_complete', false);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(1);

      // Another RECOVERY cycle
      await incrementImplementationRetryCount(story);
      await updateStoryField(story, 'implementation_complete', true);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(2);

      // Now simulate APPROVED decision - count should reset
      await resetImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle first implementation attempt with retry count 0', async () => {
      const story = parseStory(storyPath);
      const config = loadConfig(testDir);

      // First attempt should have no retry count
      expect(story.frontmatter.implementation_retry_count).toBeUndefined();
      expect(isAtMaxImplementationRetries(story, config)).toBe(false);

      // Should be able to proceed with implementation
      await updateStoryField(story, 'implementation_complete', true);
      const updatedStory = parseStory(storyPath);
      expect(updatedStory.frontmatter.implementation_complete).toBe(true);
    });

    it('should respect per-story max_implementation_retries override', async () => {
      // Set per-story override
      const storyContent = fs.readFileSync(storyPath, 'utf-8');
      const updatedContent = storyContent.replace(
        'implementation_complete: false',
        'implementation_complete: false\nmax_implementation_retries: 1'
      );
      fs.writeFileSync(storyPath, updatedContent);

      let story = parseStory(storyPath);
      const config = loadConfig(testDir);

      // Should allow 1 retry (2 total attempts)
      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(1);
      expect(isAtMaxImplementationRetries(story, config)).toBe(false);

      // Second retry should exceed limit
      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(2);
      expect(isAtMaxImplementationRetries(story, config)).toBe(true);
    });

    it('should handle mixed RECOVERY and APPROVED results', async () => {
      let story = parseStory(storyPath);

      // RECOVERY cycle 1
      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(1);

      // RECOVERY cycle 2
      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(2);

      // APPROVED - reset count
      await resetImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(0);

      // New story starts fresh
      await incrementImplementationRetryCount(story);
      story = parseStory(storyPath);
      expect(story.frontmatter.implementation_retry_count).toBe(1);
    });

    it('should handle various maxRetries values (1, 3, 5)', async () => {
      const config = loadConfig(testDir);
      const testValues = [1, 3, 5];

      for (const maxRetries of testValues) {
        // Update config
        config.implementation.maxRetries = maxRetries;

        let story = parseStory(storyPath);

        // Reset for each test
        await resetImplementationRetryCount(story);

        // Increment to just under max
        for (let i = 0; i < maxRetries; i++) {
          await incrementImplementationRetryCount(parseStory(storyPath));
        }

        story = parseStory(storyPath);
        expect(story.frontmatter.implementation_retry_count).toBe(maxRetries);
        expect(isAtMaxImplementationRetries(story, config)).toBe(false);

        // One more should exceed
        await incrementImplementationRetryCount(story);
        story = parseStory(storyPath);
        expect(isAtMaxImplementationRetries(story, config)).toBe(true);
      }
    });
  });
});
