import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { moveToBlocked, parseStory, sanitizeReasonText, unblockStory, getStory, writeStory, findStoryById, sanitizeTitle, extractTitleFromContent, createStory, autoCompleteStoryAfterReview } from './story.js';
import { BLOCKED_DIR, ReviewDecision, ReviewResult, Config } from '../types/index.js';

describe('moveToBlocked', () => {
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
    // Always restore real timers to prevent test pollution
    vi.useRealTimers();
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createTestStory(folder: string, slug: string, priority: number = 1): string {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, slug);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');

    const content = `---
id: ${slug}
title: Test Story ${slug}
slug: ${slug}
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

  it('should update status to blocked in frontmatter', async () => {
    const storyPath = createTestStory('in-progress', 'test-story');
    const originalStory = parseStory(storyPath);

    expect(originalStory.frontmatter.status).toBe('in-progress');

    await moveToBlocked(storyPath, 'Test reason');

    const updatedStory = parseStory(storyPath);
    expect(updatedStory.frontmatter.status).toBe('blocked');
  });

  it('should keep file in same location', async () => {
    const storyPath = createTestStory('in-progress', 'test-story');

    await moveToBlocked(storyPath, 'Test reason');

    expect(fs.existsSync(storyPath)).toBe(true);
  });

  it('should set frontmatter fields correctly', async () => {
    const storyPath = createTestStory('in-progress', 'test-story');
    const reason = 'Max refinement attempts (2/2) reached';

    await moveToBlocked(storyPath, reason);

    const blockedStory = parseStory(storyPath);

    expect(blockedStory.frontmatter.status).toBe('blocked');
    expect(blockedStory.frontmatter.blocked_reason).toBe(reason);
    expect(blockedStory.frontmatter.blocked_at).toBeDefined();
    expect(blockedStory.frontmatter.updated).toBeDefined();

    // Verify blocked_at is a valid ISO timestamp
    const timestamp = new Date(blockedStory.frontmatter.blocked_at!);
    expect(timestamp.getTime()).toBeGreaterThan(0);
  });

  it('should preserve other frontmatter fields', async () => {
    const storyPath = createTestStory('in-progress', 'test-story');
    const originalStory = parseStory(storyPath);

    await moveToBlocked(storyPath, 'Test reason');

    const blockedStory = parseStory(storyPath);

    expect(blockedStory.frontmatter.id).toBe(originalStory.frontmatter.id);
    expect(blockedStory.frontmatter.title).toBe(originalStory.frontmatter.title);
    expect(blockedStory.frontmatter.type).toBe(originalStory.frontmatter.type);
    expect(blockedStory.frontmatter.created).toBe(originalStory.frontmatter.created);
    expect(blockedStory.frontmatter.research_complete).toBe(originalStory.frontmatter.research_complete);
    expect(blockedStory.content).toBe(originalStory.content);
  });

  it('should allow blocking multiple stories with different IDs', async () => {
    const story1Path = createTestStory('in-progress', 'test-story-1', 1);
    await moveToBlocked(story1Path, 'First block');

    const story2Path = createTestStory('ready', 'test-story-2', 2);
    await moveToBlocked(story2Path, 'Second block');

    const story1 = parseStory(story1Path);
    const story2 = parseStory(story2Path);

    expect(story1.frontmatter.status).toBe('blocked');
    expect(story2.frontmatter.status).toBe('blocked');
    expect(story1.frontmatter.blocked_reason).toBe('First block');
    expect(story2.frontmatter.blocked_reason).toBe('Second block');
  });

  it('should validate path security and reject path traversal', async () => {
    // Try to use a path outside SDLC root
    const maliciousPath = path.join(tempDir, '../../../etc/passwd');

    await expect(async () => {
      await moveToBlocked(maliciousPath, 'Test reason');
    }).rejects.toThrow('Invalid story path');
  });

  it('should reject paths not within .ai-sdlc folder', async () => {
    // Create a story outside .ai-sdlc
    const wrongDir = path.join(tempDir, 'wrong-folder');
    fs.mkdirSync(wrongDir, { recursive: true });
    const wrongPath = path.join(wrongDir, 'test.md');
    fs.writeFileSync(wrongPath, '---\nid: test\n---\n# Test');

    await expect(async () => {
      await moveToBlocked(wrongPath, 'Test reason');
    }).rejects.toThrow('Invalid story path: not within .ai-sdlc folder');
  });

  it('should be idempotent when story already blocked', async () => {
    // Use fake timers for deterministic timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-12T10:00:00.000Z'));

    const storyPath = createTestStory('in-progress', 'test-story');

    // Move to blocked first time - timestamp should be 10:00:00.000Z
    await moveToBlocked(storyPath, 'First reason');
    const story1 = parseStory(storyPath);
    // Capture timestamp as primitive immediately to avoid any reference issues
    const firstBlockedAt = story1.frontmatter.blocked_at;

    // Advance time by 100ms - timestamp should now be 10:00:00.100Z
    vi.advanceTimersByTime(100);

    // Move to blocked second time (already blocked)
    await moveToBlocked(storyPath, 'Second reason');
    const story2 = parseStory(storyPath);

    // Should update the reason and timestamp
    expect(story2.frontmatter.blocked_reason).toBe('Second reason');
    expect(firstBlockedAt).toBe('2026-01-12T10:00:00.000Z');
    expect(story2.frontmatter.blocked_at).toBe('2026-01-12T10:00:00.100Z');
    expect(story2.frontmatter.blocked_at).not.toBe(firstBlockedAt);

    // Should still be in the same location
    expect(fs.existsSync(storyPath)).toBe(true);
  });

  it('should preserve content when blocking', async () => {
    const storyPath = createTestStory('in-progress', 'test-story');
    const originalStory = parseStory(storyPath);

    await moveToBlocked(storyPath, 'Test reason');

    const blockedStory = parseStory(storyPath);

    expect(blockedStory.content).toBe(originalStory.content);
  });
});

describe('sanitizeReasonText', () => {
  it('should return empty string for null/undefined/empty input', () => {
    expect(sanitizeReasonText('')).toBe('');
    expect(sanitizeReasonText(null as unknown as string)).toBe('');
    expect(sanitizeReasonText(undefined as unknown as string)).toBe('');
  });

  it('should remove ANSI escape sequences (colors)', () => {
    const input = '\x1B[31mRed text\x1B[0m normal text';
    expect(sanitizeReasonText(input)).toBe('Red text normal text');
  });

  it('should remove ANSI escape sequences (cursor movement)', () => {
    const input = '\x1B[2J\x1B[H Clear screen and home cursor';
    expect(sanitizeReasonText(input)).toBe('Clear screen and home cursor');
  });

  it('should remove OSC sequences (e.g., hyperlinks)', () => {
    const input = '\x1B]8;;http://evil.com\x07Click here\x1B]8;;\x07';
    // Note: OSC sequence format is \x1B]...\x07, and \x07 is a control char
    const result = sanitizeReasonText(input);
    expect(result).not.toContain('\x1B');
    expect(result).not.toContain('\x07');
    expect(result).toContain('Click here');
  });

  it('should replace newlines and tabs with spaces', () => {
    const input = 'Line 1\nLine 2\rLine 3\tTab here';
    expect(sanitizeReasonText(input)).toBe('Line 1 Line 2 Line 3 Tab here');
  });

  it('should remove backticks and pipe characters (markdown injection)', () => {
    const input = 'Code: `rm -rf /` and |table| chars';
    expect(sanitizeReasonText(input)).toBe('Code: rm -rf / and table chars');
  });

  it('should remove greater-than signs (blockquote injection)', () => {
    const input = '> Quoted text > more > quotes';
    expect(sanitizeReasonText(input)).toBe('Quoted text  more  quotes');
  });

  it('should remove control characters (0x00-0x1F)', () => {
    const input = 'Normal\x00\x01\x02\x03\x1Ftext';
    expect(sanitizeReasonText(input)).toBe('Normaltext');
  });

  it('should remove high control characters (0x7F-0x9F)', () => {
    const input = 'Normal\x7F\x80\x9Ftext';
    expect(sanitizeReasonText(input)).toBe('Normaltext');
  });

  it('should normalize Unicode (NFC normalization)', () => {
    // e followed by combining acute accent should become single character é
    const input = 'cafe\u0301';
    const result = sanitizeReasonText(input);
    expect(result).toBe('café');
    expect(result.length).toBe(4);
  });

  it('should truncate strings over 200 characters with ellipsis', () => {
    const input = 'a'.repeat(250);
    const result = sanitizeReasonText(input);
    expect(result.length).toBe(200);
    expect(result).toBe('a'.repeat(197) + '...');
  });

  it('should not truncate strings exactly at 200 characters', () => {
    const input = 'a'.repeat(200);
    const result = sanitizeReasonText(input);
    expect(result.length).toBe(200);
    expect(result).toBe('a'.repeat(200));
  });

  it('should trim leading/trailing whitespace', () => {
    const input = '   spaces around   ';
    expect(sanitizeReasonText(input)).toBe('spaces around');
  });

  it('should handle complex combined attack strings', () => {
    // Combine multiple attack vectors
    const input = '\x1B[31m`malicious`\x1B[0m\n|table|\r>quote\t\x00evil\x1B]8;;http://bad.com\x07link\x1B]8;;\x07';
    const result = sanitizeReasonText(input);

    // Should not contain any dangerous characters
    expect(result).not.toContain('\x1B');
    expect(result).not.toContain('`');
    expect(result).not.toContain('|');
    expect(result).not.toContain('>');
    expect(result).not.toContain('\n');
    expect(result).not.toContain('\r');
    expect(result).not.toContain('\t');
    expect(result).not.toContain('\x00');

    // Should preserve readable content
    expect(result).toContain('malicious');
    expect(result).toContain('table');
    expect(result).toContain('quote');
    expect(result).toContain('link');
  });

  it('should handle strings with only control characters', () => {
    const input = '\x00\x01\x02\x1B[31m\x1B[0m';
    expect(sanitizeReasonText(input)).toBe('');
  });

  it('should preserve alphanumeric and basic punctuation', () => {
    const input = 'Hello, World! 123 - (test)';
    expect(sanitizeReasonText(input)).toBe('Hello, World! 123 - (test)');
  });

  it('should handle real-world review feedback with ANSI codes', () => {
    const input = '\x1B[1;31mError:\x1B[0m The implementation has issues:\n- Missing error handling\n- No input validation';
    const result = sanitizeReasonText(input);
    expect(result).toBe('Error: The implementation has issues: - Missing error handling - No input validation');
  });
});

describe('getStory', () => {
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

  function createTestStory(storyId: string, status: string = 'backlog'): string {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, storyId);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');

    const content = `---
id: ${storyId}
title: Test Story ${storyId}
slug: test-story-${storyId}
priority: 10
status: ${status}
type: feature
created: '2024-01-01'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story ${storyId}

Test content`;

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  it('should return story when ID exists in new structure', () => {
    // getStory imported at top of file
    const storyId = 'S-0001';
    const storyPath = createTestStory(storyId);

    const story = getStory(sdlcRoot, storyId);

    expect(story).toBeDefined();
    expect(story.frontmatter.id).toBe(storyId);
    expect(story.path).toBe(storyPath);
  });

  it('should throw descriptive error when story ID does not exist', () => {
    // getStory imported at top of file
    const nonexistentId = 'S-9999';

    expect(() => {
      getStory(sdlcRoot, nonexistentId);
    }).toThrow(`Story not found: ${nonexistentId}`);

    // Check that error message includes helpful information
    try {
      getStory(sdlcRoot, nonexistentId);
    } catch (error: any) {
      expect(error.message).toContain('Searched in:');
      expect(error.message).toContain('stories/S-9999');
      expect(error.message).toContain('may have been deleted or the ID is incorrect');
    }
  });

  it('should find story after status changes (simulated move)', async () => {
    // getStory imported at top of file
    const storyId = 'S-0001';
    createTestStory(storyId, 'backlog');

    // First lookup - story in backlog
    const story1 = getStory(sdlcRoot, storyId);
    expect(story1.frontmatter.status).toBe('backlog');
    expect(story1.frontmatter.id).toBe(storyId);

    // Simulate status change by updating frontmatter
    story1.frontmatter.status = 'in-progress';
    // writeStory imported at top of file
    await writeStory(story1);

    // Second lookup - should still find the story
    const story2 = getStory(sdlcRoot, storyId);
    expect(story2.frontmatter.status).toBe('in-progress');
    expect(story2.frontmatter.id).toBe(storyId);
    expect(story2.path).toBe(story1.path); // Same path (folder-per-story)
  });

  it('should handle malformed story file gracefully', () => {
    // getStory imported at top of file
    const storyId = 'S-0001';
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, storyId);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');
    // Write invalid YAML frontmatter
    fs.writeFileSync(filePath, '---\ninvalid: yaml: structure:\n---\nContent');

    // Should throw error mentioning parse failure
    expect(() => {
      getStory(sdlcRoot, storyId);
    }).toThrow();
  });

  it('should return story with correct path and metadata', () => {
    // getStory imported at top of file
    const storyId = 'S-0123';
    const storyPath = createTestStory(storyId, 'in-progress');

    const story = getStory(sdlcRoot, storyId);

    expect(story.frontmatter.id).toBe(storyId);
    expect(story.frontmatter.status).toBe('in-progress');
    expect(story.frontmatter.title).toBe('Test Story S-0123');
    expect(story.path).toBe(storyPath);
    expect(story.content).toContain('Test content');
  });
});

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

describe('writeStory - file locking', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-lock-test-')));
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

  it('should acquire and release lock on successful write', async () => {
    const storyPath = createTestStory();
    const story = parseStory(storyPath);

    story.frontmatter.status = 'in-progress';

    await writeStory(story);

    const updatedStory = parseStory(storyPath);
    expect(updatedStory.frontmatter.status).toBe('in-progress');

    // Lock file should be cleaned up
    const lockPath = `${storyPath}.lock`;
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('should release lock even on write error', async () => {
    const storyPath = createTestStory();
    const story = parseStory(storyPath);

    // Make the file read-only to force a write error
    fs.chmodSync(storyPath, 0o444);

    await expect(writeStory(story)).rejects.toThrow();

    // Lock file should still be cleaned up
    const lockPath = `${storyPath}.lock`;
    expect(fs.existsSync(lockPath)).toBe(false);

    // Restore permissions for cleanup
    fs.chmodSync(storyPath, 0o644);
  });

  it('should use custom lock timeout from options', async () => {
    const storyPath = createTestStory();
    const story = parseStory(storyPath);

    story.frontmatter.priority = 20;

    // Write with custom timeout
    await writeStory(story, { lockTimeout: 1000 });

    const updatedStory = parseStory(storyPath);
    expect(updatedStory.frontmatter.priority).toBe(20);
  });

  it('should use default timeout when not specified', async () => {
    const storyPath = createTestStory();
    const story = parseStory(storyPath);

    story.frontmatter.priority = 30;

    // Write without options (should use default 5000ms timeout)
    await writeStory(story);

    const updatedStory = parseStory(storyPath);
    expect(updatedStory.frontmatter.priority).toBe(30);
  });

  it('should handle concurrent writes without corruption', async () => {
    const storyPath = createTestStory();

    // Launch 3 concurrent updates
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
        story.frontmatter.labels = ['test'];
        await writeStory(story);
      })(),
    ]);

    // File should be valid YAML and parseable
    const finalStory = parseStory(storyPath);
    expect(finalStory.frontmatter).toBeDefined();
    expect(finalStory.frontmatter.id).toBe('S-0001');

    // At least one of the updates should have been applied
    // (Due to race conditions, we can't guarantee all updates are applied in the order we expect,
    // but the file should not be corrupted)
    expect(
      finalStory.frontmatter.status === 'in-progress' ||
      finalStory.frontmatter.priority === 100 ||
      finalStory.frontmatter.labels?.includes('test')
    ).toBe(true);
  });
});

describe('sanitizeTitle', () => {
  it('should remove shell metacharacters', () => {
    expect(sanitizeTitle('Title $(cmd)')).toBe('Title cmd');
    expect(sanitizeTitle('Title `echo test`')).toBe('Title echo test');
    expect(sanitizeTitle('Title | pipe')).toBe('Title  pipe');
    expect(sanitizeTitle('Title & background')).toBe('Title  background');
    expect(sanitizeTitle('Title ; semicolon')).toBe('Title  semicolon');
    expect(sanitizeTitle('Title <redirect>')).toBe('Title redirect');
  });

  it('should remove ANSI escape codes', () => {
    // CSI sequences (colors, cursor) - text AROUND the codes is preserved
    expect(sanitizeTitle('\x1B[31mRed Title\x1B[0m')).toBe('Red Title');
    // OSC sequences (set window title) - entire sequence removed (text is a parameter, not content)
    expect(sanitizeTitle('\x1B]0;Window Title\x07')).toBe('');
    // Mixed: visible text with embedded OSC should keep visible text
    expect(sanitizeTitle('Visible \x1B]0;hidden\x07 Text')).toBe('Visible  Text');
  });

  it('should remove null bytes and control characters', () => {
    expect(sanitizeTitle('Title\x00Null')).toBe('TitleNull');
    expect(sanitizeTitle('Title\x1FControl')).toBe('TitleControl');
  });

  it('should normalize Unicode', () => {
    // Combining characters: é can be represented as e + ́
    const combining = 'e\u0301'; // e + combining acute accent
    const precomposed = '\u00e9'; // precomposed é
    expect(sanitizeTitle(combining)).toBe(precomposed);
  });

  it('should limit length to 200 characters', () => {
    const longTitle = 'a'.repeat(300);
    const sanitized = sanitizeTitle(longTitle);
    expect(sanitized.length).toBe(200);
  });

  it('should handle empty string', () => {
    expect(sanitizeTitle('')).toBe('');
  });

  it('should trim whitespace', () => {
    expect(sanitizeTitle('  Title  ')).toBe('Title');
  });
});

describe('extractTitleFromContent', () => {
  it('should extract title from H1 heading', () => {
    const content = '# My Story Title\n\nSome content here.';
    expect(extractTitleFromContent(content)).toBe('My Story Title');
  });

  it('should extract title from YAML frontmatter', () => {
    const content = `---
title: Frontmatter Title
status: backlog
---

# Heading Title

Content here.`;
    expect(extractTitleFromContent(content)).toBe('Frontmatter Title');
  });

  it('should prioritize frontmatter over H1', () => {
    const content = `---
title: From Frontmatter
---

# From H1

Content`;
    expect(extractTitleFromContent(content)).toBe('From Frontmatter');
  });

  it('should handle frontmatter title with quotes', () => {
    const content = `---
title: "Title with Quotes"
---

Content`;
    expect(extractTitleFromContent(content)).toBe('Title with Quotes');
  });

  it('should return null for no title', () => {
    const content = 'Just plain text without headings.';
    expect(extractTitleFromContent(content)).toBeNull();
  });

  it('should return null for empty content', () => {
    expect(extractTitleFromContent('')).toBeNull();
    expect(extractTitleFromContent('   ')).toBeNull();
  });

  it('should handle multiple H1 headings (use first)', () => {
    const content = `# First Title

Content

# Second Title

More content`;
    expect(extractTitleFromContent(content)).toBe('First Title');
  });

  it('should trim whitespace from extracted title', () => {
    const content = '#   Title with Spaces  \n\nContent';
    expect(extractTitleFromContent(content)).toBe('Title with Spaces');
  });

  it('should sanitize extracted title', () => {
    const content = '# Title $(dangerous)\n\nContent';
    expect(extractTitleFromContent(content)).toBe('Title dangerous');
  });

  it('should handle malformed frontmatter gracefully', () => {
    const content = `---
not: proper
yaml
title missing
---

# Fallback Title`;
    expect(extractTitleFromContent(content)).toBe('Fallback Title');
  });
});

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
