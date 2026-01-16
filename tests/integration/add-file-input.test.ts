import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { add } from '../../src/cli/commands.js';
import { parseStory } from '../../src/core/story.js';
import ora from 'ora';

// Mock ora to capture spinner behavior
vi.mock('ora', () => {
  return {
    default: vi.fn(() => ({
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
      text: '',
    })),
  };
});

describe('add command with file input', () => {
  let tempDir: string;
  let sdlcRoot: string;
  let originalCwd: string;
  let testFilePath: string;

  beforeEach(() => {
    // Mock date for deterministic test results
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-16T12:00:00Z'));

    // Save original cwd
    originalCwd = process.cwd();

    // Create temporary directory for tests
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-add-test-')));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');

    // Initialize .ai-sdlc structure
    fs.mkdirSync(sdlcRoot, { recursive: true });
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    // Change to temp directory for relative path tests
    process.chdir(tempDir);
  });

  afterEach(() => {
    vi.useRealTimers();

    // Restore original cwd
    process.chdir(originalCwd);

    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('file input with title extraction', () => {
    it('should create story from file with H1 heading', async () => {
      // Create test file with H1 heading
      testFilePath = path.join(tempDir, 'test-story.md');
      const fileContent = '# My Test Story\n\nThis is the story content.';
      fs.writeFileSync(testFilePath, fileContent);

      // Call add with file option
      await add(undefined, { file: testFilePath });

      // Verify story was created
      const storiesFolder = path.join(sdlcRoot, 'stories');
      const storyDirs = fs.readdirSync(storiesFolder);
      expect(storyDirs.length).toBe(1);

      const storyPath = path.join(storiesFolder, storyDirs[0], 'story.md');
      const story = parseStory(storyPath);

      expect(story.frontmatter.title).toBe('My Test Story');
      expect(story.content).toContain('This is the story content');
    });

    it('should create story from file with frontmatter title', async () => {
      testFilePath = path.join(tempDir, 'frontmatter-story.md');
      const fileContent = `---
title: Title from Frontmatter
---

# Heading Title

Content here.`;
      fs.writeFileSync(testFilePath, fileContent);

      await add(undefined, { file: testFilePath });

      const storiesFolder = path.join(sdlcRoot, 'stories');
      const storyDirs = fs.readdirSync(storiesFolder);
      const storyPath = path.join(storiesFolder, storyDirs[0], 'story.md');
      const story = parseStory(storyPath);

      // Should use frontmatter title, not H1
      expect(story.frontmatter.title).toBe('Title from Frontmatter');
    });

    it('should use filename as title when no H1 or frontmatter', async () => {
      testFilePath = path.join(tempDir, 'no-title-file.txt');
      const fileContent = 'Just plain text without any headings.';
      fs.writeFileSync(testFilePath, fileContent);

      await add(undefined, { file: testFilePath });

      const storiesFolder = path.join(sdlcRoot, 'stories');
      const storyDirs = fs.readdirSync(storiesFolder);
      const storyPath = path.join(storiesFolder, storyDirs[0], 'story.md');
      const story = parseStory(storyPath);

      expect(story.frontmatter.title).toBe('no-title-file');
      expect(story.content).toContain('Just plain text');
    });
  });

  describe('backward compatibility', () => {
    it('should still work with traditional title-only input', async () => {
      await add('Traditional Title');

      const storiesFolder = path.join(sdlcRoot, 'stories');
      const storyDirs = fs.readdirSync(storiesFolder);
      expect(storyDirs.length).toBe(1);

      const storyPath = path.join(storiesFolder, storyDirs[0], 'story.md');
      const story = parseStory(storyPath);

      expect(story.frontmatter.title).toBe('Traditional Title');
      expect(story.content).toContain('# Traditional Title');
      expect(story.content).toContain('## Summary');
      expect(story.content).toContain('## Acceptance Criteria');
    });
  });

  describe('error handling', () => {
    it('should error when neither title nor file provided', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      await add(undefined, {});

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it('should error when both title and file provided', async () => {
      testFilePath = path.join(tempDir, 'test.md');
      fs.writeFileSync(testFilePath, '# Test');

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      await add('Some Title', { file: testFilePath });

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it('should error for non-existent file', async () => {
      testFilePath = path.join(tempDir, 'does-not-exist.md');

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      await add(undefined, { file: testFilePath });

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });
  });

  describe('security', () => {
    it('should reject path traversal attempts', async () => {
      // Try to read a file outside the current directory
      testFilePath = '../../../etc/passwd';

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      await add(undefined, { file: testFilePath });

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it('should reject symbolic links', async () => {
      // Create a real file and a symlink to it
      const realFile = path.join(tempDir, 'real-file.md');
      fs.writeFileSync(realFile, '# Real Content');

      const symlinkPath = path.join(tempDir, 'symlink.md');
      fs.symlinkSync(realFile, symlinkPath);

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      await add(undefined, { file: symlinkPath });

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it('should reject invalid file extensions', async () => {
      testFilePath = path.join(tempDir, 'malicious.exe');
      fs.writeFileSync(testFilePath, 'malicious content');

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      await add(undefined, { file: testFilePath });

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it('should reject oversized files (>10MB)', async () => {
      testFilePath = path.join(tempDir, 'large-file.md');

      // Create a file larger than 10MB
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
      fs.writeFileSync(testFilePath, largeContent);

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      await add(undefined, { file: testFilePath });

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it('should sanitize malicious title content', async () => {
      testFilePath = path.join(tempDir, 'malicious.md');
      const fileContent = '# Title $(dangerous command)\n\nContent';
      fs.writeFileSync(testFilePath, fileContent);

      await add(undefined, { file: testFilePath });

      const storiesFolder = path.join(sdlcRoot, 'stories');
      const storyDirs = fs.readdirSync(storiesFolder);
      const storyPath = path.join(storiesFolder, storyDirs[0], 'story.md');
      const story = parseStory(storyPath);

      // Should have sanitized the dangerous characters
      expect(story.frontmatter.title).toBe('Title dangerous command');
      expect(story.frontmatter.title).not.toContain('$');
      expect(story.frontmatter.title).not.toContain('(');
      expect(story.frontmatter.title).not.toContain(')');
    });

    it('should strip script tags from file content', async () => {
      testFilePath = path.join(tempDir, 'xss-test.md');
      const fileContent = '# Test\n\n<script>alert("xss")</script>\n\nSafe content';
      fs.writeFileSync(testFilePath, fileContent);

      await add(undefined, { file: testFilePath });

      const storiesFolder = path.join(sdlcRoot, 'stories');
      const storyDirs = fs.readdirSync(storiesFolder);
      const storyPath = path.join(storiesFolder, storyDirs[0], 'story.md');
      const story = parseStory(storyPath);

      expect(story.content).not.toContain('<script>');
      expect(story.content).not.toContain('alert');
      expect(story.content).toContain('Safe content');
    });

    it('should strip null bytes from file content', async () => {
      testFilePath = path.join(tempDir, 'null-bytes.md');
      const fileContent = '# Test\x00Title\n\nContent\x00here';
      fs.writeFileSync(testFilePath, fileContent);

      await add(undefined, { file: testFilePath });

      const storiesFolder = path.join(sdlcRoot, 'stories');
      const storyDirs = fs.readdirSync(storiesFolder);
      const storyPath = path.join(storiesFolder, storyDirs[0], 'story.md');
      const story = parseStory(storyPath);

      // Null bytes should be stripped
      expect(story.content).not.toContain('\x00');
      expect(story.content).toContain('TestTitle');
      expect(story.content).toContain('Contenthere');
    });
  });

  describe('file types', () => {
    it('should accept .md files', async () => {
      testFilePath = path.join(tempDir, 'test.md');
      fs.writeFileSync(testFilePath, '# Markdown File\n\nContent');

      await add(undefined, { file: testFilePath });

      const storiesFolder = path.join(sdlcRoot, 'stories');
      const storyDirs = fs.readdirSync(storiesFolder);
      expect(storyDirs.length).toBe(1);
    });

    it('should accept .txt files', async () => {
      testFilePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(testFilePath, '# Text File\n\nContent');

      await add(undefined, { file: testFilePath });

      const storiesFolder = path.join(sdlcRoot, 'stories');
      const storyDirs = fs.readdirSync(storiesFolder);
      expect(storyDirs.length).toBe(1);
    });

    it('should accept .markdown files', async () => {
      testFilePath = path.join(tempDir, 'test.markdown');
      fs.writeFileSync(testFilePath, '# Markdown File\n\nContent');

      await add(undefined, { file: testFilePath });

      const storiesFolder = path.join(sdlcRoot, 'stories');
      const storyDirs = fs.readdirSync(storiesFolder);
      expect(storyDirs.length).toBe(1);
    });
  });
});
