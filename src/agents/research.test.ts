import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  shouldPerformWebResearch,
  evaluateFAR,
  sanitizeWebResearchContent,
  sanitizeForLogging,
  sanitizeCodebaseContext,
  gatherCodebaseContext
} from './research.js';
import { Story } from '../types/index.js';
import fs from 'fs';
import { glob } from 'glob';

describe('shouldPerformWebResearch', () => {
  let mockStory: Story;

  beforeEach(() => {
    mockStory = {
      path: '/test/story.md',
      slug: 'test-story',
      frontmatter: {
        id: 'S-001',
        title: 'Test Story',
        slug: 'test-story',
        priority: 10,
        status: 'in-progress',
        type: 'feature',
        created: '2024-01-01',
        labels: [],
        research_complete: false,
        plan_complete: false,
        implementation_complete: false,
        reviews_complete: false,
      },
      content: 'Test story content',
    };
  });

  it('should return true when story mentions external library', () => {
    mockStory.content = 'We need to integrate the Stripe API for payments';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should return true when story mentions API integration', () => {
    mockStory.content = 'Add API endpoint for user authentication';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should return true when story mentions framework', () => {
    mockStory.content = 'Use React Query framework for data fetching';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should return true when story mentions best practices', () => {
    mockStory.content = 'Follow best practices for error handling';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should return true when story mentions npm package', () => {
    mockStory.content = 'Install the npm package for date formatting';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should return true when story mentions external keyword', () => {
    mockStory.content = 'Integrate third-party authentication provider';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should return true when npm dependency mentioned with package.json context', () => {
    mockStory.content = 'Install new npm dependency for logging';
    const codebaseContext = '=== package.json ===\n{"dependencies": {}}';
    const result = shouldPerformWebResearch(mockStory, codebaseContext);
    expect(result).toBe(true);
  });

  it('should return false for purely internal refactoring', () => {
    mockStory.content = 'Refactor internal utility functions';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(false);
  });

  it('should return false when moving internal functions', () => {
    mockStory.content = 'Move function to different internal module';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(false);
  });

  it('should return false when renaming variables', () => {
    mockStory.content = 'Rename variable from oldName to newName';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(false);
  });

  it('should return false when no external dependencies mentioned', () => {
    mockStory.content = 'Update the calculation logic in the utility';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(false);
  });

  it('should handle empty story content gracefully', () => {
    mockStory.content = '';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(false);
  });

  it('should check title as well as content', () => {
    mockStory.frontmatter.title = 'Integrate Stripe API';
    mockStory.content = 'Payment processing feature';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(true);
  });

  it('should prioritize internal keywords over external', () => {
    mockStory.content = 'Refactor internal API utility functions';
    const result = shouldPerformWebResearch(mockStory, '');
    expect(result).toBe(false);
  });
});

describe('evaluateFAR', () => {
  it('should parse valid FAR scores correctly', () => {
    const finding = `### React Query Documentation
**Source**: Context7 - React Query
**FAR Score**: Factuality: 5, Actionability: 4, Relevance: 5
**Justification**: Official documentation provides verified API examples directly applicable to our data fetching needs.

[Finding content here...]`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(5);
    expect(result.actionability).toBe(4);
    expect(result.relevance).toBe(5);
    expect(result.justification).toBe('Official documentation provides verified API examples directly applicable to our data fetching needs.');
    expect(result.parsingSucceeded).toBe(true);
  });

  it('should parse FAR scores with different formatting', () => {
    const finding = `**FAR Score**: Factuality: 3, Actionability: 5, Relevance: 4
**Justification**: Community best practices from Stack Overflow with code examples.`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(3);
    expect(result.actionability).toBe(5);
    expect(result.relevance).toBe(4);
    expect(result.justification).toContain('Community best practices');
    expect(result.parsingSucceeded).toBe(true);
  });

  it('should handle multiline justification', () => {
    const finding = `**FAR Score**: Factuality: 4, Actionability: 3, Relevance: 5
**Justification**: This finding provides detailed information
that spans multiple lines and contains
important context.

Next section starts here.`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(4);
    expect(result.actionability).toBe(3);
    expect(result.relevance).toBe(5);
    expect(result.justification).toContain('multiple lines');
    expect(result.parsingSucceeded).toBe(true);
  });

  it('should return default scores when FAR scores are missing', () => {
    const finding = `### Some Finding
This finding has no FAR scores.`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(2);
    expect(result.actionability).toBe(2);
    expect(result.relevance).toBe(2);
    expect(result.justification).toContain('FAR scores could not be parsed');
    expect(result.parsingSucceeded).toBe(false);
  });

  it('should return default scores when FAR scores are out of range', () => {
    const finding = `**FAR Score**: Factuality: 10, Actionability: 0, Relevance: 3
**Justification**: Invalid scores.`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(2);
    expect(result.actionability).toBe(2);
    expect(result.relevance).toBe(2);
    expect(result.parsingSucceeded).toBe(false);
  });

  it('should handle missing justification', () => {
    const finding = `**FAR Score**: Factuality: 5, Actionability: 4, Relevance: 5`;

    const result = evaluateFAR(finding);
    // Should use defaults because justification is required
    expect(result.factuality).toBe(2);
    expect(result.actionability).toBe(2);
    expect(result.relevance).toBe(2);
    expect(result.parsingSucceeded).toBe(false);
  });

  it('should handle malformed input gracefully', () => {
    const finding = `Completely unstructured finding text with no format.`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(2);
    expect(result.actionability).toBe(2);
    expect(result.relevance).toBe(2);
    expect(result.parsingSucceeded).toBe(false);
  });

  it('should handle empty input', () => {
    const finding = '';

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(2);
    expect(result.actionability).toBe(2);
    expect(result.relevance).toBe(2);
    expect(result.parsingSucceeded).toBe(false);
  });

  it('should validate all scores are in 1-5 range', () => {
    const finding = `**FAR Score**: Factuality: 1, Actionability: 2, Relevance: 5
**Justification**: Valid range test.`;

    const result = evaluateFAR(finding);
    expect(result.factuality).toBe(1);
    expect(result.actionability).toBe(2);
    expect(result.relevance).toBe(5);
    expect(result.parsingSucceeded).toBe(true);
  });

  it('should truncate extremely long input to prevent ReDoS', () => {
    const finding = 'a'.repeat(15000) + `**FAR Score**: Factuality: 4, Actionability: 4, Relevance: 4
**Justification**: This comes after 15KB of text.`;

    const result = evaluateFAR(finding);
    // Should still process without hanging or crashing
    expect(result).toBeDefined();
    expect(result.parsingSucceeded).toBeDefined();
  });
});

describe('Web Research Content Sanitization', () => {
  describe('sanitizeWebResearchContent', () => {
    it('should remove ANSI escape sequences', () => {
      const input = '\x1b[31mRed text\x1b[0m and \x1b[1;32mbold green\x1b[0m';
      const result = sanitizeWebResearchContent(input);
      expect(result).toBe('Red text and bold green');
      expect(result).not.toContain('\x1b');
    });

    it('should remove control characters', () => {
      const input = 'Hello\x00World\x0ETest\x1FEnd';
      const result = sanitizeWebResearchContent(input);
      expect(result).toBe('HelloWorldTestEnd');
    });

    it('should normalize Unicode to NFC form', () => {
      // "é" as combining character (e + combining acute) vs precomposed
      const combining = 'e\u0301'; // e + combining acute accent
      const result = sanitizeWebResearchContent(combining);
      expect(result).toBe('\u00e9'); // precomposed é
    });

    it('should escape triple backticks to prevent markdown injection', () => {
      const input = 'Here is code: ```javascript\nconsole.log("exploit");\n```';
      const result = sanitizeWebResearchContent(input);
      expect(result).toContain('\\`\\`\\`');
      expect(result).not.toContain('```');
    });

    it('should truncate extremely long input', () => {
      const input = 'a'.repeat(15000);
      const result = sanitizeWebResearchContent(input);
      expect(result.length).toBe(10000);
    });

    it('should handle null and undefined input gracefully', () => {
      expect(sanitizeWebResearchContent('')).toBe('');
      expect(sanitizeWebResearchContent(null as any)).toBe('');
      expect(sanitizeWebResearchContent(undefined as any)).toBe('');
    });

    it('should remove OSC sequences (hyperlinks)', () => {
      const input = 'Link: \x1b]8;;https://example.com\x07click here\x1b]8;;\x07';
      const result = sanitizeWebResearchContent(input);
      expect(result).toBe('Link: click here');
      expect(result).not.toContain('\x1b');
    });

    it('should preserve valid markdown formatting', () => {
      const input = '# Heading\n\n**Bold** and *italic* text.\n\n- List item';
      const result = sanitizeWebResearchContent(input);
      expect(result).toContain('# Heading');
      expect(result).toContain('**Bold**');
      expect(result).toContain('*italic*');
      expect(result).toContain('- List item');
    });

    it('should handle mixed ANSI and control characters', () => {
      const input = '\x1b[31mRed\x00\x1b[0m\x0E\x1FText';
      const result = sanitizeWebResearchContent(input);
      expect(result).toBe('RedText');
    });

    it('should remove bell character (0x07)', () => {
      const input = 'Alert\x07Message';
      const result = sanitizeWebResearchContent(input);
      expect(result).toBe('AlertMessage');
    });
  });

  describe('sanitizeForLogging', () => {
    it('should replace newlines with spaces to prevent log injection', () => {
      const input = 'Line1\nLine2\rLine3\r\nLine4';
      const result = sanitizeForLogging(input);
      expect(result).toBe('Line1 Line2 Line3  Line4');
      expect(result).not.toContain('\n');
      expect(result).not.toContain('\r');
    });

    it('should truncate long strings to 200 chars', () => {
      const input = 'a'.repeat(500);
      const result = sanitizeForLogging(input);
      expect(result.length).toBeLessThanOrEqual(203); // 200 + '...'
      expect(result).toContain('...');
    });

    it('should remove ANSI escape sequences', () => {
      const input = '\x1b[31mError:\x1b[0m Something failed';
      const result = sanitizeForLogging(input);
      expect(result).toBe('Error: Something failed');
      expect(result).not.toContain('\x1b');
    });

    it('should handle null and undefined input gracefully', () => {
      expect(sanitizeForLogging('')).toBe('');
      expect(sanitizeForLogging(null as any)).toBe('');
      expect(sanitizeForLogging(undefined as any)).toBe('');
    });

    it('should trim whitespace', () => {
      const input = '  \n  Log message  \n  ';
      const result = sanitizeForLogging(input);
      expect(result).toBe('Log message');
    });

    it('should prevent fake log entry injection', () => {
      const input = 'User input\n[INFO] Fake log entry\n[ERROR] Fake error';
      const result = sanitizeForLogging(input);
      expect(result).toBe('User input [INFO] Fake log entry [ERROR] Fake error');
      // Verify it's a single line now
      expect(result.split('\n').length).toBe(1);
    });
  });

  describe('sanitizeCodebaseContext', () => {
    it('should escape triple backticks', () => {
      const input = 'Code:\n```typescript\nfunction foo() {}\n```';
      const result = sanitizeCodebaseContext(input);
      expect(result).toContain('\\`\\`\\`');
      expect(result).not.toContain('```');
    });

    it('should remove ANSI escape sequences', () => {
      const input = '\x1b[32mGreen code\x1b[0m';
      const result = sanitizeCodebaseContext(input);
      expect(result).toBe('Green code');
    });

    it('should validate UTF-8 boundaries at truncation', () => {
      // Create string with emoji near truncation point
      const input = 'a'.repeat(9998) + '🔥test'; // emoji is 2 code units
      const result = sanitizeCodebaseContext(input);
      expect(result.length).toBeLessThanOrEqual(10000);
      // Verify no broken surrogate pairs
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it('should handle surrogate pairs correctly', () => {
      // High surrogate followed by low surrogate (valid emoji)
      const input = 'a'.repeat(9999) + '\uD83D\uDE00'; // 😀 emoji
      const result = sanitizeCodebaseContext(input);
      // Should not split the surrogate pair
      expect(result.length).toBeLessThanOrEqual(10000);
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it('should handle null and undefined input gracefully', () => {
      expect(sanitizeCodebaseContext('')).toBe('');
      expect(sanitizeCodebaseContext(null as any)).toBe('');
      expect(sanitizeCodebaseContext(undefined as any)).toBe('');
    });

    it('should preserve code structure while sanitizing', () => {
      const input = 'function test() {\n  return "hello";\n}';
      const result = sanitizeCodebaseContext(input);
      expect(result).toContain('function test()');
      expect(result).toContain('return "hello"');
    });

    it('should remove OSC sequences', () => {
      const input = 'Code with \x1b]8;;file:///path\x07link\x1b]8;;\x07';
      const result = sanitizeCodebaseContext(input);
      expect(result).toBe('Code with link');
    });

    it('should truncate to MAX_INPUT_LENGTH', () => {
      const input = 'x'.repeat(15000);
      const result = sanitizeCodebaseContext(input);
      expect(result.length).toBe(10000);
    });
  });
});

// Mock modules for gatherCodebaseContext tests
vi.mock('fs');
vi.mock('glob');

describe('gatherCodebaseContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should include project configuration files in context', async () => {
    // Mock fs.existsSync to return true for package.json
    vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) => {
      const pathStr = String(filePath);
      return pathStr.includes('package.json');
    });

    // Mock fs.readFileSync to return package.json content
    vi.mocked(fs.readFileSync).mockReturnValue('{"name": "test-project"}');

    // Mock fs.readdirSync for directory listing
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    // Mock glob to return empty arrays
    vi.mocked(glob).mockResolvedValue([]);

    const result = await gatherCodebaseContext('/test/project/.ai-sdlc');

    expect(result).toContain('package.json');
    expect(result).toContain('test-project');
  });

  it('should include test files in context', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    // Mock glob to return test files
    vi.mocked(glob).mockImplementation(async (pattern: string) => {
      if (pattern.includes('.test.')) {
        return ['src/core/story.test.ts', 'src/agents/research.test.ts'];
      }
      if (pattern.includes('{tests,test,__tests__}')) {
        return ['tests/integration/cli.test.ts'];
      }
      return [];
    });

    const result = await gatherCodebaseContext('/test/project/.ai-sdlc');

    expect(result).toContain('Test Files');
    expect(result).toContain('story.test.ts');
    expect(result).toContain('research.test.ts');
  });

  it('should include config files in context', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    // Mock glob to return config files
    vi.mocked(glob).mockImplementation(async (pattern: string) => {
      if (pattern.includes('.config.')) {
        return ['vitest.config.ts', 'eslint.config.js'];
      }
      if (pattern.includes('eslintrc') || pattern.includes('prettierrc')) {
        return ['.eslintrc.json'];
      }
      return [];
    });

    const result = await gatherCodebaseContext('/test/project/.ai-sdlc');

    expect(result).toContain('Config Files');
    expect(result).toContain('vitest.config.ts');
  });

  it('should include source files in context', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    // Mock glob to return source files
    vi.mocked(glob).mockImplementation(async (pattern: string) => {
      if (pattern.includes('src/**/*.')) {
        return ['src/index.ts', 'src/core/story.ts', 'src/agents/research.ts'];
      }
      return [];
    });

    const result = await gatherCodebaseContext('/test/project/.ai-sdlc');

    expect(result).toContain('Source Files');
    expect(result).toContain('src/index.ts');
    expect(result).toContain('src/core/story.ts');
  });

  it('should include directory structure in context', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    // Mock fs.readdirSync to return directory entries
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'src', isDirectory: () => true, isFile: () => false } as unknown as fs.Dirent,
      { name: 'tests', isDirectory: () => true, isFile: () => false } as unknown as fs.Dirent,
      { name: 'README.md', isDirectory: () => false, isFile: () => true } as unknown as fs.Dirent,
    ]);

    vi.mocked(glob).mockResolvedValue([]);

    const result = await gatherCodebaseContext('/test/project/.ai-sdlc');

    expect(result).toContain('Directory Structure');
    expect(result).toContain('src');
    expect(result).toContain('tests');
    expect(result).toContain('README.md');
  });

  it('should limit source files to 20 entries', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    // Mock glob to return more than 20 source files
    const manyFiles = Array.from({ length: 30 }, (_, i) => `src/file${i}.ts`);
    vi.mocked(glob).mockImplementation(async (pattern: string) => {
      if (pattern.includes('src/**/*.')) {
        return manyFiles;
      }
      return [];
    });

    const result = await gatherCodebaseContext('/test/project/.ai-sdlc');

    // Count occurrences of "file" in result to verify limiting
    const fileMatches = result.match(/file\d+\.ts/g) || [];
    expect(fileMatches.length).toBeLessThanOrEqual(20);
  });

  it('should limit test files to 15 entries', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    // Mock glob to return more than 15 test files
    const manyTestFiles = Array.from({ length: 25 }, (_, i) => `src/test${i}.test.ts`);
    vi.mocked(glob).mockImplementation(async (pattern: string) => {
      if (pattern.includes('.test.')) {
        return manyTestFiles;
      }
      return [];
    });

    const result = await gatherCodebaseContext('/test/project/.ai-sdlc');

    // Count test file occurrences
    const testMatches = result.match(/test\d+\.test\.ts/g) || [];
    expect(testMatches.length).toBeLessThanOrEqual(15);
  });

  it('should handle missing directories gracefully', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    vi.mocked(glob).mockResolvedValue([]);

    const result = await gatherCodebaseContext('/test/project/.ai-sdlc');

    expect(result).toBe('No codebase context available.');
  });

  it('should handle glob errors gracefully', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(glob).mockRejectedValue(new Error('Glob error'));

    const result = await gatherCodebaseContext('/test/project/.ai-sdlc');

    // Should not throw - directory structure still gets added even if empty
    // because fs.readdirSync doesn't throw here
    expect(result).toContain('Directory Structure');
    // But should NOT contain Source Files, Test Files, or Config Files sections
    // since those globs failed
    expect(result).not.toContain('Source Files');
    expect(result).not.toContain('Test Files');
    expect(result).not.toContain('Config Files');
  });

  it('should truncate project file content to 1000 characters', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // Return a very long package.json content
    const longContent = 'x'.repeat(2000);
    vi.mocked(fs.readFileSync).mockReturnValue(longContent);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(glob).mockResolvedValue([]);

    const result = await gatherCodebaseContext('/test/project/.ai-sdlc');

    // The content should be truncated - find the package.json section
    const packageSection = result.split('===').find(s => s.includes('package.json'));
    if (packageSection) {
      // The truncated content should not include the full 2000 chars
      expect(packageSection.length).toBeLessThan(1500);
    }
  });

  it('should deduplicate test files from different sources', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    // Mock glob to return overlapping test files
    vi.mocked(glob).mockImplementation(async (pattern: string) => {
      if (pattern.includes('.test.')) {
        return ['src/story.test.ts', 'tests/story.test.ts'];
      }
      if (pattern.includes('{tests,test,__tests__}')) {
        return ['tests/story.test.ts', 'tests/other.test.ts'];
      }
      return [];
    });

    const result = await gatherCodebaseContext('/test/project/.ai-sdlc');

    // 'tests/story.test.ts' should only appear once due to Set deduplication
    const matches = result.match(/tests\/story\.test\.ts/g) || [];
    expect(matches.length).toBe(1);
  });
});
