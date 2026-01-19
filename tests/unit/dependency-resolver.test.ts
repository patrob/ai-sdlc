import { describe, it, expect } from 'vitest';
import { groupStoriesByPhase, detectCircularDependencies, validateDependencies } from '../../src/cli/dependency-resolver.js';
import { Story } from '../../src/types/index.js';

/**
 * Helper to create a test story with minimal required fields
 */
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

describe('dependency-resolver', () => {
  describe('groupStoriesByPhase', () => {
    it('should return empty array for empty input', () => {
      const phases = groupStoriesByPhase([]);
      expect(phases).toEqual([]);
    });

    it('should handle single story with no dependencies', () => {
      const stories = [createTestStory('S-001')];
      const phases = groupStoriesByPhase(stories);

      expect(phases).toHaveLength(1);
      expect(phases[0]).toHaveLength(1);
      expect(phases[0][0].frontmatter.id).toBe('S-001');
    });

    it('should group all independent stories in single phase', () => {
      const stories = [
        createTestStory('S-001'),
        createTestStory('S-002'),
        createTestStory('S-003'),
      ];
      const phases = groupStoriesByPhase(stories);

      expect(phases).toHaveLength(1);
      expect(phases[0]).toHaveLength(3);
      expect(phases[0].map(s => s.frontmatter.id).sort()).toEqual(['S-001', 'S-002', 'S-003']);
    });

    it('should create sequential phases for linear dependency chain', () => {
      // S-001 → S-002 → S-003
      const stories = [
        createTestStory('S-001'),
        createTestStory('S-002', ['S-001']),
        createTestStory('S-003', ['S-002']),
      ];
      const phases = groupStoriesByPhase(stories);

      expect(phases).toHaveLength(3);
      expect(phases[0][0].frontmatter.id).toBe('S-001');
      expect(phases[1][0].frontmatter.id).toBe('S-002');
      expect(phases[2][0].frontmatter.id).toBe('S-003');
    });

    it('should handle diamond dependency pattern', () => {
      // S-001 → S-002, S-001 → S-003, S-002 → S-004, S-003 → S-004
      const stories = [
        createTestStory('S-001'),
        createTestStory('S-002', ['S-001']),
        createTestStory('S-003', ['S-001']),
        createTestStory('S-004', ['S-002', 'S-003']),
      ];
      const phases = groupStoriesByPhase(stories);

      expect(phases).toHaveLength(3);
      expect(phases[0][0].frontmatter.id).toBe('S-001');
      expect(phases[1].map(s => s.frontmatter.id).sort()).toEqual(['S-002', 'S-003']);
      expect(phases[2][0].frontmatter.id).toBe('S-004');
    });

    it('should handle complex dependency graph with multiple parallel branches', () => {
      // S-001, S-002 → S-003, S-004 → S-005, S-003 + S-005 → S-006
      const stories = [
        createTestStory('S-001'),
        createTestStory('S-002'),
        createTestStory('S-003', ['S-002']),
        createTestStory('S-004'),
        createTestStory('S-005', ['S-004']),
        createTestStory('S-006', ['S-003', 'S-005']),
      ];
      const phases = groupStoriesByPhase(stories);

      expect(phases).toHaveLength(3);
      // Phase 1: S-001, S-002, S-004 (all independent)
      expect(phases[0].map(s => s.frontmatter.id).sort()).toEqual(['S-001', 'S-002', 'S-004']);
      // Phase 2: S-003, S-005 (depend on phase 1)
      expect(phases[1].map(s => s.frontmatter.id).sort()).toEqual(['S-003', 'S-005']);
      // Phase 3: S-006 (depends on S-003 and S-005)
      expect(phases[2][0].frontmatter.id).toBe('S-006');
    });

    it('should throw error for circular dependency', () => {
      // S-001 → S-002 → S-003 → S-001
      const stories = [
        createTestStory('S-001', ['S-003']),
        createTestStory('S-002', ['S-001']),
        createTestStory('S-003', ['S-002']),
      ];

      expect(() => groupStoriesByPhase(stories)).toThrow('Circular dependency detected');
    });

    it('should throw error for self-dependency', () => {
      const stories = [createTestStory('S-001', ['S-001'])];

      expect(() => groupStoriesByPhase(stories)).toThrow('Circular dependency detected');
    });
  });

  describe('detectCircularDependencies', () => {
    it('should return empty array for no circular dependencies', () => {
      const stories = [
        createTestStory('S-001'),
        createTestStory('S-002', ['S-001']),
      ];
      const cycle = detectCircularDependencies(stories);

      expect(cycle).toEqual([]);
    });

    it('should detect simple circular dependency', () => {
      // S-001 → S-002 → S-001
      const stories = [
        createTestStory('S-001', ['S-002']),
        createTestStory('S-002', ['S-001']),
      ];
      const cycle = detectCircularDependencies(stories);

      expect(cycle.length).toBeGreaterThan(0);
      expect(cycle[0]).toBe(cycle[cycle.length - 1]); // Cycle starts and ends with same ID
    });

    it('should detect three-story circular dependency', () => {
      // S-001 → S-002 → S-003 → S-001
      const stories = [
        createTestStory('S-001', ['S-003']),
        createTestStory('S-002', ['S-001']),
        createTestStory('S-003', ['S-002']),
      ];
      const cycle = detectCircularDependencies(stories);

      expect(cycle.length).toBeGreaterThan(0);
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    });

    it('should detect self-dependency as circular', () => {
      const stories = [createTestStory('S-001', ['S-001'])];
      const cycle = detectCircularDependencies(stories);

      expect(cycle).toEqual(['S-001', 'S-001']);
    });
  });

  describe('validateDependencies', () => {
    it('should pass validation for valid dependencies', () => {
      const stories = [
        createTestStory('S-001'),
        createTestStory('S-002', ['S-001']),
        createTestStory('S-003', ['S-002']),
      ];
      const result = validateDependencies(stories);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing dependency', () => {
      const stories = [
        createTestStory('S-001'),
        createTestStory('S-002', ['S-999']), // S-999 doesn't exist
      ];
      const result = validateDependencies(stories);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('S-999');
      expect(result.errors[0]).toContain('not in the epic');
    });

    it('should detect multiple missing dependencies', () => {
      const stories = [
        createTestStory('S-001', ['S-998', 'S-999']),
      ];
      const result = validateDependencies(stories);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('should detect circular dependencies', () => {
      const stories = [
        createTestStory('S-001', ['S-002']),
        createTestStory('S-002', ['S-001']),
      ];
      const result = validateDependencies(stories);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Circular dependency');
    });

    it('should prioritize missing dependency errors over circular dependency checks', () => {
      // When there are missing dependencies, circular dependency check is skipped
      // because the graph is incomplete and would produce misleading errors
      const stories = [
        createTestStory('S-001', ['S-002', 'S-999']),
        createTestStory('S-002', ['S-001']),
      ];
      const result = validateDependencies(stories);

      expect(result.valid).toBe(false);
      // Only missing dependency error, circular check is deferred
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('S-999');
    });

    it('should validate stories with no dependencies', () => {
      const stories = [
        createTestStory('S-001'),
        createTestStory('S-002'),
      ];
      const result = validateDependencies(stories);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});
