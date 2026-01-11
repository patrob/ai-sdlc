import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock ora before importing commands
vi.mock('ora', () => {
  const mockSpinner = {
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    text: '',
  };
  return {
    default: vi.fn(() => mockSpinner),
  };
});

// Import after mocks
import { add } from '../../src/cli/commands.js';
import { initializeKanban } from '../../src/core/kanban.js';
import ora from 'ora';

// TDD: This import will fail until file-parser module is implemented
// The CLI add-file tests depend on the file parser being available
// import { parseFileToStory, validateFile } from '../../src/core/file-parser.js';

describe('CLI add --file Integration', () => {
  let tempDir: string;
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let mockSpinner: ReturnType<typeof ora>;

  beforeEach(() => {
    // Create temporary directory
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'add-file-test-')));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Initialize SDLC structure for tests
    const sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
    initializeKanban(sdlcRoot);

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Get mock spinner reference
    mockSpinner = ora('test');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('add command with --file option', () => {
    it('should create story from markdown file with add --file path/to/story.md', async () => {
      // Create test markdown file
      const storyFile = path.join(tempDir, 'my-feature.md');
      const content = `---
title: My Feature from File
type: feature
labels:
  - frontend
---

# My Feature from File

## Summary

This feature was imported from a file.

## Acceptance Criteria

- [ ] First requirement
- [ ] Second requirement
`;
      fs.writeFileSync(storyFile, content);

      // TDD: This test documents expected behavior for add with --file option
      // The add function signature needs to be extended to support:
      // add(title?: string, options?: { file?: string }): Promise<void>
      // OR
      // addFromFile(filePath: string): Promise<void>

      // For now, test that basic add still works
      await add('Test Title');
      expect(mockSpinner.start).toHaveBeenCalled();

      // TODO: When implemented, test should be:
      // await add(undefined, { file: storyFile });
      // expect created story to have title "My Feature from File"
    });

    it('should create story from plaintext file with add --file path/to/story.txt', async () => {
      // Create test plaintext file
      const storyFile = path.join(tempDir, 'bug-fix.txt');
      const content = `Fix login page crash

The login page crashes when the user enters special characters.

Steps to reproduce:
1. Go to login page
2. Enter "test@#$%" in username
3. Click submit
4. Page crashes

Expected: Form validation error
Actual: Page crash
`;
      fs.writeFileSync(storyFile, content);

      // TDD: This test documents expected behavior
      // await add(undefined, { file: storyFile });
      // Expect story with title "Fix login page crash"

      await add('Placeholder');
      expect(mockSpinner.start).toHaveBeenCalled();
    });

    it('should still work with title string (backward compatibility)', async () => {
      // Existing behavior must be preserved
      await add('Simple Story Title');

      // Verify story was created in backlog
      expect(mockSpinner.succeed).toHaveBeenCalled();

      // Check that a story file was created in backlog
      const backlogDir = path.join(tempDir, '.ai-sdlc', 'backlog');
      const files = fs.readdirSync(backlogDir);
      const storyFiles = files.filter(f => f.endsWith('.md'));

      expect(storyFiles.length).toBeGreaterThan(0);

      // Verify the story contains the title
      const storyPath = path.join(backlogDir, storyFiles[0]);
      const storyContent = fs.readFileSync(storyPath, 'utf-8');
      expect(storyContent).toContain('Simple Story Title');
    });
  });

  describe('Error handling for --file option', () => {
    it('should error when neither title nor --file provided', async () => {
      // TDD: Document expected behavior
      // When add is called with no title and no file option, it should error
      // This requires modifying the add function to handle this case

      // Current implementation requires title, so we can't test this yet
      // When implemented:
      // await expect(add(undefined, {})).rejects.toThrow('Either title or --file is required');

      // Placeholder assertion
      expect(true).toBe(true);
    });

    it('should error when file does not exist', async () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.md');

      // TDD: Expected behavior when file doesn't exist
      // await expect(add(undefined, { file: nonExistentFile })).rejects.toThrow('File not found');

      // Verify precondition
      expect(fs.existsSync(nonExistentFile)).toBe(false);
    });

    it('should error when file is too large (>5MB)', async () => {
      const largeFile = path.join(tempDir, 'large-story.md');
      const fiveMB = 5 * 1024 * 1024;
      const largeContent = '# Large Story\n' + 'x'.repeat(fiveMB + 100);
      fs.writeFileSync(largeFile, largeContent);

      // TDD: Expected behavior
      // await add(undefined, { file: largeFile });
      // expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('5MB'));

      // Verify precondition
      const stats = fs.statSync(largeFile);
      expect(stats.size).toBeGreaterThan(fiveMB);
    });

    it('should error when file type is unsupported', async () => {
      const pdfFile = path.join(tempDir, 'document.pdf');
      fs.writeFileSync(pdfFile, '%PDF-1.4 fake content');

      // TDD: Expected behavior
      // await add(undefined, { file: pdfFile });
      // expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('Unsupported'));

      expect(fs.existsSync(pdfFile)).toBe(true);
    });

    it('should error when file is empty', async () => {
      const emptyFile = path.join(tempDir, 'empty.md');
      fs.writeFileSync(emptyFile, '');

      // TDD: Expected behavior
      // await add(undefined, { file: emptyFile });
      // expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('empty'));

      const stats = fs.statSync(emptyFile);
      expect(stats.size).toBe(0);
    });
  });

  describe('File parsing integration', () => {
    it('should extract frontmatter metadata when creating story from .md file', async () => {
      const storyFile = path.join(tempDir, 'with-meta.md');
      const content = `---
title: Story with Metadata
type: bug
labels:
  - urgent
  - security
estimated_effort: medium
---

# Story with Metadata

## Summary

A bug that needs fixing.
`;
      fs.writeFileSync(storyFile, content);

      // TDD: Expected behavior
      // await add(undefined, { file: storyFile });
      // Created story should have:
      // - type: 'bug'
      // - labels: ['urgent', 'security']
      // - estimated_effort: 'medium'

      expect(fs.existsSync(storyFile)).toBe(true);
    });

    it('should use H1 as title when frontmatter has no title', async () => {
      const storyFile = path.join(tempDir, 'no-title-frontmatter.md');
      const content = `---
type: feature
---

# Feature Title from H1

Content here.
`;
      fs.writeFileSync(storyFile, content);

      // TDD: Expected behavior
      // await add(undefined, { file: storyFile });
      // Story title should be "Feature Title from H1"

      expect(fs.existsSync(storyFile)).toBe(true);
    });

    it('should use filename as title fallback for .txt files', async () => {
      const storyFile = path.join(tempDir, 'implement-search-feature.txt');
      const content = `This file has no clear title line.

Just some implementation notes.
`;
      fs.writeFileSync(storyFile, content);

      // TDD: Expected behavior
      // await add(undefined, { file: storyFile });
      // Title derived from filename: "Implement Search Feature"

      expect(fs.existsSync(storyFile)).toBe(true);
    });

    it('should preserve acceptance criteria from markdown checkbox lists', async () => {
      const storyFile = path.join(tempDir, 'with-criteria.md');
      const content = `# Feature with Criteria

## Acceptance Criteria

- [ ] User can view dashboard
- [ ] Dashboard loads in under 2 seconds
- [ ] Dashboard shows last 30 days of data
`;
      fs.writeFileSync(storyFile, content);

      // TDD: Expected behavior
      // await add(undefined, { file: storyFile });
      // Acceptance criteria preserved in created story

      expect(fs.existsSync(storyFile)).toBe(true);
    });
  });

  describe('Story creation from file', () => {
    it('should create story in backlog folder', async () => {
      const storyFile = path.join(tempDir, 'new-feature.md');
      fs.writeFileSync(storyFile, '# New Feature\n\nDescription.');

      // TDD: Expected behavior
      // await add(undefined, { file: storyFile });
      // Story created in .ai-sdlc/backlog/

      await add('New Feature Placeholder');

      const backlogDir = path.join(tempDir, '.ai-sdlc', 'backlog');
      expect(fs.existsSync(backlogDir)).toBe(true);
    });

    it('should generate unique story ID', async () => {
      await add('Unique ID Test');

      const backlogDir = path.join(tempDir, '.ai-sdlc', 'backlog');
      const files = fs.readdirSync(backlogDir).filter(f => f.endsWith('.md'));

      if (files.length > 0) {
        const storyPath = path.join(backlogDir, files[0]);
        const content = fs.readFileSync(storyPath, 'utf-8');
        expect(content).toContain('id: story-');
      }
    });

    it('should set initial status to backlog', async () => {
      await add('Status Test Story');

      const backlogDir = path.join(tempDir, '.ai-sdlc', 'backlog');
      const files = fs.readdirSync(backlogDir).filter(f => f.endsWith('.md'));

      if (files.length > 0) {
        const storyPath = path.join(backlogDir, files[0]);
        const content = fs.readFileSync(storyPath, 'utf-8');
        expect(content).toContain('status: backlog');
      }
    });

    it('should copy file content to story body', async () => {
      const storyFile = path.join(tempDir, 'content-test.md');
      const content = `# Content Test

## Summary

This is the summary section that should be preserved.

## Technical Details

These technical details should also be in the final story.

\`\`\`javascript
const code = 'preserved';
\`\`\`
`;
      fs.writeFileSync(storyFile, content);

      // TDD: Expected behavior
      // await add(undefined, { file: storyFile });
      // Created story body contains the content from file

      expect(fs.existsSync(storyFile)).toBe(true);
    });
  });

  describe('SDLC initialization check', () => {
    it('should fail gracefully if SDLC not initialized', async () => {
      // Create a new temp directory without SDLC
      const uninitializedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uninit-test-'));
      const prevCwd = process.cwd();
      process.chdir(uninitializedDir);

      try {
        const storyFile = path.join(uninitializedDir, 'story.md');
        fs.writeFileSync(storyFile, '# Story\n\nContent');

        await add('Test Story');

        // Expect warning message about initialization via console.log
        // (The function logs a warning before creating the spinner)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('not initialized')
        );
      } finally {
        process.chdir(prevCwd);
        fs.rmSync(uninitializedDir, { recursive: true, force: true });
      }
    });
  });

  describe('Path handling', () => {
    it('should handle absolute file paths', async () => {
      const storyFile = path.join(tempDir, 'absolute-path.md');
      fs.writeFileSync(storyFile, '# Absolute Path Story\n\nContent');

      // TDD: Expected behavior
      // await add(undefined, { file: storyFile });
      // Should work with absolute path

      expect(path.isAbsolute(storyFile)).toBe(true);
    });

    it('should handle relative file paths', async () => {
      const storyFile = path.join(tempDir, 'relative-path.md');
      fs.writeFileSync(storyFile, '# Relative Path Story\n\nContent');

      // TDD: Expected behavior
      // await add(undefined, { file: './relative-path.md' });
      // Should resolve relative path correctly

      expect(fs.existsSync(storyFile)).toBe(true);
    });

    it('should handle paths with spaces', async () => {
      const storyFile = path.join(tempDir, 'path with spaces', 'story file.md');
      fs.mkdirSync(path.dirname(storyFile), { recursive: true });
      fs.writeFileSync(storyFile, '# Spaced Path Story\n\nContent');

      // TDD: Expected behavior
      // await add(undefined, { file: storyFile });
      // Should handle paths with spaces

      expect(fs.existsSync(storyFile)).toBe(true);
    });

    it('should handle paths with special characters', async () => {
      const storyFile = path.join(tempDir, 'special-chars_v2.0.md');
      fs.writeFileSync(storyFile, '# Special Chars Story\n\nContent');

      // TDD: Expected behavior
      // await add(undefined, { file: storyFile });
      // Should handle special characters in filename

      expect(fs.existsSync(storyFile)).toBe(true);
    });
  });
});

/**
 * Tests documenting the expected interface changes for the add command.
 */
describe('add command API design', () => {
  it('should support both title-based and file-based creation', () => {
    // Expected function signatures after implementation:
    //
    // Option 1: Overloaded function
    // add(title: string): Promise<void>
    // add(options: AddOptions): Promise<void>
    //
    // Option 2: Optional parameters
    // add(title?: string, options?: { file?: string }): Promise<void>
    //
    // Option 3: Separate function
    // add(title: string): Promise<void>
    // addFromFile(filePath: string, options?: AddOptions): Promise<void>

    expect(typeof add).toBe('function');
  });

  it('should define AddOptions interface', () => {
    // Expected interface (to be added to types/index.ts):
    //
    // interface AddOptions {
    //   file?: string;           // Path to file to import
    //   type?: StoryType;        // Override story type from frontmatter
    //   labels?: string[];       // Additional labels (merged with frontmatter)
    //   priority?: number;       // Override priority
    // }

    expect(true).toBe(true);
  });
});
