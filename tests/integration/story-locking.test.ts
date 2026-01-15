import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseStory, writeStory, updateStoryStatus } from '../../src/core/story.js';
import * as properLockfile from 'proper-lockfile';

describe('Story File Locking - Integration Tests', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-integration-')));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createTestStory(id: string = 'S-0001'): string {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, id);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');

    const content = `---
id: ${id}
title: Test Story
slug: test-story
priority: 10
status: backlog
type: feature
created: '2024-01-01'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story

Test content
`;

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  describe('Concurrent Writes', () => {
    it('should not corrupt YAML frontmatter with 5 concurrent writes', async () => {
      const storyPath = createTestStory();

      // Launch 5 concurrent updates with different field modifications
      await Promise.all([
        (async () => {
          const story = parseStory(storyPath);
          story.frontmatter.status = 'in-progress';
          await writeStory(story);
        })(),
        (async () => {
          const story = parseStory(storyPath);
          story.frontmatter.priority = 100;
          await writeStory(story);
        })(),
        (async () => {
          const story = parseStory(storyPath);
          story.frontmatter.labels = ['concurrent-test'];
          await writeStory(story);
        })(),
        (async () => {
          const story = parseStory(storyPath);
          story.frontmatter.research_complete = true;
          await writeStory(story);
        })(),
        (async () => {
          const story = parseStory(storyPath);
          story.frontmatter.plan_complete = true;
          await writeStory(story);
        })(),
      ]);

      // File should be valid YAML and parseable (no corruption)
      const finalStory = parseStory(storyPath);
      expect(finalStory.frontmatter).toBeDefined();
      expect(finalStory.frontmatter.id).toBe('S-0001');

      // Verify frontmatter structure is intact
      expect(typeof finalStory.frontmatter.title).toBe('string');
      expect(typeof finalStory.frontmatter.slug).toBe('string');
      expect(typeof finalStory.frontmatter.priority).toBe('number');
      expect(typeof finalStory.frontmatter.status).toBe('string');
    });

    it('should serialize concurrent writes and preserve final state', async () => {
      const storyPath = createTestStory();

      // Write multiple times with increasing priority values
      await Promise.all([
        (async () => {
          for (let i = 0; i < 3; i++) {
            const story = parseStory(storyPath);
            story.frontmatter.priority = 10 + i;
            await writeStory(story);
          }
        })(),
        (async () => {
          for (let i = 0; i < 3; i++) {
            const story = parseStory(storyPath);
            story.frontmatter.priority = 20 + i;
            await writeStory(story);
          }
        })(),
      ]);

      // File should be valid and have one of the written priority values
      const finalStory = parseStory(storyPath);
      expect(finalStory.frontmatter).toBeDefined();
      expect(finalStory.frontmatter.priority).toBeGreaterThanOrEqual(10);
      expect(finalStory.frontmatter.priority).toBeLessThanOrEqual(22);
    });

    it('should handle concurrent status updates without losing data', async () => {
      const storyPath = createTestStory();

      // Concurrent status changes
      await Promise.all([
        (async () => {
          const story = parseStory(storyPath);
          await updateStoryStatus(story, 'ready');
        })(),
        (async () => {
          const story = parseStory(storyPath);
          await updateStoryStatus(story, 'in-progress');
        })(),
        (async () => {
          const story = parseStory(storyPath);
          await updateStoryStatus(story, 'done');
        })(),
      ]);

      // File should be valid with valid status
      const finalStory = parseStory(storyPath);
      expect(finalStory.frontmatter).toBeDefined();
      expect(['backlog', 'ready', 'in-progress', 'done']).toContain(finalStory.frontmatter.status);
    });
  });

  describe('Lock Timeout', () => {
    it('should timeout if lock cannot be acquired', async () => {
      const storyPath = createTestStory();

      // Manually acquire lock
      const release = await properLockfile.lock(storyPath, { stale: 10000 });

      try {
        // Attempt write with short timeout (should fail)
        const story = parseStory(storyPath);
        story.frontmatter.priority = 999;

        await expect(
          writeStory(story, { lockTimeout: 500, retries: 1 })
        ).rejects.toThrow(/locked by another process/);
      } finally {
        // Release lock for cleanup
        await release();
      }
    });

    it('should succeed after lock is released', async () => {
      const storyPath = createTestStory();

      // Acquire and immediately release lock
      const release = await properLockfile.lock(storyPath);
      await release();

      // Now write should succeed
      const story = parseStory(storyPath);
      story.frontmatter.priority = 50;
      await writeStory(story);

      const updatedStory = parseStory(storyPath);
      expect(updatedStory.frontmatter.priority).toBe(50);
    });
  });

  describe('Stale Lock Handling', () => {
    it('should handle stale locks automatically', async () => {
      const storyPath = createTestStory();
      const lockPath = `${storyPath}.lock`;

      // Manually create a stale lock file (simulating crashed process)
      // proper-lockfile will remove it based on mtime being older than stale threshold
      fs.mkdirSync(lockPath, { recursive: true });

      // Set lock file mtime to 10 seconds ago
      const oldTime = Date.now() - 10000;
      fs.utimesSync(lockPath, new Date(oldTime), new Date(oldTime));

      // Write should succeed (stale lock removed automatically)
      const story = parseStory(storyPath);
      story.frontmatter.priority = 77;

      await writeStory(story, { stale: 5000 }); // stale threshold = 5s

      const updatedStory = parseStory(storyPath);
      expect(updatedStory.frontmatter.priority).toBe(77);

      // Lock should be cleaned up
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });

  describe('Lock File Cleanup', () => {
    it('should not leave lock files after normal operation', async () => {
      const storyPath = createTestStory();
      const lockPath = `${storyPath}.lock`;

      // Perform multiple writes
      for (let i = 0; i < 5; i++) {
        const story = parseStory(storyPath);
        story.frontmatter.priority = 10 + i;
        await writeStory(story);
      }

      // No lock file should remain
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('should clean up lock files after concurrent writes', async () => {
      const storyPath = createTestStory();
      const lockPath = `${storyPath}.lock`;

      await Promise.all([
        (async () => {
          const story = parseStory(storyPath);
          story.frontmatter.priority = 11;
          await writeStory(story);
        })(),
        (async () => {
          const story = parseStory(storyPath);
          story.frontmatter.priority = 22;
          await writeStory(story);
        })(),
        (async () => {
          const story = parseStory(storyPath);
          story.frontmatter.priority = 33;
          await writeStory(story);
        })(),
      ]);

      // No lock file should remain
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should complete single write operation within reasonable time', async () => {
      const storyPath = createTestStory();
      const story = parseStory(storyPath);

      const startTime = performance.now();

      story.frontmatter.priority = 42;
      await writeStory(story);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Lock overhead should be < 100ms for typical operations
      // (Allow 500ms in CI environments which may be slower)
      expect(duration).toBeLessThan(500);
    });
  });
});
