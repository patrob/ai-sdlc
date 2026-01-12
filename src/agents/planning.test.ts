import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PLANNING_SYSTEM_PROMPT,
  TDD_PLANNING_INSTRUCTIONS,
  buildPlanningPrompt,
} from './planning.js';
import * as storyModule from '../core/story.js';
import * as configModule from '../core/config.js';
import { Story, Config } from '../types/index.js';

// Mock external dependencies
vi.mock('../core/story.js', async () => {
  const actual = await vi.importActual<typeof import('../core/story.js')>('../core/story.js');
  return {
    ...actual,
    parseStory: vi.fn(),
    writeStory: vi.fn(),
    appendToSection: vi.fn(),
    updateStoryField: vi.fn(),
  };
});
vi.mock('../core/client.js');
vi.mock('../core/config.js', async () => {
  const actual = await vi.importActual<typeof import('../core/config.js')>('../core/config.js');
  return {
    ...actual,
    loadConfig: vi.fn(),
  };
});

describe('Planning Agent TDD Support', () => {
  describe('TDD_PLANNING_INSTRUCTIONS constant', () => {
    it('should export TDD_PLANNING_INSTRUCTIONS constant', () => {
      expect(TDD_PLANNING_INSTRUCTIONS).toBeDefined();
    });

    it('TDD_PLANNING_INSTRUCTIONS should be a non-empty string', () => {
      expect(typeof TDD_PLANNING_INSTRUCTIONS).toBe('string');
      expect(TDD_PLANNING_INSTRUCTIONS.length).toBeGreaterThan(0);
    });

    it('TDD_PLANNING_INSTRUCTIONS should mention RED phase', () => {
      expect(TDD_PLANNING_INSTRUCTIONS).toContain('RED');
    });

    it('TDD_PLANNING_INSTRUCTIONS should mention GREEN phase', () => {
      expect(TDD_PLANNING_INSTRUCTIONS).toContain('GREEN');
    });

    it('TDD_PLANNING_INSTRUCTIONS should mention REFACTOR phase', () => {
      expect(TDD_PLANNING_INSTRUCTIONS).toContain('REFACTOR');
    });

    it('TDD_PLANNING_INSTRUCTIONS should emphasize writing tests first', () => {
      expect(TDD_PLANNING_INSTRUCTIONS.toLowerCase()).toContain('test');
      expect(TDD_PLANNING_INSTRUCTIONS.toLowerCase()).toContain('fail');
    });
  });

  describe('PLANNING_SYSTEM_PROMPT constant', () => {
    it('should export PLANNING_SYSTEM_PROMPT constant', () => {
      expect(PLANNING_SYSTEM_PROMPT).toBeDefined();
    });

    it('PLANNING_SYSTEM_PROMPT should be a non-empty string', () => {
      expect(typeof PLANNING_SYSTEM_PROMPT).toBe('string');
      expect(PLANNING_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    it('PLANNING_SYSTEM_PROMPT should mention test-driven development', () => {
      expect(PLANNING_SYSTEM_PROMPT.toLowerCase()).toContain('test');
    });
  });

  describe('buildPlanningPrompt', () => {
    const mockStory: Story = {
      path: '/test/story.md',
      slug: 'test-story',
      frontmatter: {
        id: 'test-1',
        title: 'Test Story',
        priority: 1,
        status: 'in-progress',
        type: 'feature',
        created: '2024-01-01',
        labels: [],
        research_complete: true,
        plan_complete: false,
        implementation_complete: false,
        reviews_complete: false,
      },
      content: '# Test Story\n\n## Summary\nA test feature.',
    };

    it('should export buildPlanningPrompt function', () => {
      expect(buildPlanningPrompt).toBeDefined();
      expect(typeof buildPlanningPrompt).toBe('function');
    });

    it('should include TDD instructions when tdd_enabled is true in story', () => {
      const storyWithTDD: Story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          tdd_enabled: true,
        },
      };

      const prompt = buildPlanningPrompt(storyWithTDD, false);

      expect(prompt).toContain('RED');
      expect(prompt).toContain('GREEN');
      expect(prompt).toContain('REFACTOR');
    });

    it('should include TDD instructions when tdd_enabled is true in config', () => {
      const prompt = buildPlanningPrompt(mockStory, true);

      expect(prompt).toContain('RED');
      expect(prompt).toContain('GREEN');
      expect(prompt).toContain('REFACTOR');
    });

    it('should NOT include TDD instructions when tdd is disabled', () => {
      const storyNoTDD: Story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          tdd_enabled: false,
        },
      };

      const prompt = buildPlanningPrompt(storyNoTDD, false);

      // Should still be a valid prompt
      expect(prompt).toContain(mockStory.frontmatter.title);
      // But should not have the TDD-specific cycle structure
      expect(prompt).not.toContain('🔴 RED');
    });

    it('should include story content in the prompt', () => {
      const prompt = buildPlanningPrompt(mockStory, false);

      expect(prompt).toContain(mockStory.frontmatter.title);
      expect(prompt).toContain(mockStory.content);
    });

    it('should include TDD cycle structure format in prompt when TDD enabled', () => {
      const storyWithTDD: Story = {
        ...mockStory,
        frontmatter: {
          ...mockStory.frontmatter,
          tdd_enabled: true,
        },
      };

      const prompt = buildPlanningPrompt(storyWithTDD, false);

      // Should include TDD cycle structure
      expect(prompt).toContain('🔴');
      expect(prompt).toContain('🟢');
      expect(prompt).toContain('🔵');
    });
  });
});
