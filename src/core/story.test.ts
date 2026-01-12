import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { moveToBlocked, parseStory } from './story.js';
import { BLOCKED_DIR } from '../types/index.js';

describe('moveToBlocked', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-'));
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

  function createTestStory(folder: string, slug: string, priority: number = 1): string {
    const folderPath = path.join(sdlcRoot, folder);
    fs.mkdirSync(folderPath, { recursive: true });

    const filename = `${String(priority).padStart(2, '0')}-${slug}.md`;
    const filePath = path.join(folderPath, filename);

    const content = `---
id: ${slug}
title: Test Story ${slug}
priority: ${priority}
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

Test content
`;

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  it('should create blocked directory if missing', () => {
    const storyPath = createTestStory('in-progress', 'test-story');
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR);

    expect(fs.existsSync(blockedPath)).toBe(false);

    moveToBlocked(storyPath, 'Test reason');

    expect(fs.existsSync(blockedPath)).toBe(true);
  });

  it('should move file to correct location', () => {
    const storyPath = createTestStory('in-progress', 'test-story');
    const expectedNewPath = path.join(sdlcRoot, BLOCKED_DIR, 'test-story.md');

    moveToBlocked(storyPath, 'Test reason');

    expect(fs.existsSync(expectedNewPath)).toBe(true);
    expect(fs.existsSync(storyPath)).toBe(false);
  });

  it('should set frontmatter fields correctly', () => {
    const storyPath = createTestStory('in-progress', 'test-story');
    const reason = 'Max refinement attempts (2/2) reached';

    moveToBlocked(storyPath, reason);

    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR, 'test-story.md');
    const blockedStory = parseStory(blockedPath);

    expect(blockedStory.frontmatter.status).toBe('blocked');
    expect(blockedStory.frontmatter.blocked_reason).toBe(reason);
    expect(blockedStory.frontmatter.blocked_at).toBeDefined();
    expect(blockedStory.frontmatter.updated).toBeDefined();

    // Verify blocked_at is a valid ISO timestamp
    const timestamp = new Date(blockedStory.frontmatter.blocked_at!);
    expect(timestamp.getTime()).toBeGreaterThan(0);
  });

  it('should preserve other frontmatter fields', () => {
    const storyPath = createTestStory('in-progress', 'test-story');
    const originalStory = parseStory(storyPath);

    moveToBlocked(storyPath, 'Test reason');

    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR, 'test-story.md');
    const blockedStory = parseStory(blockedPath);

    expect(blockedStory.frontmatter.id).toBe(originalStory.frontmatter.id);
    expect(blockedStory.frontmatter.title).toBe(originalStory.frontmatter.title);
    expect(blockedStory.frontmatter.type).toBe(originalStory.frontmatter.type);
    expect(blockedStory.frontmatter.created).toBe(originalStory.frontmatter.created);
    expect(blockedStory.frontmatter.research_complete).toBe(originalStory.frontmatter.research_complete);
    expect(blockedStory.content).toBe(originalStory.content);
  });

  it('should handle filename conflicts by appending timestamp', () => {
    // Create first story and move to blocked
    const story1Path = createTestStory('in-progress', 'test-story', 1);
    moveToBlocked(story1Path, 'First block');

    // Create second story with same slug
    const story2Path = createTestStory('ready', 'test-story', 2);
    moveToBlocked(story2Path, 'Second block');

    const blockedDir = path.join(sdlcRoot, BLOCKED_DIR);
    const files = fs.readdirSync(blockedDir);

    expect(files.length).toBe(2);
    expect(files).toContain('test-story.md');

    // Second file should have timestamp appended
    const timestampFiles = files.filter(f => f.match(/^test-story-\d+\.md$/));
    expect(timestampFiles.length).toBe(1);
  });

  it('should validate path security and reject path traversal', () => {
    // Try to use a path outside SDLC root
    const maliciousPath = path.join(tempDir, '../../../etc/passwd');

    expect(() => {
      moveToBlocked(maliciousPath, 'Test reason');
    }).toThrow('Invalid story path');
  });

  it('should reject paths not within .ai-sdlc folder', () => {
    // Create a story outside .ai-sdlc
    const wrongDir = path.join(tempDir, 'wrong-folder');
    fs.mkdirSync(wrongDir, { recursive: true });
    const wrongPath = path.join(wrongDir, 'test.md');
    fs.writeFileSync(wrongPath, '---\nid: test\n---\n# Test');

    expect(() => {
      moveToBlocked(wrongPath, 'Test reason');
    }).toThrow('Invalid story path: not within .ai-sdlc folder');
  });

  it('should be idempotent when story already in blocked folder', () => {
    // Use fake timers for deterministic timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-12T10:00:00.000Z'));

    const storyPath = createTestStory('in-progress', 'test-story');

    // Move to blocked first time - timestamp should be 10:00:00.000Z
    moveToBlocked(storyPath, 'First reason');
    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR, 'test-story.md');
    const story1 = parseStory(blockedPath);
    // Capture timestamp as primitive immediately to avoid any reference issues
    const firstBlockedAt = story1.frontmatter.blocked_at;

    // Advance time by 100ms - timestamp should now be 10:00:00.100Z
    vi.advanceTimersByTime(100);

    // Move to blocked second time (already there)
    moveToBlocked(blockedPath, 'Second reason');
    const story2 = parseStory(blockedPath);

    // Should update the reason and timestamp
    expect(story2.frontmatter.blocked_reason).toBe('Second reason');
    expect(firstBlockedAt).toBe('2026-01-12T10:00:00.000Z');
    expect(story2.frontmatter.blocked_at).toBe('2026-01-12T10:00:00.100Z');
    expect(story2.frontmatter.blocked_at).not.toBe(firstBlockedAt);

    // Should still be in the same location
    expect(fs.existsSync(blockedPath)).toBe(true);
  });

  it('should preserve content when moving to blocked', () => {
    const storyPath = createTestStory('in-progress', 'test-story');
    const originalStory = parseStory(storyPath);

    moveToBlocked(storyPath, 'Test reason');

    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR, 'test-story.md');
    const blockedStory = parseStory(blockedPath);

    expect(blockedStory.content).toBe(originalStory.content);
  });
});
