import { describe, it, expect } from 'vitest';
import {
  formatBatchProgress,
  formatBatchSummary,
  BatchProgress,
  BatchResult,
} from './batch-processor.js';

describe('batch-processor utilities', () => {
  describe('formatBatchProgress', () => {
    it('should format progress with story information', () => {
      const progress: BatchProgress = {
        currentIndex: 0,
        total: 3,
        currentStory: {
          path: '/test/S-001/story.md',
          frontmatter: {
            id: 'S-001',
            title: 'Add user authentication',
            status: 'backlog',
          },
          slug: 's-001',
        } as any,
      };

      const result = formatBatchProgress(progress);
      expect(result).toBe('[1/3] Processing: S-001 - Add user authentication');
    });

    it('should handle different index positions', () => {
      const progress: BatchProgress = {
        currentIndex: 1,
        total: 5,
        currentStory: {
          path: '/test/S-002/story.md',
          frontmatter: {
            id: 'S-002',
            title: 'Fix login bug',
            status: 'in-progress',
          },
          slug: 's-002',
        } as any,
      };

      const result = formatBatchProgress(progress);
      expect(result).toBe('[2/5] Processing: S-002 - Fix login bug');
    });

    it('should handle last story in batch', () => {
      const progress: BatchProgress = {
        currentIndex: 2,
        total: 3,
        currentStory: {
          path: '/test/S-003/story.md',
          frontmatter: {
            id: 'S-003',
            title: 'Add dark mode',
            status: 'ready',
          },
          slug: 's-003',
        } as any,
      };

      const result = formatBatchProgress(progress);
      expect(result).toBe('[3/3] Processing: S-003 - Add dark mode');
    });

    it('should handle null story', () => {
      const progress: BatchProgress = {
        currentIndex: 0,
        total: 1,
        currentStory: null,
      };

      const result = formatBatchProgress(progress);
      expect(result).toBe('[1/1] Processing story...');
    });
  });

  describe('formatBatchSummary', () => {
    it('should format summary with all successes', () => {
      const result: BatchResult = {
        total: 3,
        succeeded: 3,
        failed: 0,
        skipped: 0,
        errors: [],
        duration: 45000, // 45 seconds
      };

      const lines = formatBatchSummary(result);

      expect(lines).toContain('═══ Batch Processing Summary ═══');
      expect(lines).toContain('Total stories:     3');
      expect(lines).toContain('✓ Succeeded:       3');
      expect(lines).toContain('⏱  Execution time: 45.0s');
      expect(lines.some(line => line.includes('✗ Failed'))).toBe(false);
      expect(lines.some(line => line.includes('⊘ Skipped'))).toBe(false);
    });

    it('should format summary with failures', () => {
      const result: BatchResult = {
        total: 5,
        succeeded: 3,
        failed: 2,
        skipped: 0,
        errors: [
          { storyId: 'S-002', error: 'Tests failed' },
          { storyId: 'S-004', error: 'Build error' },
        ],
        duration: 120000, // 120 seconds
      };

      const lines = formatBatchSummary(result);

      expect(lines).toContain('Total stories:     5');
      expect(lines).toContain('✓ Succeeded:       3');
      expect(lines).toContain('✗ Failed:          2');
      expect(lines).toContain('⏱  Execution time: 120.0s');
      expect(lines).toContain('Failed stories:');
      expect(lines).toContain('  - S-002: Tests failed');
      expect(lines).toContain('  - S-004: Build error');
    });

    it('should format summary with skipped stories', () => {
      const result: BatchResult = {
        total: 4,
        succeeded: 2,
        failed: 0,
        skipped: 2,
        errors: [],
        duration: 30000, // 30 seconds
      };

      const lines = formatBatchSummary(result);

      expect(lines).toContain('Total stories:     4');
      expect(lines).toContain('✓ Succeeded:       2');
      expect(lines).toContain('⊘ Skipped:         2');
      expect(lines).toContain('⏱  Execution time: 30.0s');
    });

    it('should format summary with mixed results', () => {
      const result: BatchResult = {
        total: 10,
        succeeded: 6,
        failed: 2,
        skipped: 2,
        errors: [
          { storyId: 'S-003', error: 'Story not found' },
          { storyId: 'S-007', error: 'Review failed' },
        ],
        duration: 180500, // 180.5 seconds
      };

      const lines = formatBatchSummary(result);

      expect(lines).toContain('Total stories:     10');
      expect(lines).toContain('✓ Succeeded:       6');
      expect(lines).toContain('✗ Failed:          2');
      expect(lines).toContain('⊘ Skipped:         2');
      expect(lines).toContain('⏱  Execution time: 180.5s');
      expect(lines).toContain('Failed stories:');
      expect(lines).toContain('  - S-003: Story not found');
      expect(lines).toContain('  - S-007: Review failed');
    });

    it('should format duration correctly', () => {
      const testCases = [
        { duration: 1000, expected: '1.0s' },
        { duration: 1500, expected: '1.5s' },
        { duration: 60000, expected: '60.0s' },
        { duration: 125300, expected: '125.3s' },
      ];

      for (const { duration, expected } of testCases) {
        const result: BatchResult = {
          total: 1,
          succeeded: 1,
          failed: 0,
          skipped: 0,
          errors: [],
          duration,
        };

        const lines = formatBatchSummary(result);
        expect(lines.some(line => line.includes(expected))).toBe(true);
      }
    });

    it('should handle zero stories', () => {
      const result: BatchResult = {
        total: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        duration: 0,
      };

      const lines = formatBatchSummary(result);

      expect(lines).toContain('Total stories:     0');
      expect(lines).toContain('✓ Succeeded:       0');
      expect(lines).toContain('⏱  Execution time: 0.0s');
    });
  });
});
