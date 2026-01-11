import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Story } from '../../src/types/index.js';
import {
  renderStoryTable,
  renderCompactView,
  shouldUseCompactView,
  renderStories,
} from '../../src/cli/table-renderer.js';

// Mock themed chalk
const mockThemedChalk = {
  success: (str: string) => str,
  error: (str: string) => str,
  warning: (str: string) => str,
  info: (str: string) => str,
  dim: (str: string) => str,
  bold: (str: string) => str,
  backlog: (str: string) => str,
  ready: (str: string) => str,
  inProgress: (str: string) => str,
  done: (str: string) => str,
};

// Helper to create mock stories
function createMockStory(overrides: Partial<Story['frontmatter']> = {}): Story {
  return {
    path: '/path/to/story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'story-test-123',
      title: 'Test Story',
      priority: 1,
      status: 'backlog',
      type: 'feature',
      created: '2024-01-01',
      labels: ['test'],
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
      reviews_complete: false,
      ...overrides,
    },
    content: '',
  };
}

describe('table-renderer', () => {
  let originalColumns: number | undefined;

  beforeEach(() => {
    originalColumns = process.stdout.columns;
    process.stdout.columns = 120; // Default test width
  });

  afterEach(() => {
    process.stdout.columns = originalColumns;
  });

  describe('renderStoryTable', () => {
    it('should render empty state for no stories', () => {
      const result = renderStoryTable([], mockThemedChalk);
      expect(result).toContain('(empty)');
    });

    it('should render table with single story', () => {
      const story = createMockStory();
      const result = renderStoryTable([story], mockThemedChalk);

      // Should contain table structure
      expect(result).toContain('Story ID');
      expect(result).toContain('Title');
      expect(result).toContain('Status');
      expect(result).toContain('Labels');
      expect(result).toContain('Flags');

      // Should contain story data
      expect(result).toContain(story.frontmatter.id);
      expect(result).toContain(story.frontmatter.title);
      expect(result).toContain(story.frontmatter.status);
    });

    it('should render table with multiple stories', () => {
      const stories = [
        createMockStory({ id: 'story-1', title: 'Story One' }),
        createMockStory({ id: 'story-2', title: 'Story Two' }),
        createMockStory({ id: 'story-3', title: 'Story Three' }),
      ];

      const result = renderStoryTable(stories, mockThemedChalk);

      // All stories should be present
      expect(result).toContain('story-1');
      expect(result).toContain('story-2');
      expect(result).toContain('story-3');
      expect(result).toContain('Story One');
      expect(result).toContain('Story Two');
      expect(result).toContain('Story Three');
    });

    it('should truncate long titles', () => {
      const longTitle = 'This is a very long story title that should be truncated because it exceeds the maximum allowed length for the title column';
      const story = createMockStory({ title: longTitle });

      const result = renderStoryTable([story], mockThemedChalk);

      // Should contain ellipsis
      expect(result).toContain('...');
      // Should not contain the full long title
      expect(result).not.toContain(longTitle);
    });

    it('should display workflow flags', () => {
      const story = createMockStory({
        research_complete: true,
        plan_complete: true,
        implementation_complete: false,
        reviews_complete: false,
      });

      const result = renderStoryTable([story], mockThemedChalk);

      // Should contain R and P flags
      expect(result).toContain('[RP]');
    });

    it('should display all workflow flags when complete', () => {
      const story = createMockStory({
        research_complete: true,
        plan_complete: true,
        implementation_complete: true,
        reviews_complete: true,
      });

      const result = renderStoryTable([story], mockThemedChalk);

      // Should contain all flags
      expect(result).toContain('[RPIV]');
    });

    it('should display error flag when last_error exists', () => {
      const story = createMockStory({
        last_error: 'Something went wrong',
      });

      const result = renderStoryTable([story], mockThemedChalk);

      // Should contain error flag
      expect(result).toContain('[!]');
    });

    it('should format multiple labels', () => {
      const story = createMockStory({
        labels: ['bug', 'urgent', 'backend'],
      });

      const result = renderStoryTable([story], mockThemedChalk);

      // Should contain labels (may be truncated based on width)
      expect(result).toContain('bug');
    });

    it('should handle story with no title', () => {
      const story = createMockStory({ title: '' });
      const result = renderStoryTable([story], mockThemedChalk);

      expect(result).toContain('(No title)');
    });

    it('should handle story with no labels', () => {
      const story = createMockStory({ labels: [] });
      const result = renderStoryTable([story], mockThemedChalk);

      // Should render without errors
      expect(result).toBeDefined();
      expect(result).toContain(story.frontmatter.id);
    });

    it('should display correct status colors', () => {
      const statuses: Array<'backlog' | 'ready' | 'in-progress' | 'done'> = ['backlog', 'ready', 'in-progress', 'done'];

      for (const status of statuses) {
        const story = createMockStory({ status });
        const result = renderStoryTable([story], mockThemedChalk);
        expect(result).toContain(status);
      }
    });
  });

  describe('renderCompactView', () => {
    it('should render empty state for no stories', () => {
      const result = renderCompactView([], mockThemedChalk);
      expect(result).toContain('(empty)');
    });

    it('should render compact format for single story', () => {
      const story = createMockStory();
      const result = renderCompactView([story], mockThemedChalk);

      // Should contain ID, Title, Status labels
      expect(result).toContain('ID:');
      expect(result).toContain('Title:');
      expect(result).toContain('Status:');
      expect(result).toContain(story.frontmatter.id);
      expect(result).toContain(story.frontmatter.title);
    });

    it('should separate stories with dividers', () => {
      const stories = [
        createMockStory({ id: 'story-1' }),
        createMockStory({ id: 'story-2' }),
      ];

      const result = renderCompactView(stories, mockThemedChalk);

      // Should contain separator between stories
      expect(result).toContain('─');
    });

    it('should truncate long titles in compact view', () => {
      const longTitle = 'This is a very long story title that should be truncated in compact view';
      const story = createMockStory({ title: longTitle });

      const result = renderCompactView([story], mockThemedChalk);

      // Should contain ellipsis for truncation
      expect(result).toContain('...');
    });

    it('should display labels and flags when present', () => {
      const story = createMockStory({
        labels: ['bug', 'urgent'],
        research_complete: true,
      });

      const result = renderCompactView([story], mockThemedChalk);

      expect(result).toContain('Labels:');
      expect(result).toContain('Flags:');
      expect(result).toContain('[R]');
    });

    it('should handle stories with no labels or flags gracefully', () => {
      const story = createMockStory({ labels: [] });
      const result = renderCompactView([story], mockThemedChalk);

      // Should render without errors
      expect(result).toBeDefined();
      expect(result).toContain('ID:');
    });
  });

  describe('shouldUseCompactView', () => {
    it('should return true for narrow terminal', () => {
      expect(shouldUseCompactView(80)).toBe(true);
      expect(shouldUseCompactView(90)).toBe(true);
    });

    it('should return false for wide terminal', () => {
      expect(shouldUseCompactView(120)).toBe(false);
      expect(shouldUseCompactView(200)).toBe(false);
    });

    it('should use process.stdout.columns when no width provided', () => {
      process.stdout.columns = 80;
      expect(shouldUseCompactView()).toBe(true);

      process.stdout.columns = 150;
      expect(shouldUseCompactView()).toBe(false);
    });
  });

  describe('renderStories', () => {
    it('should use table view for wide terminal', () => {
      process.stdout.columns = 120;
      const story = createMockStory();
      const result = renderStories([story], mockThemedChalk);

      // Should be table format (contains Unicode box characters)
      expect(result).toContain('Story ID');
    });

    it('should use compact view for narrow terminal', () => {
      process.stdout.columns = 80;
      const story = createMockStory();
      const result = renderStories([story], mockThemedChalk);

      // Should be compact format (contains ID:, Title: labels)
      expect(result).toContain('ID:');
      expect(result).toContain('Title:');
    });

    it('should handle empty stories in both views', () => {
      process.stdout.columns = 120;
      expect(renderStories([], mockThemedChalk)).toContain('(empty)');

      process.stdout.columns = 80;
      expect(renderStories([], mockThemedChalk)).toContain('(empty)');
    });
  });

  describe('integration scenarios', () => {
    it('should render realistic story board', () => {
      const stories = [
        createMockStory({
          id: 'story-mk68fjh7-fvbt',
          title: 'Improve status output: add story ID column, truncate long text, and format as uniform table view',
          status: 'backlog',
          labels: ['enhancement', 'ui', 'cli', 'status-command'],
          research_complete: true,
        }),
        createMockStory({
          id: 'story-mk6a2jk9-xyzf',
          title: 'Add user authentication',
          status: 'in-progress',
          labels: ['feature', 'security'],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
        }),
        createMockStory({
          id: 'story-mk6b3lm1-abcd',
          title: 'Fix bug in payment processing',
          status: 'ready',
          labels: ['bug', 'critical'],
          research_complete: true,
          plan_complete: true,
        }),
      ];

      process.stdout.columns = 120;
      const result = renderStoryTable(stories, mockThemedChalk);

      // Verify all stories are present
      expect(result).toContain('story-mk68fjh7-fvbt');
      expect(result).toContain('story-mk6a2jk9-xyzf');
      expect(result).toContain('story-mk6b3lm1-abcd');

      // Verify table structure
      expect(result).toContain('Story ID');
      expect(result).toContain('Title');
      expect(result).toContain('Status');

      // Verify flags
      expect(result).toContain('[R]'); // First story
      expect(result).toContain('[RPI]'); // Second story
      expect(result).toContain('[RP]'); // Third story
    });

    it('should handle 100+ stories without errors', () => {
      const stories = Array.from({ length: 100 }, (_, i) =>
        createMockStory({
          id: `story-${i}`,
          title: `Story number ${i}`,
        })
      );

      const result = renderStoryTable(stories, mockThemedChalk);

      // Should render without errors
      expect(result).toBeDefined();
      expect(result).toContain('story-0');
      expect(result).toContain('story-99');
    });

    it('should render 100+ stories in under 1 second', () => {
      const stories = Array.from({ length: 100 }, (_, i) =>
        createMockStory({
          id: `story-perf-test-${i}`,
          title: `Performance test story number ${i} with some descriptive text that could be truncated`,
          labels: ['performance', 'test', 'large-dataset'],
          status: i % 4 === 0 ? 'backlog' : i % 4 === 1 ? 'ready' : i % 4 === 2 ? 'in-progress' : 'done',
        })
      );

      const start = Date.now();
      const result = renderStoryTable(stories, mockThemedChalk);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Must complete in < 1 second
      expect(result).toContain('Story ID');
      expect(result).toContain('story-perf-test-0');
      expect(result).toContain('story-perf-test-99');
      expect(result.split('\n').length).toBeGreaterThan(100); // At least 100 data rows
    });

    it('should handle stories with emojis in title', () => {
      const story = createMockStory({
        title: '🚀 Deploy new feature to production',
      });

      const result = renderStoryTable([story], mockThemedChalk);

      // Should handle emoji without breaking
      expect(result).toBeDefined();
      expect(result).toContain('🚀');
    });

    it('should handle special characters in labels', () => {
      const story = createMockStory({
        labels: ['type:feature', 'priority:high', 'area:backend'],
      });

      const result = renderStoryTable([story], mockThemedChalk);

      expect(result).toBeDefined();
      expect(result).toContain('type:feature');
    });
  });

  describe('Compact View Hints', () => {
    beforeEach(() => {
      delete process.env.AI_SDLC_NO_HINTS;
    });

    it('should show compact view hint by default when terminal is narrow', () => {
      process.stdout.columns = 80;
      const story = createMockStory();

      const result = renderStories([story], mockThemedChalk);

      expect(result).toContain('Compact view');
      expect(result).toContain('terminal width 80 < 100 cols');
    });

    it('should hide hint when AI_SDLC_NO_HINTS is set', () => {
      process.env.AI_SDLC_NO_HINTS = '1';
      process.stdout.columns = 80;
      const story = createMockStory();

      const result = renderStories([story], mockThemedChalk);

      expect(result).not.toContain('Compact view');
      expect(result).not.toContain('terminal width');
    });

    it('should not show hint when using table view', () => {
      process.stdout.columns = 120;
      const story = createMockStory();

      const result = renderStories([story], mockThemedChalk);

      expect(result).not.toContain('Compact view');
      expect(result).not.toContain('terminal width');
    });
  });
});
