/**
 * TDD Tests for File Parser Module
 *
 * These tests define the expected API for file parsing functionality.
 * The tests are written FIRST (TDD) and will fail until the implementation
 * matches the expected interface.
 *
 * Expected exports from src/core/file-parser.ts:
 * - parseMarkdownFile(filePath: string): ParsedFileContent
 * - parsePlaintextFile(filePath: string): ParsedFileContent
 * - validateFile(filePath: string): FileValidationResult
 * - parseFileToStory(filePath: string): ParsedFileContent
 *
 * Note: There is an existing implementation with a different API.
 * Either extend that implementation or create wrapper functions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Import existing implementation (different API - tests document required changes)
import {
  parseMarkdownFile as parseMarkdownContent,
  parsePlaintextFile as parsePlaintextContent,
  parseStoryFile,
  type ParsedStoryContent,
} from '../../src/core/file-parser.js';

import {
  validateStoryFile,
  FileValidationError,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_MB,
} from '../../src/core/file-validators.js';

/**
 * Expected interface for parsed file content
 * (to be added to types if not present)
 */
interface ParsedFileContent {
  title: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  acceptanceCriteria?: string[];
}

/**
 * Expected interface for validation result
 * (alternative to throwing errors - more functional approach)
 */
interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Wrapper to adapt parseMarkdownFile to expected API
 * Takes a file path and returns parsed content
 */
function parseMarkdownFile(filePath: string): ParsedFileContent {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath);

  let result: ParsedStoryContent;
  try {
    result = parseMarkdownContent(content, filename);
  } catch (error) {
    // Handle malformed YAML frontmatter gracefully
    // Treat the entire content as body text
    const h1Match = content.match(/^#\s+(.+?)(?:\n|$)/m);
    const title = h1Match ? h1Match[1].trim() : filename.replace(/\.md$/i, '');

    return {
      title,
      content: content,
    };
  }

  // Extract acceptance criteria from content
  const acceptanceCriteria = extractAcceptanceCriteria(result.content);

  return {
    title: result.title || filename.replace(/\.md$/i, ''),
    content: result.content,
    frontmatter: result.frontmatter as Record<string, unknown> | undefined,
    acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : undefined,
  };
}

/**
 * Wrapper to adapt parsePlaintextFile to expected API
 */
function parsePlaintextFile(filePath: string): ParsedFileContent {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath);

  // For plaintext, try to extract title from first non-empty line
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  const firstLine = lines[0]?.trim() || '';

  // If first line looks like a title (short, no punctuation at end), use it
  const isTitle = firstLine.length < 100 && !/[.!?,;:]$/.test(firstLine);

  let title: string;
  if (isTitle && firstLine.length > 0) {
    title = firstLine;
  } else {
    // Derive from filename
    title = filename
      .replace(/\.txt$/i, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  return {
    title,
    content,
  };
}

/**
 * Wrapper to provide validation result instead of throwing
 */
function validateFile(filePath: string): FileValidationResult {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: `File not found: ${filePath}` };
    }

    // Check extension
    const ext = path.extname(filePath).toLowerCase();
    if (!ext) {
      return {
        valid: false,
        error: 'File must have an extension. Supported types: .md, .txt',
      };
    }
    if (!ALLOWED_EXTENSIONS.includes(ext as any)) {
      return {
        valid: false,
        error: `Unsupported file type: ${ext}. Supported types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      };
    }

    // Check size
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return {
        valid: false,
        error: `File exceeds maximum size of ${MAX_FILE_SIZE_MB}MB`,
      };
    }

    // Check content
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.trim()) {
      return { valid: false, error: 'File is empty' };
    }

    return { valid: true };
  } catch (error) {
    if (error instanceof FileValidationError) {
      return { valid: false, error: error.message };
    }
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Wrapper for unified file parsing
 */
function parseFileToStory(filePath: string, _sdlcRoot: string): ParsedFileContent {
  // Validate first
  const validation = validateFile(filePath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.markdown') {
    return parseMarkdownFile(filePath);
  } else {
    return parsePlaintextFile(filePath);
  }
}

/**
 * Helper to extract acceptance criteria from markdown content
 */
function extractAcceptanceCriteria(content: string): string[] {
  const criteria: string[] = [];

  // Find acceptance criteria section
  const sectionMatch = content.match(
    /##\s+Acceptance\s+Criteria[\s\S]*?(?=\n##\s|$)/i
  );

  if (sectionMatch) {
    // Extract checkbox items
    const checkboxRegex = /- \[[x ]\]\s+(.+)/gi;
    let match;
    while ((match = checkboxRegex.exec(sectionMatch[0])) !== null) {
      criteria.push(match[1].trim());
    }
  }

  return criteria;
}

describe('File Parser Module', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'file-parser-test-'))
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Markdown Parsing', () => {
    describe('parseMarkdownFile', () => {
      it('should parse markdown file with frontmatter', () => {
        const filePath = path.join(tempDir, 'story.md');
        const content = `---
title: User Authentication Feature
type: feature
labels:
  - auth
  - security
---

# User Authentication Feature

## Summary

Implement secure user authentication with JWT tokens.

## Acceptance Criteria

- [ ] Users can register with email/password
- [ ] Users can log in and receive JWT token
- [ ] JWT tokens expire after 24 hours
`;
        fs.writeFileSync(filePath, content);

        const result = parseMarkdownFile(filePath);

        expect(result.title).toBe('User Authentication Feature');
        expect(result.frontmatter).toBeDefined();
        expect(result.frontmatter?.title).toBe('User Authentication Feature');
        expect(result.frontmatter?.type).toBe('feature');
        expect(result.frontmatter?.labels).toEqual(['auth', 'security']);
        expect(result.acceptanceCriteria).toHaveLength(3);
      });

      it('should extract title from H1 when frontmatter missing', () => {
        const filePath = path.join(tempDir, 'no-frontmatter.md');
        const content = `# My Awesome Feature

This is a feature without frontmatter.

## Acceptance Criteria

- [ ] It works
`;
        fs.writeFileSync(filePath, content);

        const result = parseMarkdownFile(filePath);

        expect(result.title).toBe('My Awesome Feature');
        expect(result.frontmatter).toBeUndefined();
      });

      it('should extract title from H1 when frontmatter has no title', () => {
        const filePath = path.join(tempDir, 'partial-frontmatter.md');
        const content = `---
type: bug
labels:
  - critical
---

# Critical Bug Fix

This bug needs fixing ASAP.
`;
        fs.writeFileSync(filePath, content);

        const result = parseMarkdownFile(filePath);

        expect(result.title).toBe('Critical Bug Fix');
        expect(result.frontmatter?.type).toBe('bug');
      });

      it('should parse acceptance criteria from checkbox lists', () => {
        const filePath = path.join(tempDir, 'with-criteria.md');
        const content = `# Feature with Criteria

## Acceptance Criteria

- [ ] First criterion
- [ ] Second criterion with details
- [x] Already completed criterion (should still be parsed)
- [ ] Fourth criterion

## Other Section

Some other content.
`;
        fs.writeFileSync(filePath, content);

        const result = parseMarkdownFile(filePath);

        expect(result.acceptanceCriteria).toBeDefined();
        expect(result.acceptanceCriteria).toHaveLength(4);
        expect(result.acceptanceCriteria).toContain('First criterion');
        expect(result.acceptanceCriteria).toContain(
          'Already completed criterion (should still be parsed)'
        );
      });

      it('should preserve markdown formatting (code blocks, lists)', () => {
        const filePath = path.join(tempDir, 'formatted.md');
        const content = `# Feature with Formatting

## Summary

This feature includes:

1. Numbered list item 1
2. Numbered list item 2

\`\`\`typescript
const example = () => {
  return 'preserved code';
};
\`\`\`

- Bullet point 1
- Bullet point 2

> Blockquote content
`;
        fs.writeFileSync(filePath, content);

        const result = parseMarkdownFile(filePath);

        // Verify code blocks are preserved
        expect(result.content).toContain('```typescript');
        expect(result.content).toContain("return 'preserved code';");
        expect(result.content).toContain('```');

        // Verify lists are preserved
        expect(result.content).toContain('1. Numbered list item 1');
        expect(result.content).toContain('- Bullet point 1');

        // Verify blockquotes are preserved
        expect(result.content).toContain('> Blockquote content');
      });

      it('should handle malformed markdown gracefully', () => {
        const filePath = path.join(tempDir, 'malformed.md');
        const content = `---
title: Incomplete frontmatter
type: feature
# Missing closing ---

This content comes after malformed frontmatter.

## Summary

Some text here.
`;
        fs.writeFileSync(filePath, content);

        // Should not throw - handle gracefully
        expect(() => parseMarkdownFile(filePath)).not.toThrow();

        const result = parseMarkdownFile(filePath);
        expect(result.title).toBeDefined();
      });

      it('should handle markdown with only frontmatter and no body', () => {
        const filePath = path.join(tempDir, 'frontmatter-only.md');
        const content = `---
title: Frontmatter Only Story
type: chore
---
`;
        fs.writeFileSync(filePath, content);

        const result = parseMarkdownFile(filePath);

        expect(result.title).toBe('Frontmatter Only Story');
        expect(result.content.trim()).toBe('');
      });

      it('should extract nested acceptance criteria from sub-sections', () => {
        const filePath = path.join(tempDir, 'nested-criteria.md');
        const content = `# Complex Feature

## Acceptance Criteria

### Core Requirements
- [ ] Core requirement 1
- [ ] Core requirement 2

### Nice to Have
- [ ] Optional requirement 1
`;
        fs.writeFileSync(filePath, content);

        const result = parseMarkdownFile(filePath);

        expect(result.acceptanceCriteria).toHaveLength(3);
      });
    });
  });

  describe('Plaintext Parsing', () => {
    describe('parsePlaintextFile', () => {
      it('should convert plaintext to story structure', () => {
        const filePath = path.join(tempDir, 'story.txt');
        const content = `Add a new login page

Users should be able to log in with their email and password.
The login page should have:
- Email input field
- Password input field
- Submit button
- Forgot password link
`;
        fs.writeFileSync(filePath, content);

        const result = parsePlaintextFile(filePath);

        expect(result.title).toBe('Add a new login page');
        expect(result.content).toContain('Users should be able to log in');
      });

      it('should use filename as title fallback when content has no clear title', () => {
        const filePath = path.join(tempDir, 'implement-user-dashboard.txt');
        const content = `This is some plain text content without a clear title line at the start. It's a full sentence with punctuation.

Just some implementation details here.
- Point 1
- Point 2
`;
        fs.writeFileSync(filePath, content);

        const result = parsePlaintextFile(filePath);

        // Should derive title from filename: "implement-user-dashboard.txt" -> "Implement User Dashboard"
        expect(result.title).toBe('Implement User Dashboard');
      });

      it('should use first line as title when it looks like a title', () => {
        const filePath = path.join(tempDir, 'story.txt');
        const content = `Fix critical security vulnerability

There is a SQL injection vulnerability in the user search endpoint.
We need to sanitize all user inputs.
`;
        fs.writeFileSync(filePath, content);

        const result = parsePlaintextFile(filePath);

        expect(result.title).toBe('Fix critical security vulnerability');
      });

      it('should handle empty lines at the beginning', () => {
        const filePath = path.join(tempDir, 'with-empty-lines.txt');
        const content = `

Refactor database layer

This story is about improving the database abstraction.
`;
        fs.writeFileSync(filePath, content);

        const result = parsePlaintextFile(filePath);

        expect(result.title).toBe('Refactor database layer');
      });

      it('should preserve plain text formatting', () => {
        const filePath = path.join(tempDir, 'formatted.txt');
        const content = `Implementation Notes

1. First step
2. Second step
   - Sub-point a
   - Sub-point b
3. Third step

Technical details:
    indented code-like content
    more indented content
`;
        fs.writeFileSync(filePath, content);

        const result = parsePlaintextFile(filePath);

        // Verify indentation is preserved
        expect(result.content).toContain('   - Sub-point a');
        expect(result.content).toContain('    indented code-like content');
      });
    });
  });

  describe('File Validation', () => {
    describe('validateFile', () => {
      it('should reject empty files', () => {
        const filePath = path.join(tempDir, 'empty.md');
        fs.writeFileSync(filePath, '');

        const result = validateFile(filePath);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('empty');
      });

      it('should reject files with only whitespace', () => {
        const filePath = path.join(tempDir, 'whitespace.md');
        fs.writeFileSync(filePath, '   \n\n\t\t\n   ');

        const result = validateFile(filePath);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('empty');
      });

      it('should reject files over 5MB', () => {
        const filePath = path.join(tempDir, 'large.md');
        // Create a file just over 5MB
        const fiveMB = 5 * 1024 * 1024;
        const largeContent = '# Large File\n' + 'x'.repeat(fiveMB + 100);
        fs.writeFileSync(filePath, largeContent);

        const result = validateFile(filePath);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('5MB');
      });

      it('should accept files at exactly 5MB', () => {
        const filePath = path.join(tempDir, 'exactly-5mb.md');
        // Create a file exactly at 5MB boundary
        const fiveMB = 5 * 1024 * 1024;
        const header = '# Exact Size File\n';
        const content = header + 'x'.repeat(fiveMB - header.length);
        fs.writeFileSync(filePath, content);

        const result = validateFile(filePath);

        expect(result.valid).toBe(true);
      });

      it('should reject unsupported extensions (.pdf)', () => {
        const filePath = path.join(tempDir, 'document.pdf');
        fs.writeFileSync(filePath, '%PDF-1.4 fake pdf content');

        const result = validateFile(filePath);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('.pdf');
        expect(result.error).toContain('Unsupported');
      });

      it('should reject unsupported extensions (.docx)', () => {
        const filePath = path.join(tempDir, 'document.docx');
        fs.writeFileSync(filePath, 'fake docx content');

        const result = validateFile(filePath);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('.docx');
      });

      it('should reject unsupported extensions (.html)', () => {
        const filePath = path.join(tempDir, 'page.html');
        fs.writeFileSync(filePath, '<html><body>Content</body></html>');

        const result = validateFile(filePath);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('.html');
      });

      it('should accept .md files', () => {
        const filePath = path.join(tempDir, 'story.md');
        fs.writeFileSync(filePath, '# Valid Story\n\nContent here.');

        const result = validateFile(filePath);

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept .txt files', () => {
        const filePath = path.join(tempDir, 'story.txt');
        fs.writeFileSync(filePath, 'Valid story content');

        const result = validateFile(filePath);

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should handle case-insensitive extensions', () => {
        const filePath = path.join(tempDir, 'story.MD');
        fs.writeFileSync(filePath, '# Valid Story\n\nContent.');

        const result = validateFile(filePath);

        expect(result.valid).toBe(true);
      });

      it('should reject files with no extension', () => {
        const filePath = path.join(tempDir, 'noextension');
        fs.writeFileSync(filePath, 'Some content without extension');

        const result = validateFile(filePath);

        expect(result.valid).toBe(false);
      });
    });
  });

  describe('Unified File Parsing', () => {
    describe('parseFileToStory', () => {
      it('should route .md files to markdown parser', () => {
        const filePath = path.join(tempDir, 'feature.md');
        const content = `---
title: Feature from MD
---

# Feature from MD

Some content.
`;
        fs.writeFileSync(filePath, content);

        const result = parseFileToStory(filePath, tempDir);

        expect(result.title).toBe('Feature from MD');
        expect(result.frontmatter).toBeDefined();
      });

      it('should route .txt files to plaintext parser', () => {
        const filePath = path.join(tempDir, 'feature.txt');
        const content = `Feature from TXT

This is plain text content.
`;
        fs.writeFileSync(filePath, content);

        const result = parseFileToStory(filePath, tempDir);

        expect(result.title).toBe('Feature from TXT');
        expect(result.frontmatter).toBeUndefined();
      });

      it('should validate file before parsing', () => {
        const filePath = path.join(tempDir, 'invalid.pdf');
        fs.writeFileSync(filePath, 'fake pdf');

        expect(() => parseFileToStory(filePath, tempDir)).toThrow(
          'Unsupported file type'
        );
      });

      it('should throw for non-existent files', () => {
        const filePath = path.join(tempDir, 'does-not-exist.md');

        expect(() => parseFileToStory(filePath, tempDir)).toThrow('File not found');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with special characters in name', () => {
      const filePath = path.join(tempDir, 'story with spaces & symbols!.md');
      fs.writeFileSync(filePath, '# Story Title\n\nContent');

      expect(() => parseMarkdownFile(filePath)).not.toThrow();
    });

    it('should handle files with unicode content', () => {
      const filePath = path.join(tempDir, 'unicode.md');
      const content = `# Feature with Unicode

Support for internationalization including:
- Japanese: ファイル
- Chinese: 文件
- Arabic: ملف
- Emoji: 🚀📁
`;
      fs.writeFileSync(filePath, content);

      const result = parseMarkdownFile(filePath);

      expect(result.content).toContain('ファイル');
      expect(result.content).toContain('文件');
    });

    it('should handle markdown with Windows line endings (CRLF)', () => {
      const filePath = path.join(tempDir, 'windows.md');
      const content =
        '# Windows Story\r\n\r\n## Summary\r\n\r\nContent with CRLF.\r\n';
      fs.writeFileSync(filePath, content);

      const result = parseMarkdownFile(filePath);

      expect(result.title).toBe('Windows Story');
    });

    it('should handle very long titles gracefully', () => {
      const filePath = path.join(tempDir, 'long-title.md');
      const longTitle = 'A'.repeat(500);
      const content = `# ${longTitle}\n\nContent`;
      fs.writeFileSync(filePath, content);

      const result = parseMarkdownFile(filePath);

      // Title should be extracted even if very long
      expect(result.title).toBe(longTitle);
    });
  });
});
