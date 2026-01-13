import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { moveToBlocked, parseStory, sanitizeReasonText, unblockStory } from './story.js';
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

describe('unblockStory', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    // Create temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-'));
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
    const blockedFolder = path.join(sdlcRoot, BLOCKED_DIR);
    fs.mkdirSync(blockedFolder, { recursive: true });

    const filename = `${slug}.md`;
    const filePath = path.join(blockedFolder, filename);

    const frontmatter = {
      id: slug,
      title: `Test Story ${slug}`,
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

  it('should throw error when story not found in blocked folder', () => {
    expect(() => {
      unblockStory('nonexistent-id', sdlcRoot);
    }).toThrow('not found in blocked folder');
  });

  it('should move blocked story to backlog when no phases complete', () => {
    createBlockedStory('test-story', {
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
    });

    const unblockedStory = unblockStory('test-story', sdlcRoot);

    expect(unblockedStory.frontmatter.status).toBe('backlog');
    expect(unblockedStory.path).toContain('/backlog/');
    expect(unblockedStory.frontmatter.blocked_reason).toBeUndefined();
    expect(unblockedStory.frontmatter.blocked_at).toBeUndefined();
  });

  it('should move blocked story to ready when research is complete', () => {
    createBlockedStory('test-story', {
      research_complete: true,
      plan_complete: false,
      implementation_complete: false,
    });

    const unblockedStory = unblockStory('test-story', sdlcRoot);

    expect(unblockedStory.frontmatter.status).toBe('ready');
    expect(unblockedStory.path).toContain('/ready/');
  });

  it('should move blocked story to ready when plan is complete', () => {
    createBlockedStory('test-story', {
      research_complete: false,
      plan_complete: true,
      implementation_complete: false,
    });

    const unblockedStory = unblockStory('test-story', sdlcRoot);

    expect(unblockedStory.frontmatter.status).toBe('ready');
    expect(unblockedStory.path).toContain('/ready/');
  });

  it('should move blocked story to in-progress when implementation is complete', () => {
    createBlockedStory('test-story', {
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
    });

    const unblockedStory = unblockStory('test-story', sdlcRoot);

    expect(unblockedStory.frontmatter.status).toBe('in-progress');
    expect(unblockedStory.path).toContain('/in-progress/');
  });

  it('should clear blocked_reason and blocked_at fields', () => {
    createBlockedStory('test-story', {
      blocked_reason: 'Test blocking reason',
      blocked_at: '2026-01-12T10:00:00.000Z',
    });

    const unblockedStory = unblockStory('test-story', sdlcRoot);

    expect(unblockedStory.frontmatter.blocked_reason).toBeUndefined();
    expect(unblockedStory.frontmatter.blocked_at).toBeUndefined();
  });

  it('should reset retries when resetRetries option is true', () => {
    createBlockedStory('test-story', {
      retry_count: 5,
      refinement_count: 3,
    });

    const unblockedStory = unblockStory('test-story', sdlcRoot, { resetRetries: true });

    expect(unblockedStory.frontmatter.retry_count).toBe(0);
    expect(unblockedStory.frontmatter.refinement_count).toBe(0);
  });

  it('should preserve retry counts when resetRetries is false', () => {
    createBlockedStory('test-story', {
      retry_count: 5,
      refinement_count: 3,
    });

    const unblockedStory = unblockStory('test-story', sdlcRoot, { resetRetries: false });

    expect(unblockedStory.frontmatter.retry_count).toBe(5);
    expect(unblockedStory.frontmatter.refinement_count).toBe(3);
  });

  it('should preserve other frontmatter fields', () => {
    createBlockedStory('test-story', {
      title: 'Important Story',
      labels: ['urgent', 'bug'],
      estimated_effort: 'large',
      branch: 'feature/test',
    });

    const unblockedStory = unblockStory('test-story', sdlcRoot);

    expect(unblockedStory.frontmatter.title).toBe('Important Story');
    expect(unblockedStory.frontmatter.labels).toEqual(['urgent', 'bug']);
    expect(unblockedStory.frontmatter.estimated_effort).toBe('large');
    expect(unblockedStory.frontmatter.branch).toBe('feature/test');
  });

  it('should preserve story content when unblocking', () => {
    createBlockedStory('test-story');

    const originalBlocked = parseStory(path.join(sdlcRoot, BLOCKED_DIR, 'test-story.md'));
    const unblockedStory = unblockStory('test-story', sdlcRoot);

    expect(unblockedStory.content).toBe(originalBlocked.content);
  });

  it('should update file path and remove old blocked file', () => {
    createBlockedStory('test-story', {
      plan_complete: true,
    });

    const blockedPath = path.join(sdlcRoot, BLOCKED_DIR, 'test-story.md');
    expect(fs.existsSync(blockedPath)).toBe(true);

    const unblockedStory = unblockStory('test-story', sdlcRoot);

    // Old blocked file should be removed
    expect(fs.existsSync(blockedPath)).toBe(false);

    // New file should exist in ready folder
    expect(fs.existsSync(unblockedStory.path)).toBe(true);
    expect(unblockedStory.path).toContain('/ready/');
  });
});
