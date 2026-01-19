import { describe, it, expect } from 'vitest';
import { normalizeEpicId, discoverEpicStories } from '../../src/cli/epic-processor.js';
import { groupStoriesByPhase, validateDependencies } from '../../src/cli/dependency-resolver.js';
import { Story } from '../../src/types/index.js';

/**
 * Integration tests for epic processing with --epic flag
 *
 * These tests verify the core logic without requiring CLI execution:
 * - Epic ID normalization
 * - Story discovery by epic label
 * - Dependency resolution and phase grouping
 * - Validation error handling
 *
 * Note: Full end-to-end CLI tests with worktrees and parallel execution
 * are better suited for manual testing due to:
 * - Complexity of mocking git worktrees
 * - Long execution times for parallel story processing
 * - Need for actual agent processes
 */

describe('epic-processing integration', () => {
  describe('epic ID normalization', () => {
    it('should strip epic- prefix when present', () => {
      expect(normalizeEpicId('epic-foo')).toBe('foo');
      expect(normalizeEpicId('epic-ticketing-integration')).toBe('ticketing-integration');
    });

    it('should leave ID unchanged when no prefix', () => {
      expect(normalizeEpicId('foo')).toBe('foo');
      expect(normalizeEpicId('ticketing-integration')).toBe('ticketing-integration');
    });

    it('should handle empty string', () => {
      expect(normalizeEpicId('')).toBe('');
    });
  });

  describe('dependency validation integration', () => {
    function createTestStory(id: string, dependencies: string[] = []): Story {
      return {
        path: `/test/stories/${id}/story.md`,
        slug: id.toLowerCase(),
        frontmatter: {
          id,
          title: `Test Story ${id}`,
          slug: id.toLowerCase(),
          priority: 10,
          status: 'backlog',
          type: 'feature',
          created: '2026-01-01T00:00:00Z',
          labels: ['epic-test'],
          dependencies,
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
        },
        content: 'Test story content',
      };
    }

    it('should validate stories with dependencies in epic', () => {
      const stories = [
        createTestStory('S-001'),
        createTestStory('S-002', ['S-001']),
        createTestStory('S-003', ['S-002']),
      ];

      const result = validateDependencies(stories);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing dependencies', () => {
      const stories = [
        createTestStory('S-001'),
        createTestStory('S-002', ['S-999']), // S-999 doesn't exist
      ];

      const result = validateDependencies(stories);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('S-999');
      expect(result.errors[0]).toContain('not in the epic');
    });

    it('should detect circular dependencies', () => {
      const stories = [
        createTestStory('S-001', ['S-002']),
        createTestStory('S-002', ['S-001']),
      ];

      const result = validateDependencies(stories);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Circular dependency');
    });

    it('should group independent stories into single phase', () => {
      const stories = [
        createTestStory('S-001'),
        createTestStory('S-002'),
        createTestStory('S-003'),
      ];

      const phases = groupStoriesByPhase(stories);
      expect(phases).toHaveLength(1);
      expect(phases[0]).toHaveLength(3);
    });

    it('should group diamond dependency into correct phases', () => {
      // S-001 -> S-002, S-001 -> S-003, S-002 + S-003 -> S-004
      const stories = [
        createTestStory('S-001'),
        createTestStory('S-002', ['S-001']),
        createTestStory('S-003', ['S-001']),
        createTestStory('S-004', ['S-002', 'S-003']),
      ];

      const phases = groupStoriesByPhase(stories);
      expect(phases).toHaveLength(3);
      // Phase 1: S-001
      expect(phases[0]).toHaveLength(1);
      expect(phases[0][0].frontmatter.id).toBe('S-001');
      // Phase 2: S-002 and S-003 (parallel)
      expect(phases[1]).toHaveLength(2);
      expect(phases[1].map(s => s.frontmatter.id).sort()).toEqual(['S-002', 'S-003']);
      // Phase 3: S-004
      expect(phases[2]).toHaveLength(1);
      expect(phases[2][0].frontmatter.id).toBe('S-004');
    });
  });
});
