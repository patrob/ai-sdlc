import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseStoryIdList,
  deduplicateStoryIds,
  validateStoryIdFormat,
  validateStoryIds,
} from './batch-validator.js';
import * as story from '../core/story.js';

// Mock story module
vi.mock('../core/story.js');

describe('batch-validator', () => {
  describe('parseStoryIdList', () => {
    it('should parse comma-separated story IDs', () => {
      const result = parseStoryIdList('S-001,S-002,S-003');
      expect(result).toEqual(['S-001', 'S-002', 'S-003']);
    });

    it('should handle whitespace around story IDs', () => {
      const result = parseStoryIdList('S-001, S-002 , S-003');
      expect(result).toEqual(['S-001', 'S-002', 'S-003']);
    });

    it('should handle extra whitespace and empty strings', () => {
      const result = parseStoryIdList('S-001,  , S-002,, S-003');
      expect(result).toEqual(['S-001', 'S-002', 'S-003']);
    });

    it('should return empty array for empty string', () => {
      expect(parseStoryIdList('')).toEqual([]);
      expect(parseStoryIdList('   ')).toEqual([]);
    });

    it('should handle single story ID', () => {
      const result = parseStoryIdList('S-001');
      expect(result).toEqual(['S-001']);
    });

    it('should handle story IDs with no spaces', () => {
      const result = parseStoryIdList('S-001,S-002,S-003,S-004');
      expect(result).toEqual(['S-001', 'S-002', 'S-003', 'S-004']);
    });
  });

  describe('deduplicateStoryIds', () => {
    it('should remove duplicate story IDs', () => {
      const result = deduplicateStoryIds(['S-001', 'S-002', 'S-001']);
      expect(result).toEqual(['S-001', 'S-002']);
    });

    it('should preserve order of first occurrence', () => {
      const result = deduplicateStoryIds(['S-003', 'S-001', 'S-002', 'S-001', 'S-003']);
      expect(result).toEqual(['S-003', 'S-001', 'S-002']);
    });

    it('should handle case-insensitive deduplication', () => {
      const result = deduplicateStoryIds(['S-001', 's-001', 'S-001']);
      expect(result).toEqual(['S-001']);
    });

    it('should handle all duplicates', () => {
      const result = deduplicateStoryIds(['S-001', 'S-001', 'S-001']);
      expect(result).toEqual(['S-001']);
    });

    it('should handle no duplicates', () => {
      const result = deduplicateStoryIds(['S-001', 'S-002', 'S-003']);
      expect(result).toEqual(['S-001', 'S-002', 'S-003']);
    });

    it('should handle empty array', () => {
      const result = deduplicateStoryIds([]);
      expect(result).toEqual([]);
    });
  });

  describe('validateStoryIdFormat', () => {
    it('should accept valid story ID format S-NNN', () => {
      expect(validateStoryIdFormat('S-001')).toBe(true);
      expect(validateStoryIdFormat('S-123')).toBe(true);
      expect(validateStoryIdFormat('S-999')).toBe(true);
      expect(validateStoryIdFormat('S-1')).toBe(true);
    });

    it('should accept lowercase story IDs', () => {
      expect(validateStoryIdFormat('s-001')).toBe(true);
      expect(validateStoryIdFormat('s-123')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(validateStoryIdFormat('INVALID')).toBe(false);
      expect(validateStoryIdFormat('S-')).toBe(false);
      expect(validateStoryIdFormat('S-ABC')).toBe(false);
      expect(validateStoryIdFormat('001')).toBe(false);
      expect(validateStoryIdFormat('')).toBe(false);
      expect(validateStoryIdFormat('S-001-extra')).toBe(false);
    });

    it('should reject story IDs with special characters', () => {
      expect(validateStoryIdFormat('S-001!')).toBe(false);
      expect(validateStoryIdFormat('S-001@')).toBe(false);
      expect(validateStoryIdFormat('S-001#')).toBe(false);
    });
  });

  describe('validateStoryIds', () => {
    const mockSdlcRoot = '/test/.ai-sdlc';

    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should validate all stories exist', () => {
      // Mock findStoryById to return mock stories
      vi.mocked(story.findStoryById).mockImplementation((root: string, id: string) => {
        return {
          path: `/test/.ai-sdlc/stories/${id}/story.md`,
          frontmatter: { id, title: `Story ${id}`, status: 'backlog' },
          slug: id.toLowerCase(),
        } as any;
      });

      const result = validateStoryIds(['S-001', 'S-002', 'S-003'], mockSdlcRoot);

      expect(result.valid).toBe(true);
      expect(result.validStoryIds).toEqual(['S-001', 'S-002', 'S-003']);
      expect(result.errors).toEqual([]);
    });

    it('should detect invalid story ID formats', () => {
      // Mock valid stories to exist - we're testing format validation, not existence
      vi.mocked(story.findStoryById).mockImplementation((root: string, id: string) => {
        if (/^S-\d+$/i.test(id)) {
          return {
            path: `/test/.ai-sdlc/stories/${id}/story.md`,
            frontmatter: { id, title: `Story ${id}`, status: 'backlog' },
            slug: id.toLowerCase(),
          } as any;
        }
        return null;
      });

      const result = validateStoryIds(['S-001', 'INVALID', 'S-003'], mockSdlcRoot);

      expect(result.valid).toBe(false);
      expect(result.validStoryIds).toEqual(['S-001', 'S-003']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].storyId).toBe('INVALID');
      expect(result.errors[0].message).toContain('Invalid story ID format');
    });

    it('should detect non-existent stories', () => {
      vi.mocked(story.findStoryById).mockImplementation((root: string, id: string) => {
        if (id === 'S-002') {
          return null; // Story not found
        }
        return {
          path: `/test/.ai-sdlc/stories/${id}/story.md`,
          frontmatter: { id, title: `Story ${id}`, status: 'backlog' },
          slug: id.toLowerCase(),
        } as any;
      });

      const result = validateStoryIds(['S-001', 'S-002', 'S-003'], mockSdlcRoot);

      expect(result.valid).toBe(false);
      expect(result.validStoryIds).toEqual(['S-001', 'S-003']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].storyId).toBe('S-002');
      expect(result.errors[0].message).toContain('Story not found');
    });

    it('should handle multiple validation errors', () => {
      vi.mocked(story.findStoryById).mockImplementation((root: string, id: string) => {
        if (id === 'S-002') {
          return null; // Story not found
        }
        return {
          path: `/test/.ai-sdlc/stories/${id}/story.md`,
          frontmatter: { id, title: `Story ${id}`, status: 'backlog' },
          slug: id.toLowerCase(),
        } as any;
      });

      const result = validateStoryIds(['S-001', 'S-002', 'INVALID', 'S-004'], mockSdlcRoot);

      expect(result.valid).toBe(false);
      expect(result.validStoryIds).toEqual(['S-001', 'S-004']);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].storyId).toBe('S-002');
      expect(result.errors[1].storyId).toBe('INVALID');
    });

    it('should handle errors during story lookup', () => {
      vi.mocked(story.findStoryById).mockImplementation((root: string, id: string) => {
        if (id === 'S-002') {
          throw new Error('Database error');
        }
        return {
          path: `/test/.ai-sdlc/stories/${id}/story.md`,
          frontmatter: { id, title: `Story ${id}`, status: 'backlog' },
          slug: id.toLowerCase(),
        } as any;
      });

      const result = validateStoryIds(['S-001', 'S-002', 'S-003'], mockSdlcRoot);

      expect(result.valid).toBe(false);
      expect(result.validStoryIds).toEqual(['S-001', 'S-003']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].storyId).toBe('S-002');
      expect(result.errors[0].message).toContain('Error validating story');
      expect(result.errors[0].message).toContain('Database error');
    });

    it('should return valid result for empty array', () => {
      const result = validateStoryIds([], mockSdlcRoot);

      expect(result.valid).toBe(true);
      expect(result.validStoryIds).toEqual([]);
      expect(result.errors).toEqual([]);
    });
  });
});
