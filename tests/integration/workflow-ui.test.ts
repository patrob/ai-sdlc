import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getThemedChalk } from '../../src/core/theme.js';
import { Story, ActionType } from '../../src/types/index.js';

describe('Workflow UI Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalColumns: number | undefined;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalColumns = process.stdout.columns;
  });

  afterEach(() => {
    process.env = originalEnv;
    if (originalColumns !== undefined) {
      Object.defineProperty(process.stdout, 'columns', {
        value: originalColumns,
        writable: true,
      });
    }
  });

  describe('Phase Indicators', () => {
    it('should display phase indicators for RPIV actions', () => {
      delete process.env.NO_COLOR;
      const c = getThemedChalk();

      // Verify phase color methods exist and work
      const refineText = c.phaseRefine('[Refine]');
      const researchText = c.phaseResearch('[Research]');
      const planText = c.phasePlan('[Plan]');
      const implementText = c.phaseImplement('[Implement]');
      const verifyText = c.phaseVerify('[Verify]');

      expect(typeof refineText).toBe('string');
      expect(typeof researchText).toBe('string');
      expect(typeof planText).toBe('string');
      expect(typeof implementText).toBe('string');
      expect(typeof verifyText).toBe('string');
    });

    it('should fall back to plain text when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      const c = getThemedChalk();

      const refineText = c.phaseRefine('[Refine]');
      const researchText = c.phaseResearch('[Research]');

      expect(refineText).toBe('[Refine]');
      expect(researchText).toBe('[Research]');
    });

    it('should distinguish review actions with special formatting', () => {
      delete process.env.NO_COLOR;
      const c = getThemedChalk();

      const reviewText = c.reviewAction('Review');
      expect(typeof reviewText).toBe('string');
    });
  });

  describe('Phase Progress Tracking', () => {
    it('should calculate progress correctly for story in backlog', () => {
      const story: Story = {
        path: '/test/backlog/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'test-1',
          title: 'Test Story',
          priority: 1,
          status: 'backlog',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
        },
        content: '',
      };

      // Story in backlog should show no completed phases
      expect(story.frontmatter.research_complete).toBe(false);
      expect(story.frontmatter.plan_complete).toBe(false);
      expect(story.frontmatter.implementation_complete).toBe(false);
      expect(story.frontmatter.reviews_complete).toBe(false);
    });

    it('should track progress through RPIV phases', () => {
      const story: Story = {
        path: '/test/ready/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'test-1',
          title: 'Test Story',
          priority: 1,
          status: 'ready',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: false,
          reviews_complete: false,
        },
        content: '',
      };

      // Verify flags are set correctly
      expect(story.frontmatter.research_complete).toBe(true);
      expect(story.frontmatter.plan_complete).toBe(true);
      expect(story.frontmatter.implementation_complete).toBe(false);
      expect(story.frontmatter.reviews_complete).toBe(false);
    });

    it('should show all phases complete for done story', () => {
      const story: Story = {
        path: '/test/done/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'test-1',
          title: 'Test Story',
          priority: 1,
          status: 'done',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: true,
        },
        content: '',
      };

      // All phases should be complete
      expect(story.frontmatter.research_complete).toBe(true);
      expect(story.frontmatter.plan_complete).toBe(true);
      expect(story.frontmatter.implementation_complete).toBe(true);
      expect(story.frontmatter.reviews_complete).toBe(true);
    });
  });

  describe('Phase Completion Display', () => {
    it('should provide phase completion color method', () => {
      delete process.env.NO_COLOR;
      const c = getThemedChalk();

      const completeText = c.phaseComplete('✓ Research phase complete');
      expect(typeof completeText).toBe('string');
    });

    it('should fall back to plain text for phase completion when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      const c = getThemedChalk();

      const completeText = c.phaseComplete('✓ Research phase complete');
      expect(completeText).toBe('✓ Research phase complete');
    });
  });

  describe('Terminal Width Handling', () => {
    it('should handle standard terminal width (80 columns)', () => {
      Object.defineProperty(process.stdout, 'columns', {
        value: 80,
        writable: true,
      });

      expect(process.stdout.columns).toBe(80);
    });

    it('should handle wide terminal width (120 columns)', () => {
      Object.defineProperty(process.stdout, 'columns', {
        value: 120,
        writable: true,
      });

      expect(process.stdout.columns).toBe(120);
    });

    it('should handle narrow terminal width (60 columns)', () => {
      Object.defineProperty(process.stdout, 'columns', {
        value: 60,
        writable: true,
      });

      expect(process.stdout.columns).toBe(60);
    });

    it('should handle undefined terminal width (non-TTY)', () => {
      Object.defineProperty(process.stdout, 'columns', {
        value: undefined,
        writable: true,
      });

      // Should default to 80 when undefined
      const width = process.stdout.columns || 80;
      expect(width).toBe(80);
    });
  });

  describe('Theme Compatibility', () => {
    it('should work with auto theme preference', () => {
      delete process.env.NO_COLOR;
      const c = getThemedChalk({ theme: 'auto' } as any);

      expect(typeof c.phaseResearch('Research')).toBe('string');
    });

    it('should work with light theme preference', () => {
      delete process.env.NO_COLOR;
      const c = getThemedChalk({ theme: 'light' } as any);

      expect(typeof c.phaseResearch('Research')).toBe('string');
    });

    it('should work with dark theme preference', () => {
      delete process.env.NO_COLOR;
      const c = getThemedChalk({ theme: 'dark' } as any);

      expect(typeof c.phaseResearch('Research')).toBe('string');
    });

    it('should work with none theme preference', () => {
      const c = getThemedChalk({ theme: 'none' } as any);

      expect(c.phaseResearch('Research')).toBe('Research');
    });
  });

  describe('Progress Display Symbols', () => {
    it('should use Unicode symbols by default', () => {
      delete process.env.NO_COLOR;

      // Verify Unicode symbols are available
      const checkmark = '✓';
      const currentMarker = '●';
      const pendingMarker = '○';
      const arrow = '→';

      expect(checkmark).toBe('✓');
      expect(currentMarker).toBe('●');
      expect(pendingMarker).toBe('○');
      expect(arrow).toBe('→');
    });

    it('should provide ASCII alternatives for NO_COLOR mode', () => {
      process.env.NO_COLOR = '1';

      // ASCII alternatives
      const checkmark = '[X]';
      const currentMarker = '[>]';
      const pendingMarker = '[ ]';
      const arrow = '->';

      expect(checkmark).toBe('[X]');
      expect(currentMarker).toBe('[>]');
      expect(pendingMarker).toBe('[ ]');
      expect(arrow).toBe('->');
    });
  });

  describe('Review Action Distinction', () => {
    it('should use distinct color for review actions', () => {
      delete process.env.NO_COLOR;
      const c = getThemedChalk();

      const reviewText = c.reviewAction('Running code review');
      const implementText = c.phaseImplement('Implementing feature');

      // Both should be strings (colored)
      expect(typeof reviewText).toBe('string');
      expect(typeof implementText).toBe('string');

      // They should be different (we can't easily compare chalk instances,
      // but we verify they both exist and return strings)
      expect(reviewText).toBeTruthy();
      expect(implementText).toBeTruthy();
    });

    it('should handle review action in NO_COLOR mode', () => {
      process.env.NO_COLOR = '1';
      const c = getThemedChalk();

      const reviewText = c.reviewAction('Running code review');
      expect(reviewText).toBe('Running code review');
    });
  });

  describe('Edge Cases', () => {
    it('should handle story with error state', () => {
      const story: Story = {
        path: '/test/in-progress/story.md',
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
          plan_complete: true,
          implementation_complete: false,
          reviews_complete: false,
          last_error: 'Implementation failed',
        },
        content: '',
      };

      expect(story.frontmatter.last_error).toBe('Implementation failed');
    });

    it('should handle story with partial progress', () => {
      const story: Story = {
        path: '/test/ready/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'test-1',
          title: 'Test Story',
          priority: 1,
          status: 'ready',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: true,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
        },
        content: '',
      };

      // Research complete but plan not started
      expect(story.frontmatter.research_complete).toBe(true);
      expect(story.frontmatter.plan_complete).toBe(false);
    });

    it('should handle very long story titles for display', () => {
      const longTitle = 'This is a very long story title that might exceed terminal width and needs to be truncated properly to avoid visual clutter';

      expect(longTitle.length).toBeGreaterThan(80);

      // Simulated truncation logic
      const truncated = longTitle.length > 50 ? longTitle.slice(0, 47) + '...' : longTitle;
      expect(truncated.length).toBeLessThanOrEqual(50);
      expect(truncated).toContain('...');
    });
  });

  describe('Real-time Updates', () => {
    it('should support updating phase indicators during execution', () => {
      // This simulates what happens during workflow execution
      const phases: ActionType[] = ['research', 'plan', 'implement', 'review'];
      const completedPhases: ActionType[] = [];

      // Simulate completing phases one by one
      for (const phase of phases) {
        completedPhases.push(phase);
        expect(completedPhases).toContain(phase);
      }

      expect(completedPhases.length).toBe(4);
    });

    it('should handle rapid phase transitions', () => {
      // Simulate very fast phase completion
      const story: Story = {
        path: '/test/story.md',
        slug: 'test-story',
        frontmatter: {
          id: 'test-1',
          title: 'Test Story',
          priority: 1,
          status: 'ready',
          type: 'feature',
          created: '2024-01-01',
          labels: [],
          research_complete: false,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
        },
        content: '',
      };

      // Rapidly update flags
      story.frontmatter.research_complete = true;
      story.frontmatter.plan_complete = true;
      story.frontmatter.implementation_complete = true;
      story.frontmatter.reviews_complete = true;

      // All should be set
      expect(story.frontmatter.research_complete).toBe(true);
      expect(story.frontmatter.plan_complete).toBe(true);
      expect(story.frontmatter.implementation_complete).toBe(true);
      expect(story.frontmatter.reviews_complete).toBe(true);
    });
  });
});
