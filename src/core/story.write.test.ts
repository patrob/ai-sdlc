import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

import { extractTitleFromContent, parseStory, sanitizeTitle, writeStory } from './story.js';

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

  // chmod 0o444 cannot make a file unwritable for the root user, so the
  // forced-write-error precondition is unreachable when the suite runs as root
  // (e.g. in some CI/container environments). Skip there rather than assert a
  // rejection that cannot occur.
  const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  it.skipIf(runningAsRoot)('should release lock even on write error', async () => {
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
