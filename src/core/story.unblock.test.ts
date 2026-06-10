import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

import { findStoryById, parseStory, unblockStory } from './story.js';

describe('unblockStory', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary directory for tests
    // Use realpathSync to resolve symlinks (macOS /tmp -> /private/tmp)
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-')));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });

    // Create kanban folders
    fs.mkdirSync(path.join(sdlcRoot, 'backlog'), { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, 'ready'), { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, 'in-progress'), { recursive: true });
    fs.mkdirSync(path.join(sdlcRoot, 'done'), { recursive: true });
  });

  afterEach(() => {
    // Always restore real timers to prevent test pollution
    vi.useRealTimers();
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createBlockedStory(slug: string, overrides: any = {}): string {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, slug);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');

    const frontmatter = {
      id: slug,
      title: `Test Story ${slug}`,
      slug: slug,
      priority: 1,
      status: 'blocked',
      type: 'feature',
      created: '2024-01-01',
      labels: [],
      research_complete: true,
      plan_complete: true,
      implementation_complete: false,
      reviews_complete: false,
      blocked_reason: 'Max refinement attempts (2/2) reached',
      blocked_at: new Date().toISOString(),
      ...overrides,
    };

    const content = `---
${Object.entries(frontmatter)
  .map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: [${value.map(v => `'${v}'`).join(', ')}]`;
    }
    if (typeof value === 'string') {
      return `${key}: '${value}'`;
    }
    return `${key}: ${value}`;
  })
  .join('\n')}
---

# Test Story ${slug}

Test content`;

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  it('should throw error when story not found', async () => {
    await expect(async () => {
      await unblockStory('nonexistent-id', sdlcRoot);
    }).rejects.toThrow('Story nonexistent-id not found');
  });

  it('should change status to in-progress when implementation is complete', async () => {
    createBlockedStory('test-story', {
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
    });

    const unblockedStory = await unblockStory('test-story', sdlcRoot);

    expect(unblockedStory.frontmatter.status).toBe('in-progress');
    expect(unblockedStory.frontmatter.blocked_reason).toBeUndefined();
    expect(unblockedStory.frontmatter.blocked_at).toBeUndefined();
  });

  it('should preserve completion flags when unblocking', async () => {
    createBlockedStory('test-story', {
      research_complete: true,
      plan_complete: true,
      implementation_complete: false,
    });

    const unblockedStory = await unblockStory('test-story', sdlcRoot);

    // Plan complete but not implementation → ready status
    expect(unblockedStory.frontmatter.status).toBe('ready');
    expect(unblockedStory.frontmatter.research_complete).toBe(true);
    expect(unblockedStory.frontmatter.plan_complete).toBe(true);
  });

  it('should keep story in same folder', async () => {
    const storyPath = createBlockedStory('test-story', {
      research_complete: false,
      plan_complete: true,
      implementation_complete: false,
    });

    const unblockedStory = await unblockStory('test-story', sdlcRoot);

    expect(unblockedStory.path).toBe(storyPath);
    expect(fs.existsSync(storyPath)).toBe(true);
  });

  it('should update status regardless of completion state', async () => {
    createBlockedStory('test-story', {
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
    });

    const unblockedStory = await unblockStory('test-story', sdlcRoot);

    expect(unblockedStory.frontmatter.status).toBe('in-progress');
  });

  it('should clear blocked_reason and blocked_at fields', async () => {
    createBlockedStory('test-story', {
      blocked_reason: 'Test blocking reason',
      blocked_at: '2026-01-12T10:00:00.000Z',
    });

    const unblockedStory = await unblockStory('test-story', sdlcRoot);

    expect(unblockedStory.frontmatter.blocked_reason).toBeUndefined();
    expect(unblockedStory.frontmatter.blocked_at).toBeUndefined();
  });

  it('should reset retries when resetRetries option is true', async () => {
    createBlockedStory('test-story', {
      retry_count: 5,
      refinement_count: 3,
    });

    const unblockedStory = await unblockStory('test-story', sdlcRoot, { resetRetries: true });

    expect(unblockedStory.frontmatter.retry_count).toBe(0);
    expect(unblockedStory.frontmatter.refinement_count).toBe(0);
  });

  it('should reset total_recovery_attempts when resetRetries option is true', async () => {
    createBlockedStory('test-story', {
      retry_count: 5,
      refinement_count: 3,
      total_recovery_attempts: 10,
    });

    const unblockedStory = await unblockStory('test-story', sdlcRoot, { resetRetries: true });

    expect(unblockedStory.frontmatter.retry_count).toBe(0);
    expect(unblockedStory.frontmatter.refinement_count).toBe(0);
    expect(unblockedStory.frontmatter.total_recovery_attempts).toBe(0);
  });

  it('should preserve retry counts when resetRetries is false', async () => {
    createBlockedStory('test-story', {
      retry_count: 5,
      refinement_count: 3,
    });

    const unblockedStory = await unblockStory('test-story', sdlcRoot, { resetRetries: false });

    expect(unblockedStory.frontmatter.retry_count).toBe(5);
    expect(unblockedStory.frontmatter.refinement_count).toBe(3);
  });

  it('should NOT reset total_recovery_attempts when resetRetries is false', async () => {
    createBlockedStory('test-story', {
      retry_count: 5,
      refinement_count: 3,
      total_recovery_attempts: 7,
    });

    const unblockedStory = await unblockStory('test-story', sdlcRoot, { resetRetries: false });

    expect(unblockedStory.frontmatter.retry_count).toBe(5);
    expect(unblockedStory.frontmatter.refinement_count).toBe(3);
    expect(unblockedStory.frontmatter.total_recovery_attempts).toBe(7);
  });

  it('should preserve other frontmatter fields', async () => {
    createBlockedStory('test-story', {
      title: 'Important Story',
      labels: ['urgent', 'bug'],
      estimated_effort: 'large',
      branch: 'feature/test',
    });

    const unblockedStory = await unblockStory('test-story', sdlcRoot);

    expect(unblockedStory.frontmatter.title).toBe('Important Story');
    expect(unblockedStory.frontmatter.labels).toEqual(['urgent', 'bug']);
    expect(unblockedStory.frontmatter.estimated_effort).toBe('large');
    expect(unblockedStory.frontmatter.branch).toBe('feature/test');
  });

  it('should preserve story content when unblocking', async () => {
    const storyPath = createBlockedStory('test-story');

    const originalBlocked = parseStory(storyPath);
    const unblockedStory = await unblockStory('test-story', sdlcRoot);

    expect(unblockedStory.content).toBe(originalBlocked.content);
  });

  it('should keep file in same location after unblocking', async () => {
    const storyPath = createBlockedStory('test-story', {
      plan_complete: true,
    });

    expect(fs.existsSync(storyPath)).toBe(true);

    const unblockedStory = await unblockStory('test-story', sdlcRoot);

    expect(fs.existsSync(storyPath)).toBe(true);
    expect(unblockedStory.path).toBe(storyPath);
  });
});
describe('findStoryById - case insensitive lookup', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary directory for tests
    // Use realpathSync to resolve symlinks (macOS /tmp -> /private/tmp)
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-')));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
  });

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createTestStoryWithId(storyId: string): string {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, storyId);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');

    const content = `---
id: ${storyId}
title: Test Story ${storyId}
slug: ${storyId.toLowerCase()}
priority: 1
status: in-progress
type: feature
created: '2024-01-01'
labels: []
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
---

# Test Story ${storyId}

Test content for ${storyId}
`;

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  it('should return canonical path when ID provided in uppercase', () => {
    // Create story with uppercase directory: S-0001/
    const storyId = 'S-0001';
    createTestStoryWithId(storyId);

    // Query with uppercase
    const story = findStoryById(sdlcRoot, 'S-0001');

    expect(story).toBeDefined();
    expect(story).not.toBeNull();
    expect(story!.frontmatter.id).toBe('S-0001');
    expect(story!.path).toContain('S-0001'); // Should match actual filesystem casing
  });

  it('should return canonical path when ID provided in lowercase', () => {
    // Create story with uppercase directory: S-0002/
    const storyId = 'S-0002';
    createTestStoryWithId(storyId);

    // Query with lowercase (this is the bug scenario)
    const story = findStoryById(sdlcRoot, 's-0002');

    expect(story).toBeDefined();
    expect(story).not.toBeNull();
    expect(story!.frontmatter.id).toBe('S-0002');
    // The critical assertion: path should contain uppercase S-0002 (canonical filesystem casing)
    // not lowercase s-0002 (input casing)
    expect(story!.path).toContain('S-0002');
  });

  it('should return null for non-existent story with lowercase input', () => {
    // Query for non-existent story
    const story = findStoryById(sdlcRoot, 's-9999');

    expect(story).toBeNull();
  });

  it('should handle mixed case input and return canonical path', () => {
    // Create story with uppercase directory: S-0003/
    const storyId = 'S-0003';
    createTestStoryWithId(storyId);

    // Query with mixed case
    const story = findStoryById(sdlcRoot, 's-0003');

    expect(story).toBeDefined();
    expect(story).not.toBeNull();
    // Path should match filesystem, not input
    expect(story!.path).toContain('S-0003');
  });
});
