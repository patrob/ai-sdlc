import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Story } from '../types/index.js';
import {
  renderStoryTable,
  renderCompactView,
  shouldUseCompactView,
  renderStories,
  renderKanbanBoard,
  formatKanbanStoryEntry,
  shouldUseKanbanLayout,
} from './table-renderer.js';

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

// Helper to create mock stories with sequential IDs
let mockStoryCounter = 0;
function createMockStory(overrides: Partial<Story['frontmatter']> = {}): Story {
  mockStoryCounter++;
  const defaultId = `S-${String(mockStoryCounter).padStart(4, '0')}`;
  return {
    path: '/path/to/story.md',
    slug: 'test-story',
    frontmatter: {
      id: overrides.id ?? defaultId,
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
    mockStoryCounter = 0; // Reset counter between tests
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
        createMockStory({ id: 'S-0001', title: 'Story One' }),
        createMockStory({ id: 'S-0002', title: 'Story Two' }),
        createMockStory({ id: 'S-0003', title: 'Story Three' }),
      ];

      const result = renderStoryTable(stories, mockThemedChalk);

      // All stories should be present
      expect(result).toContain('S-0001');
      expect(result).toContain('S-0002');
      expect(result).toContain('S-0003');
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
        createMockStory({ id: 'S-0001' }),
        createMockStory({ id: 'S-0002' }),
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
          id: 'S-0100',
          title: 'Improve status output: add story ID column, truncate long text, and format as uniform table view',
          status: 'backlog',
          labels: ['enhancement', 'ui', 'cli', 'status-command'],
          research_complete: true,
        }),
        createMockStory({
          id: 'S-0101',
          title: 'Add user authentication',
          status: 'in-progress',
          labels: ['feature', 'security'],
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
        }),
        createMockStory({
          id: 'S-0102',
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
      expect(result).toContain('S-0100');
      expect(result).toContain('S-0101');
      expect(result).toContain('S-0102');

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
          id: `S-${String(i).padStart(4, '0')}`,
          title: `Story number ${i}`,
        })
      );

      const result = renderStoryTable(stories, mockThemedChalk);

      // Should render without errors
      expect(result).toBeDefined();
      expect(result).toContain('S-0000');
      expect(result).toContain('S-0099');
    });

    it('should render 100+ stories in under 1 second', () => {
      const stories = Array.from({ length: 100 }, (_, i) =>
        createMockStory({
          id: `S-${String(i).padStart(4, '0')}`,
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
      expect(result).toContain('S-0000');
      expect(result).toContain('S-0099');
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

  describe('kanban board rendering', () => {
    interface KanbanColumn {
      name: string;
      stories: Story[];
      color: any;
    }

    describe('shouldUseKanbanLayout', () => {
      it('should return true for terminal width >= 80', () => {
        expect(shouldUseKanbanLayout(80)).toBe(true);
        expect(shouldUseKanbanLayout(120)).toBe(true);
        expect(shouldUseKanbanLayout(200)).toBe(true);
      });

      it('should return false for terminal width < 80', () => {
        expect(shouldUseKanbanLayout(60)).toBe(false);
        expect(shouldUseKanbanLayout(79)).toBe(false);
      });

      it('should handle undefined terminal width', () => {
        process.stdout.columns = undefined;
        expect(shouldUseKanbanLayout()).toBe(true); // Falls back to 80
      });

      it('should use process.stdout.columns when no width provided', () => {
        process.stdout.columns = 100;
        expect(shouldUseKanbanLayout()).toBe(true);

        process.stdout.columns = 70;
        expect(shouldUseKanbanLayout()).toBe(false);
      });
    });

    describe('formatKanbanStoryEntry', () => {
      it('should format story with ID and title', () => {
        const story = createMockStory({
          id: 'S-0123',
          title: 'Test Story',
        });

        const result = formatKanbanStoryEntry(story, 30, mockThemedChalk);

        expect(result).toContain('S-0123');
        expect(result).toContain('Test Story');
      });

      it('should include flags when present', () => {
        const story = createMockStory({
          id: 'S-0456',
          title: 'Story with flags',
          research_complete: true,
          plan_complete: true,
        });

        const result = formatKanbanStoryEntry(story, 40, mockThemedChalk);

        expect(result).toContain('[RP]');
      });

      it('should truncate long titles within column width', () => {
        const story = createMockStory({
          id: 'S-0789',
          title: 'This is a very long story title that should be truncated to fit within the column width',
        });

        const result = formatKanbanStoryEntry(story, 30, mockThemedChalk);

        expect(result.length).toBeLessThanOrEqual(30);
        expect(result).toContain('...');
      });

      it('should return empty string for null story', () => {
        const result = formatKanbanStoryEntry(null, 30, mockThemedChalk);

        expect(result).toBe('');
      });

      it('should handle story with all flags', () => {
        const story = createMockStory({
          id: 'S-1000',
          title: 'Complete story',
          research_complete: true,
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: true,
        });

        const result = formatKanbanStoryEntry(story, 50, mockThemedChalk);

        expect(result).toContain('[RPIV]');
      });

      it('should handle very narrow column width', () => {
        const story = createMockStory({
          id: 'S-0010',
          title: 'Test',
        });

        const result = formatKanbanStoryEntry(story, 10, mockThemedChalk);

        expect(result.length).toBeLessThanOrEqual(10);
      });
    });

    describe('renderKanbanBoard', () => {
      it('should render 4 columns side-by-side', () => {
        const columns: KanbanColumn[] = [
          {
            name: 'BACKLOG',
            color: mockThemedChalk.backlog,
            stories: [createMockStory({ id: 'S-0001', title: 'Story 1' })],
          },
          {
            name: 'READY',
            color: mockThemedChalk.ready,
            stories: [createMockStory({ id: 'S-0002', title: 'Story 2' })],
          },
          {
            name: 'IN-PROGRESS',
            color: mockThemedChalk.inProgress,
            stories: [createMockStory({ id: 'S-0003', title: 'Story 3' })],
          },
          {
            name: 'DONE',
            color: mockThemedChalk.done,
            stories: [createMockStory({ id: 'S-0004', title: 'Story 4' })],
          },
        ];

        process.stdout.columns = 120;
        const result = renderKanbanBoard(columns, mockThemedChalk);

        // Should contain all column headers
        expect(result).toContain('BACKLOG');
        expect(result).toContain('READY');
        expect(result).toContain('IN-PROGRESS');
        expect(result).toContain('DONE');

        // Should contain stories
        expect(result).toContain('S-0001');
        expect(result).toContain('S-0002');
        expect(result).toContain('S-0003');
        expect(result).toContain('S-0004');

        // Should contain column separators
        expect(result).toContain('│');
      });

      it('should display empty columns with placeholder', () => {
        const columns: KanbanColumn[] = [
          {
            name: 'BACKLOG',
            color: mockThemedChalk.backlog,
            stories: [createMockStory()],
          },
          {
            name: 'READY',
            color: mockThemedChalk.ready,
            stories: [],
          },
          {
            name: 'IN-PROGRESS',
            color: mockThemedChalk.inProgress,
            stories: [],
          },
          {
            name: 'DONE',
            color: mockThemedChalk.done,
            stories: [createMockStory()],
          },
        ];

        process.stdout.columns = 120;
        const result = renderKanbanBoard(columns, mockThemedChalk);

        // Should show placeholder for empty columns
        expect(result).toContain('(empty)');
      });

      it('should handle uneven column heights', () => {
        const columns: KanbanColumn[] = [
          {
            name: 'BACKLOG',
            color: mockThemedChalk.backlog,
            stories: [
              createMockStory({ id: 'S-0001' }),
              createMockStory({ id: 'S-0002' }),
              createMockStory({ id: 'S-0003' }),
            ],
          },
          {
            name: 'READY',
            color: mockThemedChalk.ready,
            stories: [createMockStory({ id: 'S-0004' })],
          },
          {
            name: 'IN-PROGRESS',
            color: mockThemedChalk.inProgress,
            stories: [],
          },
          {
            name: 'DONE',
            color: mockThemedChalk.done,
            stories: [
              createMockStory({ id: 'S-0005' }),
              createMockStory({ id: 'S-0006' }),
            ],
          },
        ];

        process.stdout.columns = 120;
        const result = renderKanbanBoard(columns, mockThemedChalk);

        // Should render without errors
        expect(result).toBeDefined();
        // All stories should be present
        expect(result).toContain('S-0001');
        expect(result).toContain('S-0004');
        expect(result).toContain('S-0005');
        expect(result).toContain('S-0006');
      });

      it('should display story counts in headers', () => {
        const columns: KanbanColumn[] = [
          {
            name: 'BACKLOG',
            color: mockThemedChalk.backlog,
            stories: [createMockStory(), createMockStory(), createMockStory()],
          },
          {
            name: 'READY',
            color: mockThemedChalk.ready,
            stories: [createMockStory(), createMockStory()],
          },
          {
            name: 'IN-PROGRESS',
            color: mockThemedChalk.inProgress,
            stories: [createMockStory()],
          },
          {
            name: 'DONE',
            color: mockThemedChalk.done,
            stories: [],
          },
        ];

        process.stdout.columns = 120;
        const result = renderKanbanBoard(columns, mockThemedChalk);

        // Should show counts
        expect(result).toContain('(3)');
        expect(result).toContain('(2)');
        expect(result).toContain('(1)');
        expect(result).toContain('(0)');
      });

      it('should handle all empty columns', () => {
        const columns: KanbanColumn[] = [
          {
            name: 'BACKLOG',
            color: mockThemedChalk.backlog,
            stories: [],
          },
          {
            name: 'READY',
            color: mockThemedChalk.ready,
            stories: [],
          },
          {
            name: 'IN-PROGRESS',
            color: mockThemedChalk.inProgress,
            stories: [],
          },
          {
            name: 'DONE',
            color: mockThemedChalk.done,
            stories: [],
          },
        ];

        process.stdout.columns = 120;
        const result = renderKanbanBoard(columns, mockThemedChalk);

        // Should render headers even when all empty
        expect(result).toContain('BACKLOG');
        expect(result).toContain('READY');
        expect(result).toContain('IN-PROGRESS');
        expect(result).toContain('DONE');
        expect(result).toContain('(empty)');
      });

      it('should truncate long story titles to fit column width', () => {
        const longTitle = 'This is a very long story title that should be truncated to fit within the allocated column width for the kanban board';
        const columns: KanbanColumn[] = [
          {
            name: 'BACKLOG',
            color: mockThemedChalk.backlog,
            stories: [createMockStory({ title: longTitle })],
          },
          {
            name: 'READY',
            color: mockThemedChalk.ready,
            stories: [],
          },
          {
            name: 'IN-PROGRESS',
            color: mockThemedChalk.inProgress,
            stories: [],
          },
          {
            name: 'DONE',
            color: mockThemedChalk.done,
            stories: [],
          },
        ];

        process.stdout.columns = 120;
        const result = renderKanbanBoard(columns, mockThemedChalk);

        // Should contain ellipsis indicating truncation
        expect(result).toContain('...');
        // Should not contain full title
        expect(result).not.toContain(longTitle);
      });

      it('should align column borders correctly', () => {
        const columns: KanbanColumn[] = [
          {
            name: 'BACKLOG',
            color: mockThemedChalk.backlog,
            stories: [createMockStory()],
          },
          {
            name: 'READY',
            color: mockThemedChalk.ready,
            stories: [createMockStory()],
          },
          {
            name: 'IN-PROGRESS',
            color: mockThemedChalk.inProgress,
            stories: [createMockStory()],
          },
          {
            name: 'DONE',
            color: mockThemedChalk.done,
            stories: [createMockStory()],
          },
        ];

        process.stdout.columns = 120;
        const result = renderKanbanBoard(columns, mockThemedChalk);

        const lines = result.split('\n');
        // Check that we have the expected structure:
        // - Header row (with 3 │ separators for 4 columns)
        // - Separator row (with ┼ instead of │)
        // - Story rows (with 3 column │ separators + │ in each story entry)
        expect(lines.length).toBeGreaterThan(0);

        // Header row should have numColumns - 1 separators
        const headerLine = lines[0];
        const headerBorderCount = (headerLine.match(/│/g) || []).length;
        expect(headerBorderCount).toBe(3); // 4 columns = 3 separators

        // Story rows should have column separators + story dividers
        const storyLines = lines.filter((line, idx) => idx > 1 && line.includes('│'));
        if (storyLines.length > 0) {
          // Each story row should have consistent number of │ characters
          const storyBorderCount = (storyLines[0].match(/│/g) || []).length;
          for (const line of storyLines) {
            const currentBorderCount = (line.match(/│/g) || []).length;
            expect(currentBorderCount).toBe(storyBorderCount);
          }
        }
      });
    });
  });
});
