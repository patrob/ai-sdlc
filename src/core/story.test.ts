import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { moveToBlocked, parseStory, sanitizeReasonText, unblockStory, getStory, writeStory, findStoryById } from './story.js';
import { BLOCKED_DIR } from '../types/index.js';

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

  it('should preserve retry counts when resetRetries is false', async () => {
    createBlockedStory('test-story', {
      retry_count: 5,
      refinement_count: 3,
    });

    const unblockedStory = await unblockStory('test-story', sdlcRoot, { resetRetries: false });

    expect(unblockedStory.frontmatter.retry_count).toBe(5);
    expect(unblockedStory.frontmatter.refinement_count).toBe(3);
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
