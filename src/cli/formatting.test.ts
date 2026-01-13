import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  truncateText,
  formatLabels,
  getTerminalWidth,
  shouldUseCompactView,
  getColumnWidths,
  stripAnsiCodes,
  sanitizeInput,
  ColumnWidths,
  formatSummaryStatus,
  formatElapsedTime,
  formatCompactStoryCompletion,
  getKanbanColumnWidth,
  padColumnToHeight,
} from './formatting.js';

describe('formatting utilities', () => {
  // Store original process.stdout.columns
  let originalColumns: number | undefined;

  beforeEach(() => {
    originalColumns = process.stdout.columns;
  });

  afterEach(() => {
    process.stdout.columns = originalColumns;
  });

  describe('truncateText', () => {
    it('should not truncate text shorter than maxLength', () => {
      expect(truncateText('Short text', 20)).toBe('Short text');
    });

    it('should truncate text exactly at maxLength', () => {
      expect(truncateText('This is exactly 20!!', 20)).toBe('This is exactly 20!!');
    });

    it('should truncate long text with ellipsis', () => {
      const longText = 'This is a very long text that needs to be truncated';
      const result = truncateText(longText, 30);
      expect(result.length).toBeLessThanOrEqual(30);
      expect(result).toContain('...');
    });

    it('should truncate at word boundary when possible', () => {
      const text = 'This is a very long sentence that needs truncation';
      const result = truncateText(text, 20);
      expect(result).toContain('...');
      // Should truncate at a word boundary, not mid-word
      // "This is a very long..." (cut mid-word) vs "This is a very..." (at boundary)
      const withoutEllipsis = result.replace('...', '');
      // Verify we cut at a space boundary - last char before "..." should be a word char
      // and the truncation should happen after a complete word (e.g., "very" not "ver")
      expect(withoutEllipsis).toMatch(/\s\w+$/); // Should end with space + complete word
    });

    it('should handle empty string', () => {
      expect(truncateText('', 10)).toBe('');
    });

    it('should handle maxLength smaller than 4', () => {
      expect(truncateText('Hello', 2)).toBe('He');
    });

    it('should handle special characters and emojis', () => {
      const text = 'Hello 🚀 World! This is a test with emoji';
      const result = truncateText(text, 20);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should handle Unicode characters correctly', () => {
      const text = '你好世界 Hello World';
      const result = truncateText(text, 15);
      expect(result.length).toBeLessThanOrEqual(15);
      expect(result).toContain('...');
    });
  });

  describe('formatLabels', () => {
    it('should return empty string for empty array', () => {
      expect(formatLabels([], 50)).toBe('');
    });

    it('should return single label as-is if it fits', () => {
      expect(formatLabels(['bug'], 50)).toBe('bug');
    });

    it('should truncate single long label', () => {
      const longLabel = 'this-is-a-very-long-label-that-exceeds-limit';
      const result = formatLabels([longLabel], 20);
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result).toContain('...');
    });

    it('should format multiple labels with commas', () => {
      const result = formatLabels(['bug', 'urgent', 'backend'], 50);
      expect(result).toBe('bug, urgent, backend');
    });

    it('should show "+N more" when labels exceed max length', () => {
      const labels = ['enhancement', 'ui', 'cli', 'status-command', 'formatting'];
      const result = formatLabels(labels, 30);
      expect(result).toContain('+');
      expect(result).toContain('more');
      expect(result.length).toBeLessThanOrEqual(30);
    });

    it('should handle very small maxLength', () => {
      const labels = ['bug', 'urgent'];
      const result = formatLabels(labels, 10);
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should handle labels with special characters', () => {
      const labels = ['bug-fix', 'type:feature', 'priority:high'];
      const result = formatLabels(labels, 40);
      expect(result).toContain('bug-fix');
    });

    it('should truncate at appropriate label boundary', () => {
      const labels = ['short', 'medium-label', 'another-long-label-name', 'extra'];
      const result = formatLabels(labels, 35);
      // Should fit first few labels and show "+N more"
      expect(result).toContain('short');
      if (result.includes('+')) {
        expect(result).toMatch(/\+\d+ more/);
      }
    });
  });

  describe('getTerminalWidth', () => {
    it('should return process.stdout.columns when available', () => {
      process.stdout.columns = 120;
      expect(getTerminalWidth()).toBe(120);
    });

    it('should return default 80 when columns is undefined', () => {
      process.stdout.columns = undefined;
      expect(getTerminalWidth()).toBe(80);
    });

    it('should handle various terminal widths', () => {
      const widths = [80, 100, 120, 200];
      for (const width of widths) {
        process.stdout.columns = width;
        expect(getTerminalWidth()).toBe(width);
      }
    });
  });

  describe('shouldUseCompactView', () => {
    it('should return true for terminal width < 100', () => {
      expect(shouldUseCompactView(80)).toBe(true);
      expect(shouldUseCompactView(90)).toBe(true);
      expect(shouldUseCompactView(99)).toBe(true);
    });

    it('should return false for terminal width >= 100', () => {
      expect(shouldUseCompactView(100)).toBe(false);
      expect(shouldUseCompactView(120)).toBe(false);
      expect(shouldUseCompactView(200)).toBe(false);
    });

    it('should handle edge case at exactly 100 columns', () => {
      expect(shouldUseCompactView(100)).toBe(false);
    });
  });

  describe('getColumnWidths', () => {
    it('should return column widths for standard terminal (120 cols)', () => {
      const widths = getColumnWidths(120);
      expect(widths.id).toBe(10); // S-0001 format (6 chars) + padding
      expect(widths.status).toBe(14);
      expect(widths.labels).toBe(30);
      expect(widths.flags).toBe(8);
      expect(widths.title).toBeGreaterThan(0);
      expect(widths.title).toBeLessThanOrEqual(60); // Capped at 60
    });

    it('should return column widths for wide terminal (200 cols)', () => {
      const widths = getColumnWidths(200);
      expect(widths.title).toBe(60); // Should be capped at 60
    });

    it('should return minimum title width for narrow terminal (80 cols)', () => {
      const widths = getColumnWidths(80);
      expect(widths.title).toBeGreaterThanOrEqual(30); // Minimum
    });

    it('should have consistent fixed column widths', () => {
      const widths1 = getColumnWidths(100);
      const widths2 = getColumnWidths(150);

      expect(widths1.id).toBe(widths2.id);
      expect(widths1.status).toBe(widths2.status);
      expect(widths1.labels).toBe(widths2.labels);
      expect(widths1.flags).toBe(widths2.flags);
    });

    it('should allocate more space to title in wider terminals', () => {
      const widthsNarrow = getColumnWidths(100);
      const widthsWide = getColumnWidths(140);

      expect(widthsWide.title).toBeGreaterThan(widthsNarrow.title);
    });

    it('should respect minimum title width', () => {
      const widths = getColumnWidths(50); // Very narrow
      expect(widths.title).toBeGreaterThanOrEqual(30);
    });
  });

  describe('stripAnsiCodes', () => {
    it('should remove ANSI color codes', () => {
      const colored = '\x1B[31mRed Text\x1B[0m';
      expect(stripAnsiCodes(colored)).toBe('Red Text');
    });

    it('should handle text without ANSI codes', () => {
      const plain = 'Plain text';
      expect(stripAnsiCodes(plain)).toBe('Plain text');
    });

    it('should handle multiple ANSI codes', () => {
      const multiColored = '\x1B[31mRed\x1B[0m \x1B[32mGreen\x1B[0m \x1B[34mBlue\x1B[0m';
      expect(stripAnsiCodes(multiColored)).toBe('Red Green Blue');
    });

    it('should handle bold and other formatting', () => {
      const formatted = '\x1B[1m\x1B[31mBold Red\x1B[0m';
      expect(stripAnsiCodes(formatted)).toBe('Bold Red');
    });

    it('should handle empty string', () => {
      expect(stripAnsiCodes('')).toBe('');
    });
  });

  describe('integration scenarios', () => {
    it('should handle realistic story title truncation', () => {
      const title = 'Improve status output: add story ID column, truncate long text, and format as uniform table view';
      const truncated = truncateText(title, 60);
      expect(truncated.length).toBeLessThanOrEqual(60);
      expect(truncated).toContain('...');
      expect(truncated).toContain('Improve status output');
    });

    it('should format realistic label lists', () => {
      const labels = ['enhancement', 'ui', 'cli', 'status-command', 'formatting', 'table-view'];
      const formatted = formatLabels(labels, 30);
      expect(formatted.length).toBeLessThanOrEqual(30);
      // Should show at least first label
      expect(formatted).toContain('enhancement');
    });

    it('should calculate widths that fit within terminal', () => {
      const termWidth = 120;
      const widths = getColumnWidths(termWidth);
      const totalWidth = widths.id + widths.title + widths.status + widths.labels + widths.flags + 10; // +10 for borders
      expect(totalWidth).toBeLessThanOrEqual(termWidth);
    });
  });

  describe('security - input sanitization', () => {
    describe('sanitizeInput', () => {
      it('should handle extremely long inputs (DoS protection)', () => {
        const veryLongText = 'A'.repeat(100000);
        const result = sanitizeInput(veryLongText);
        expect(result.length).toBeLessThanOrEqual(10000);
      });

      it('should strip terminal escape sequences', () => {
        const malicious = 'Hello\x1B[HWorld\x1B[2J';
        const result = sanitizeInput(malicious);
        expect(result).not.toContain('\x1B[H');
        expect(result).not.toContain('\x1B[2J');
      });

      it('should normalize Unicode to prevent homograph attacks', () => {
        // Cyrillic 'а' vs Latin 'a'
        const text = 'аdmin'; // First character is Cyrillic
        const result = sanitizeInput(text);
        expect(result).toBeTruthy();
      });

      it('should handle null bytes', () => {
        const malicious = 'Hello\x00World';
        const result = sanitizeInput(malicious);
        expect(result).not.toContain('\x00');
      });

      it('should handle OSC hyperlink sequences', () => {
        const malicious = 'Click\x1B]8;;http://evil.com\x07here\x1B]8;;\x07';
        const result = sanitizeInput(malicious);
        expect(result).not.toMatch(/\x1B\]8;/);
      });

      it('should handle empty and null inputs', () => {
        expect(sanitizeInput('')).toBe('');
        expect(sanitizeInput(null as any)).toBe('');
        expect(sanitizeInput(undefined as any)).toBe('');
      });
    });

    describe('stripAnsiCodes - ReDoS protection', () => {
      it('should handle ReDoS attack pattern with many semicolons', () => {
        const malicious = '\x1B[' + ';'.repeat(1000) + 'm';
        const start = Date.now();
        const result = stripAnsiCodes(malicious);
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(100); // Should complete quickly
        expect(result).toBe('');
      });

      it('should handle very long ANSI sequences', () => {
        const malicious = '\x1B[' + '9'.repeat(1000) + 'm';
        const result = stripAnsiCodes(malicious);
        expect(result).toBe('');
      });

      it('should remove C0/C1 control codes', () => {
        const text = 'Hello\x07World\x1B'; // Bell and ESC
        const result = stripAnsiCodes(text);
        expect(result).not.toContain('\x07');
        expect(result).toBe('HelloWorld');
      });
    });

    describe('truncateText - security', () => {
      it('should handle malformed UTF-8 sequences', () => {
        const malformed = 'Hello\uFFFDWorld'; // Replacement character
        const result = truncateText(malformed, 20);
        expect(result).toBeTruthy();
      });

      it('should handle combining characters', () => {
        const text = 'e\u0301'; // e with accent combining
        const result = truncateText(text, 10);
        expect(result).toBeTruthy();
      });

      it('should limit processing of extremely long inputs', () => {
        const veryLong = 'A'.repeat(100000);
        const start = Date.now();
        const result = truncateText(veryLong, 50);
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(1000); // Should complete in reasonable time
        expect(result.length).toBeLessThanOrEqual(50);
      });
    });

    describe('formatLabels - prototype pollution protection', () => {
      it('should filter out __proto__', () => {
        const malicious = ['__proto__', 'safe-label'];
        const result = formatLabels(malicious, 50);
        expect(result).not.toContain('__proto__');
        expect(result).toContain('safe-label');
      });

      it('should filter out constructor', () => {
        const malicious = ['constructor', 'safe-label'];
        const result = formatLabels(malicious, 50);
        expect(result).not.toContain('constructor');
        expect(result).toContain('safe-label');
      });

      it('should filter out prototype', () => {
        const malicious = ['prototype', 'safe-label'];
        const result = formatLabels(malicious, 50);
        expect(result).not.toContain('prototype');
        expect(result).toContain('safe-label');
      });

      it('should handle all dangerous keys together', () => {
        const malicious = ['__proto__', 'constructor', 'prototype', 'safe'];
        const result = formatLabels(malicious, 50);
        expect(result).toBe('safe');
      });

      it('should handle only dangerous keys (return empty)', () => {
        const malicious = ['__proto__', 'constructor', 'prototype'];
        const result = formatLabels(malicious, 50);
        expect(result).toBe('');
      });

      it('should sanitize label content for terminal escapes', () => {
        const malicious = ['label\x1B[H', 'safe'];
        const result = formatLabels(malicious, 50);
        expect(result).not.toContain('\x1B[H');
      });

      it('should filter out uppercase variations (__PROTO__, CONSTRUCTOR)', () => {
        const malicious = ['__PROTO__', 'CONSTRUCTOR', 'safe-label'];
        const result = formatLabels(malicious, 50);
        expect(result).not.toContain('__PROTO__');
        expect(result).not.toContain('CONSTRUCTOR');
        expect(result).toContain('safe-label');
      });

      it('should filter out variations with spaces (__proto__ with trim)', () => {
        const malicious = [' __proto__ ', ' constructor ', 'safe-label'];
        const result = formatLabels(malicious, 50);
        expect(result).not.toContain('__proto__');
        expect(result).not.toContain('constructor');
        expect(result).toContain('safe-label');
      });
    });
  });

  describe('Unicode handling edge cases', () => {
    it('should handle emojis with correct width calculation', () => {
      const text = '🚀 Deploy feature';
      const result = truncateText(text, 15);
      expect(result).toBeTruthy();
    });

    it('should handle CJK characters', () => {
      const text = '你好世界 こんにちは 안녕하세요';
      const result = truncateText(text, 20);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should handle mixed emoji and text', () => {
      const text = 'Fix 🐛 in 🔐 auth';
      const result = truncateText(text, 15);
      expect(result).toBeTruthy();
    });

    it('should handle zero-width characters', () => {
      const text = 'Hello\u200BWorld'; // Zero-width space
      const result = truncateText(text, 20);
      expect(result).toBeTruthy();
    });
  });

  describe('daemon formatting helpers', () => {
    describe('formatSummaryStatus', () => {
      it('should return idle when all counters are zero', () => {
        const stats = { done: 0, active: 0, queued: 0, blocked: 0 };
        expect(formatSummaryStatus(stats)).toBe('idle');
      });

      it('should show only done when done > 0 and others are zero', () => {
        const stats = { done: 5, active: 0, queued: 0, blocked: 0 };
        expect(formatSummaryStatus(stats)).toBe('5 done');
      });

      it('should show only active when active > 0 and others are zero', () => {
        const stats = { done: 0, active: 1, queued: 0, blocked: 0 };
        expect(formatSummaryStatus(stats)).toBe('1 active');
      });

      it('should show multiple stats separated by pipes', () => {
        const stats = { done: 3, active: 1, queued: 2, blocked: 0 };
        expect(formatSummaryStatus(stats)).toBe('3 done | 1 active | 2 queued');
      });

      it('should include blocked when blocked > 0', () => {
        const stats = { done: 2, active: 0, queued: 1, blocked: 1 };
        expect(formatSummaryStatus(stats)).toBe('2 done | 1 queued | 1 blocked');
      });

      it('should show all stats when all are greater than zero', () => {
        const stats = { done: 5, active: 2, queued: 3, blocked: 1 };
        expect(formatSummaryStatus(stats)).toBe('5 done | 2 active | 3 queued | 1 blocked');
      });
    });

    describe('formatElapsedTime', () => {
      it('should format milliseconds to seconds when less than 60000ms', () => {
        expect(formatElapsedTime(42000)).toBe('42s');
      });

      it('should format 0 milliseconds', () => {
        expect(formatElapsedTime(0)).toBe('0s');
      });

      it('should format 1 second', () => {
        expect(formatElapsedTime(1000)).toBe('1s');
      });

      it('should format time in minutes and seconds when >= 60000ms', () => {
        expect(formatElapsedTime(150000)).toBe('2m 30s');
      });

      it('should format exactly 1 minute', () => {
        expect(formatElapsedTime(60000)).toBe('1m 0s');
      });

      it('should format exactly 2 minutes', () => {
        expect(formatElapsedTime(120000)).toBe('2m 0s');
      });

      it('should format 5 minutes and 45 seconds', () => {
        expect(formatElapsedTime(345000)).toBe('5m 45s');
      });

      it('should round down to nearest second', () => {
        expect(formatElapsedTime(1500)).toBe('1s');
      });

      it('should handle large time values', () => {
        expect(formatElapsedTime(3661000)).toBe('61m 1s');
      });
    });

    describe('formatCompactStoryCompletion', () => {
      it('should format story with basic values', () => {
        const result = formatCompactStoryCompletion('story-123', 5, 42000);
        expect(result).toContain('✓');
        expect(result).toContain('story-123');
        expect(result).toContain('5 actions');
        expect(result).toContain('42s');
      });

      it('should include brackets around metrics', () => {
        const result = formatCompactStoryCompletion('story-456', 3, 90000);
        expect(result).toMatch(/\[\d+ actions · [\d\w\s]+\]/);
      });

      it('should truncate long story IDs', () => {
        const longId = 'very-long-story-identifier-with-many-characters-that-exceeds-thirty-chars';
        const result = formatCompactStoryCompletion(longId, 2, 5000);
        expect(result).toContain('...');
      });

      it('should preserve short story IDs without truncation', () => {
        const result = formatCompactStoryCompletion('short-id', 1, 1000);
        expect(result).toContain('short-id');
        expect(result).not.toContain('short-id...');
      });

      it('should format zero actions', () => {
        const result = formatCompactStoryCompletion('story-789', 0, 2000);
        expect(result).toContain('0 actions');
      });

      it('should use minute format for longer elapsed times', () => {
        const result = formatCompactStoryCompletion('story-101', 10, 125000);
        expect(result).toContain('2m 5s');
      });

      it('should include dot separator between actions and time', () => {
        const result = formatCompactStoryCompletion('story-202', 4, 30000);
        expect(result).toContain(' · ');
      });

      it('should format multiple action counts correctly', () => {
        const result1 = formatCompactStoryCompletion('story-1', 1, 5000);
        const result2 = formatCompactStoryCompletion('story-2', 999, 5000);
        expect(result1).toContain('1 actions');
        expect(result2).toContain('999 actions');
      });
    });
  });

  describe('kanban layout utilities', () => {
    describe('getKanbanColumnWidth', () => {
      it('should calculate width for 4 columns on 120-col terminal', () => {
        const width = getKanbanColumnWidth(120, 4);
        // Formula: (termWidth - borders - padding) / numCols
        // borders = (4 - 1) * 1 = 3
        // padding = 4 * 2 = 8
        // available = 120 - 3 - 8 = 109
        // width per column = floor(109 / 4) = 27
        expect(width).toBe(27);
      });

      it('should calculate width for 4 columns on 80-col terminal', () => {
        const width = getKanbanColumnWidth(80, 4);
        // Formula: (80 - 3 - 8) / 4 = 69 / 4 = 17.25 -> floor = 17
        expect(width).toBe(17);
      });

      it('should handle 2 columns', () => {
        const width = getKanbanColumnWidth(100, 2);
        // borders = (2 - 1) * 1 = 1
        // padding = 2 * 2 = 4
        // available = 100 - 1 - 4 = 95
        // width per column = floor(95 / 2) = 47
        expect(width).toBe(47);
      });

      it('should handle single column', () => {
        const width = getKanbanColumnWidth(80, 1);
        // borders = 0, padding = 2
        // available = 80 - 0 - 2 = 78
        expect(width).toBe(78);
      });

      it('should return positive width even for very narrow terminals', () => {
        const width = getKanbanColumnWidth(40, 4);
        expect(width).toBeGreaterThan(0);
      });

      it('should allocate more width per column on wider terminals', () => {
        const width80 = getKanbanColumnWidth(80, 4);
        const width120 = getKanbanColumnWidth(120, 4);
        const width200 = getKanbanColumnWidth(200, 4);
        expect(width120).toBeGreaterThan(width80);
        expect(width200).toBeGreaterThan(width120);
      });
    });

    describe('padColumnToHeight', () => {
      it('should not pad array already at max height', () => {
        const items = ['item1', 'item2', 'item3'];
        const result = padColumnToHeight(items, 3);
        expect(result).toEqual(['item1', 'item2', 'item3']);
      });

      it('should pad array shorter than max height', () => {
        const items = ['item1'];
        const result = padColumnToHeight(items, 3);
        expect(result).toHaveLength(3);
        expect(result[0]).toBe('item1');
        expect(result[1]).toBe('');
        expect(result[2]).toBe('');
      });

      it('should pad empty array to max height', () => {
        const items: string[] = [];
        const result = padColumnToHeight(items, 3);
        expect(result).toHaveLength(3);
        expect(result).toEqual(['', '', '']);
      });

      it('should handle maxHeight of 0', () => {
        const items = ['item1'];
        const result = padColumnToHeight(items, 0);
        expect(result).toEqual(['item1']);
      });

      it('should not truncate array longer than max height', () => {
        const items = ['item1', 'item2', 'item3', 'item4'];
        const result = padColumnToHeight(items, 2);
        expect(result).toHaveLength(4);
        expect(result).toEqual(['item1', 'item2', 'item3', 'item4']);
      });

      it('should create new array (not mutate original)', () => {
        const items = ['item1'];
        const result = padColumnToHeight(items, 3);
        expect(items).toHaveLength(1);
        expect(result).toHaveLength(3);
        expect(items).not.toBe(result);
      });

      it('should handle maxHeight of 1', () => {
        const items: string[] = [];
        const result = padColumnToHeight(items, 1);
        expect(result).toEqual(['']);
      });
    });
  });
});
