import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  createStory,
  parseStory,
  getTotalRecoveryAttempts,
  isAtGlobalRecoveryLimit,
  incrementTotalRecoveryAttempts,
  moveToBlocked,
  unblockStory,
  writeStory,
} from '../../src/core/story.js';
import { STORIES_FOLDER, STORY_FILENAME } from '../../src/types/index.js';

describe('Global Recovery Circuit Breaker Integration', () => {
  let tempDir: string;
  let sdlcRoot: string;
  let storiesFolder: string;

  beforeEach(() => {
    // Create temporary directory for tests
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-circuit-breaker-')));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    storiesFolder = path.join(sdlcRoot, STORIES_FOLDER);
    fs.mkdirSync(storiesFolder, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should block story when global recovery limit is reached', async () => {
    // Create a test story
    const story = await createStory('Test Circuit Breaker Story', sdlcRoot);

    // Increment recovery counter to 10 (the limit)
    let updatedStory = story;
    for (let i = 0; i < 10; i++) {
      updatedStory = await incrementTotalRecoveryAttempts(updatedStory);
    }

    // Verify we're at the limit
    expect(getTotalRecoveryAttempts(updatedStory)).toBe(10);
    expect(isAtGlobalRecoveryLimit(updatedStory)).toBe(true);

    // Block the story
    await moveToBlocked(updatedStory.path, 'Global recovery limit exceeded (10/10)');

    // Verify story is blocked
    const blockedStory = parseStory(updatedStory.path);
    expect(blockedStory.frontmatter.status).toBe('blocked');
    expect(blockedStory.frontmatter.blocked_reason).toContain('Global recovery limit exceeded');
  });

  it('should allow story to continue before reaching global limit', async () => {
    // Create a test story
    const story = await createStory('Test Before Limit Story', sdlcRoot);

    // Increment recovery counter to 9 (below the limit)
    let updatedStory = story;
    for (let i = 0; i < 9; i++) {
      updatedStory = await incrementTotalRecoveryAttempts(updatedStory);
    }

    // Verify we're below the limit
    expect(getTotalRecoveryAttempts(updatedStory)).toBe(9);
    expect(isAtGlobalRecoveryLimit(updatedStory)).toBe(false);
  });

  it('should reset global counter when unblocking with resetRetries option', async () => {
    // Create and block a story with high recovery count
    const story = await createStory('Test Unblock Reset Story', sdlcRoot);

    // Set recovery counter to 10 and block
    let updatedStory = story;
    for (let i = 0; i < 10; i++) {
      updatedStory = await incrementTotalRecoveryAttempts(updatedStory);
    }

    await moveToBlocked(updatedStory.path, 'Global recovery limit exceeded (10/10)');

    // Unblock with resetRetries
    const unblockedStory = await unblockStory(story.frontmatter.id, sdlcRoot, { resetRetries: true });

    // Verify counter is reset
    expect(getTotalRecoveryAttempts(unblockedStory)).toBe(0);
    expect(isAtGlobalRecoveryLimit(unblockedStory)).toBe(false);
    expect(unblockedStory.frontmatter.status).not.toBe('blocked');
  });

  it('should persist counter across story save/reload cycles', async () => {
    // Create a test story
    const story = await createStory('Test Persistence Story', sdlcRoot);

    // Increment counter to 5
    let updatedStory = story;
    for (let i = 0; i < 5; i++) {
      updatedStory = await incrementTotalRecoveryAttempts(updatedStory);
    }

    // Save the story
    await writeStory(updatedStory);

    // Reload the story from disk
    const reloadedStory = parseStory(updatedStory.path);

    // Verify counter persisted
    expect(getTotalRecoveryAttempts(reloadedStory)).toBe(5);
  });

  it('should handle stories without total_recovery_attempts field', async () => {
    // Create a story (new stories start with undefined counter)
    const story = await createStory('Test No Counter Story', sdlcRoot);

    // Verify it defaults to 0
    expect(getTotalRecoveryAttempts(story)).toBe(0);
    expect(isAtGlobalRecoveryLimit(story)).toBe(false);
  });

  it('should increment from undefined to 1 correctly', async () => {
    // Create a story
    const story = await createStory('Test First Increment Story', sdlcRoot);

    // Verify initial state
    expect(story.frontmatter.total_recovery_attempts).toBeUndefined();
    expect(getTotalRecoveryAttempts(story)).toBe(0);

    // Increment once
    const updatedStory = await incrementTotalRecoveryAttempts(story);

    // Verify increment worked
    expect(updatedStory.frontmatter.total_recovery_attempts).toBe(1);
    expect(getTotalRecoveryAttempts(updatedStory)).toBe(1);
  });
});
