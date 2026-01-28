import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createStory, getStory, updateStoryStatus, markStoryComplete } from '../../src/core/story.js';
import { STORIES_FOLDER } from '../../src/types/index.js';

// Use describe.sequential to prevent race conditions with shared testDir variable
// and temp directory cleanup between tests
describe.sequential('Story Lookup After Move Integration', () => {
  let testDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-'));
    sdlcRoot = path.join(testDir, '.ai-sdlc');

    // Create SDLC folder structure
    fs.mkdirSync(sdlcRoot, { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should find story by ID after status changes from backlog → in-progress → done', async () => {
    // Create story in backlog
    const story = await createStory('Test Story for Lookup', sdlcRoot);
    const storyId = story.frontmatter.id;

    // Act 1: Lookup in backlog status
    const story1 = getStory(sdlcRoot, storyId);
    expect(story1.frontmatter.id).toBe(storyId);
    expect(story1.frontmatter.status).toBe('backlog');
    expect(story1.path).toBe(story.path); // Same path (folder-per-story)

    // Change status to in-progress
    await updateStoryStatus(story1, 'in-progress');

    // Act 2: Lookup after status change to in-progress
    const story2 = getStory(sdlcRoot, storyId);
    expect(story2.frontmatter.id).toBe(storyId);
    expect(story2.frontmatter.status).toBe('in-progress');
    expect(story2.path).toBe(story.path); // Still same path (no file move)

    // Change status to done (must set completion flags first due to validation)
    await markStoryComplete(story2);
    await updateStoryStatus(story2, 'done');

    // Act 3: Lookup after status change to done
    const story3 = getStory(sdlcRoot, storyId);
    expect(story3.frontmatter.id).toBe(storyId);
    expect(story3.frontmatter.status).toBe('done');
    expect(story3.path).toBe(story.path); // Still same path (no file move)
  });

  it('should find story by ID regardless of current status', async () => {
    // Create multiple stories with different statuses
    const story1 = await createStory('Story 1', sdlcRoot);
    const story2 = await createStory('Story 2', sdlcRoot);
    const story3 = await createStory('Story 3', sdlcRoot);

    await updateStoryStatus(story1, 'ready');
    await updateStoryStatus(story2, 'in-progress');
    await markStoryComplete(story3); // Must set completion flags before 'done'
    await updateStoryStatus(story3, 'done');

    // All stories should be findable by ID
    const found1 = getStory(sdlcRoot, story1.frontmatter.id);
    const found2 = getStory(sdlcRoot, story2.frontmatter.id);
    const found3 = getStory(sdlcRoot, story3.frontmatter.id);

    expect(found1.frontmatter.status).toBe('ready');
    expect(found2.frontmatter.status).toBe('in-progress');
    expect(found3.frontmatter.status).toBe('done');
  });

  it('should throw descriptive error when story ID does not exist', () => {
    const nonexistentId = 'S-9999';

    expect(() => {
      getStory(sdlcRoot, nonexistentId);
    }).toThrow(`Story not found: ${nonexistentId}`);

    // Verify error message contains helpful information
    try {
      getStory(sdlcRoot, nonexistentId);
    } catch (error: any) {
      expect(error.message).toContain('Searched in:');
      expect(error.message).toContain('stories/S-9999');
      expect(error.message).toContain('may have been deleted or the ID is incorrect');
    }
  });

  it('should return story with correct metadata after status changes', async () => {
    const story = await createStory('Test Story', sdlcRoot);
    const storyId = story.frontmatter.id;

    // Change to in-progress and mark research complete
    story.frontmatter.research_complete = true;
    await updateStoryStatus(story, 'in-progress');

    // Lookup should return updated story
    const updatedStory = getStory(sdlcRoot, storyId);
    expect(updatedStory.frontmatter.research_complete).toBe(true);
    expect(updatedStory.frontmatter.status).toBe('in-progress');
    expect(updatedStory.frontmatter.id).toBe(storyId);
  });

  it('should handle concurrent lookups of same story', async () => {
    const story = await createStory('Concurrent Test Story', sdlcRoot);
    const storyId = story.frontmatter.id;

    // Simulate concurrent lookups (all should succeed)
    const lookup1 = getStory(sdlcRoot, storyId);
    const lookup2 = getStory(sdlcRoot, storyId);
    const lookup3 = getStory(sdlcRoot, storyId);

    expect(lookup1.frontmatter.id).toBe(storyId);
    expect(lookup2.frontmatter.id).toBe(storyId);
    expect(lookup3.frontmatter.id).toBe(storyId);

    // All should have same path
    expect(lookup1.path).toBe(lookup2.path);
    expect(lookup2.path).toBe(lookup3.path);
  });
});
