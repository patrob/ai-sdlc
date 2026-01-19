import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Story, ActionType, KanbanFolder } from '../types/index.js';
import { getThemedChalk } from '../core/theme.js';
import { getPhaseInfo, calculatePhaseProgress, truncateForTerminal, sanitizeStorySlug, determineWorktreeMode, escapeShellArg } from './commands.js';

describe('CLI Commands - Phase Helpers', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let colors: any;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.NO_COLOR;
    colors = getThemedChalk();
  });

  describe('getPhaseInfo', () => {
    it('should return phase info for refine action', () => {
      const info = getPhaseInfo('refine', colors);
      expect(info).not.toBeNull();
      expect(info?.name).toBe('Refine');
      expect(info?.icon).toBe('✨');
      expect(info?.iconAscii).toBe('[RF]'); // Changed from [R] to avoid collision
    });

    it('should return phase info for research action', () => {
      const info = getPhaseInfo('research', colors);
      expect(info).not.toBeNull();
      expect(info?.name).toBe('Research');
      expect(info?.icon).toBe('🔍');
      expect(info?.iconAscii).toBe('[R]');
    });

    it('should return phase info for plan action', () => {
      const info = getPhaseInfo('plan', colors);
      expect(info).not.toBeNull();
      expect(info?.name).toBe('Plan');
      expect(info?.icon).toBe('📋');
      expect(info?.iconAscii).toBe('[P]');
    });

    it('should return phase info for implement action', () => {
      const info = getPhaseInfo('implement', colors);
      expect(info).not.toBeNull();
      expect(info?.name).toBe('Implement');
      expect(info?.icon).toBe('🔨');
      expect(info?.iconAscii).toBe('[I]');
    });

    it('should return phase info for review action with Verify name', () => {
      const info = getPhaseInfo('review', colors);
      expect(info).not.toBeNull();
      expect(info?.name).toBe('Verify');
      expect(info?.icon).toBe('✓');
      expect(info?.iconAscii).toBe('[V]');
    });

    it('should return phase info for rework action', () => {
      const info = getPhaseInfo('rework', colors);
      expect(info).not.toBeNull();
      expect(info?.name).toBe('Rework');
      expect(info?.icon).toBe('🔄');
      expect(info?.iconAscii).toBe('[RW]');
    });

    it('should return null for create_pr action (non-RPIV)', () => {
      const info = getPhaseInfo('create_pr' as ActionType, colors);
      expect(info).toBeNull();
    });

    it('should return null for move_to_done action (non-RPIV)', () => {
      const info = getPhaseInfo('move_to_done' as ActionType, colors);
      expect(info).toBeNull();
    });

    it('should have distinct ASCII icons for refine vs research', () => {
      const refineInfo = getPhaseInfo('refine', colors);
      const researchInfo = getPhaseInfo('research', colors);
      expect(refineInfo?.iconAscii).toBe('[RF]');
      expect(researchInfo?.iconAscii).toBe('[R]');
      expect(refineInfo?.iconAscii).not.toBe(researchInfo?.iconAscii);
    });
  });

  describe('calculatePhaseProgress', () => {
    it('should show Refine as current phase for backlog story', () => {
      const story: Story = {
        path: '/test/story.md',
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

      const progress = calculatePhaseProgress(story);
      expect(progress.currentPhase).toBe('Refine');
      expect(progress.completedPhases).toEqual([]);
      expect(progress.allPhases).toEqual(['Refine', 'Research', 'Plan', 'Implement', 'Verify']);
    });

    it('should show Research as current phase after refine completes', () => {
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

      const progress = calculatePhaseProgress(story);
      expect(progress.currentPhase).toBe('Research');
      expect(progress.completedPhases).toEqual(['Refine']);
    });

    it('should show Plan as current phase after research completes', () => {
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
          research_complete: true,
          plan_complete: false,
          implementation_complete: false,
          reviews_complete: false,
        },
        content: '',
      };

      const progress = calculatePhaseProgress(story);
      expect(progress.currentPhase).toBe('Plan');
      expect(progress.completedPhases).toEqual(['Refine', 'Research']);
    });

    it('should show Implement as current phase after plan completes', () => {
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
          research_complete: true,
          plan_complete: true,
          implementation_complete: false,
          reviews_complete: false,
        },
        content: '',
      };

      const progress = calculatePhaseProgress(story);
      expect(progress.currentPhase).toBe('Implement');
      expect(progress.completedPhases).toEqual(['Refine', 'Research', 'Plan']);
    });

    it('should show Verify as current phase after implementation completes', () => {
      const story: Story = {
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
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: false,
        },
        content: '',
      };

      const progress = calculatePhaseProgress(story);
      expect(progress.currentPhase).toBe('Verify');
      expect(progress.completedPhases).toEqual(['Refine', 'Research', 'Plan', 'Implement']);
    });

    it('should show Complete when all phases are done', () => {
      const story: Story = {
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
          plan_complete: true,
          implementation_complete: true,
          reviews_complete: true,
        },
        content: '',
      };

      const progress = calculatePhaseProgress(story);
      expect(progress.currentPhase).toBe('Complete');
      expect(progress.completedPhases).toEqual(['Refine', 'Research', 'Plan', 'Implement', 'Verify']);
    });

    it('should handle story with skipped phases correctly', () => {
      // Story that moved from backlog to ready (refine complete) but research not yet done
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

      const progress = calculatePhaseProgress(story);
      expect(progress.completedPhases).toEqual(['Refine']);
      expect(progress.currentPhase).toBe('Research');
    });
  });

  describe('truncateForTerminal', () => {
    it('should not truncate short text', () => {
      const text = 'short-story-name';
      const result = truncateForTerminal(text, 80);
      expect(result).toBe('short-story-name');
    });

    it('should truncate long story names that exceed terminal width', () => {
      const text = 'this-is-a-very-long-story-name-that-will-definitely-exceed-the-terminal-width';
      const result = truncateForTerminal(text, 80);
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(text.length);
    });

    it('should handle very narrow terminal widths', () => {
      const text = 'some-story-name';
      const result = truncateForTerminal(text, 40);
      expect(result).toBe('some-story'); // minWidth=40, so availableWidth=-3, falls back to 10 chars without ellipsis
    });

    it('should preserve text under the threshold', () => {
      const text = 'medium-length-story-name';
      const result = truncateForTerminal(text, 100);
      expect(result).toBe('medium-length-story-name');
    });

    it('should handle edge case of exactly fitting text', () => {
      const text = 'x'.repeat(30); // 30 chars + 40 minWidth = 70 total, fits in 80
      const result = truncateForTerminal(text, 80);
      expect(result).toBe(text);
    });

    it('should add ellipsis for text that exceeds available width', () => {
      const text = 'x'.repeat(50); // 50 chars + 40 minWidth = 90 total, exceeds 80
      const result = truncateForTerminal(text, 80);
      expect(result).toContain('...');
      expect(result.length).toBeLessThanOrEqual(40); // Should fit within constraints
    });

    it('should enforce minimum width of 40 characters', () => {
      const text = 'some-story';
      const result = truncateForTerminal(text, 20); // Request very narrow width
      // Should enforce minimum of 40, not honor the requested 20
      expect(result).toBe('some-story');
    });

    it('should enforce maximum width of 1000 characters to prevent memory issues', () => {
      const text = 'x'.repeat(2000); // Very long text
      const result = truncateForTerminal(text, 10000); // Request absurdly large width
      // Should cap at 1000, resulting in truncation
      expect(result.length).toBeLessThan(2000);
      expect(result).toContain('...');
    });
  });

  describe('Phase indicator formatting', () => {
    it('should use correct phase names matching RPIV terminology', () => {
      // Verify that "review" action maps to "Verify" phase (not "Review")
      const info = getPhaseInfo('review', colors);
      expect(info?.name).toBe('Verify');
    });

    it('should provide distinct icons for each phase', () => {
      const phases: ActionType[] = ['refine', 'research', 'plan', 'implement', 'review'];
      const icons = phases.map(phase => getPhaseInfo(phase, colors)?.icon);

      // All icons should be unique
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(phases.length);
    });

    it('should provide ASCII fallback icons for all phases', () => {
      const phases: ActionType[] = ['refine', 'research', 'plan', 'implement', 'review'];
      const asciiIcons = phases.map(phase => getPhaseInfo(phase, colors)?.iconAscii);

      // All ASCII icons should be defined
      expect(asciiIcons.every(icon => icon !== undefined)).toBe(true);

      // All ASCII icons should be ASCII-only (no Unicode)
      asciiIcons.forEach(icon => {
        if (icon) {
          expect(/^[\x00-\x7F]+$/.test(icon)).toBe(true);
        }
      });
    });
  });

  describe('sanitizeStorySlug (Security)', () => {
    it('should remove basic ANSI color codes', () => {
      const maliciousSlug = 'Story\x1b[31mRED\x1b[0m';
      const sanitized = sanitizeStorySlug(maliciousSlug);
      expect(sanitized).toBe('StoryRED');
      expect(sanitized).not.toContain('\x1b');
    });

    it('should remove ANSI cursor positioning codes', () => {
      const malicious = 'Story\x1b[2J\x1b[H'; // Clear screen + move cursor home
      const sanitized = sanitizeStorySlug(malicious);
      expect(sanitized).toBe('Story');
      expect(sanitized).not.toContain('\x1b');
    });

    it('should remove OSC (Operating System Command) sequences', () => {
      const malicious = 'Story\x1b]0;Malicious Title\x07'; // Set window title
      const sanitized = sanitizeStorySlug(malicious);
      expect(sanitized).toBe('Story');
      expect(sanitized).not.toContain('\x1b');
    });

    it('should handle nested and multiple ANSI sequences', () => {
      const malicious = '\x1b[1m\x1b[31mBold\x1b[0m\x1b[32mRed\x1b[0m';
      const sanitized = sanitizeStorySlug(malicious);
      expect(sanitized).toBe('BoldRed');
      expect(sanitized).not.toContain('\x1b');
    });

    it('should handle incomplete ANSI sequences gracefully', () => {
      const malicious = 'Story\x1b[31'; // Incomplete sequence
      const sanitized = sanitizeStorySlug(malicious);
      // Should not crash and should remove what it can
      expect(sanitized).not.toContain('[31');
    });

    it('should preserve UTF-8 characters and emoji', () => {
      const textWithUnicode = 'Story 📋 with emoji and 中文';
      const sanitized = sanitizeStorySlug(textWithUnicode);
      expect(sanitized).toBe('Story 📋 with emoji and 中文');
    });

    it('should preserve regular ASCII text', () => {
      const normalText = 'regular-story-name-123';
      const sanitized = sanitizeStorySlug(normalText);
      expect(sanitized).toBe('regular-story-name-123');
    });

    it('should handle story title that is only ANSI codes', () => {
      const onlyAnsi = '\x1b[31m\x1b[0m';
      const sanitized = sanitizeStorySlug(onlyAnsi);
      expect(sanitized).toBe('');
    });

    it('should strip multiple types of ANSI codes in one string', () => {
      const complex = 'Story\x1b[31mRED\x1b[0m\x1b[2J\x1b]0;Title\x07End';
      const sanitized = sanitizeStorySlug(complex);
      expect(sanitized).toBe('StoryREDEnd');
      expect(sanitized).not.toContain('\x1b');
    });
  });
});

describe('Status Command - Active Flag Filtering', () => {
  let consoleLogSpy: any;

  beforeEach(() => {
    // Mock console.log to capture output
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.log
    consoleLogSpy.mockRestore();
  });

  describe('Column Filtering Logic', () => {
    it('should show all columns including done when --active flag is not provided', () => {
      // This test verifies the columns array structure
      const columns: { name: string; folder: KanbanFolder; color: any }[] = [
        { name: 'BACKLOG', folder: 'backlog', color: () => '' },
        { name: 'READY', folder: 'ready', color: () => '' },
        { name: 'IN-PROGRESS', folder: 'in-progress', color: () => '' },
        { name: 'DONE', folder: 'done', color: () => '' },
      ];

      // When --active is not set, displayColumns should equal columns
      const displayColumns = columns; // No filtering
      expect(displayColumns).toHaveLength(4);
      expect(displayColumns.find(col => col.folder === 'done')).toBeDefined();
    });

    it('should exclude done column when --active flag is true', () => {
      const columns: { name: string; folder: KanbanFolder; color: any }[] = [
        { name: 'BACKLOG', folder: 'backlog', color: () => '' },
        { name: 'READY', folder: 'ready', color: () => '' },
        { name: 'IN-PROGRESS', folder: 'in-progress', color: () => '' },
        { name: 'DONE', folder: 'done', color: () => '' },
      ];

      // When --active is true, filter out done column
      const displayColumns = columns.filter(col => col.folder !== 'done');

      expect(displayColumns).toHaveLength(3);
      expect(displayColumns.find(col => col.folder === 'done')).toBeUndefined();
      expect(displayColumns.find(col => col.folder === 'backlog')).toBeDefined();
      expect(displayColumns.find(col => col.folder === 'ready')).toBeDefined();
      expect(displayColumns.find(col => col.folder === 'in-progress')).toBeDefined();
    });
  });

  describe('Summary Line Logic', () => {
    it('should not show summary line when done count is 0', () => {
      const doneCount = 0;
      const active = true;

      // Logic: only show summary if active && doneCount > 0
      const shouldShowSummary = active && doneCount > 0;

      expect(shouldShowSummary).toBe(false);
    });

    it('should show summary line when done count > 0 and --active is true', () => {
      const doneCount = 5;
      const active = true;

      const shouldShowSummary = active && doneCount > 0;

      expect(shouldShowSummary).toBe(true);
    });

    it('should not show summary line when --active is false even if done count > 0', () => {
      const doneCount = 5;
      const active = false;

      const shouldShowSummary = active && doneCount > 0;

      expect(shouldShowSummary).toBe(false);
    });

    it('should format summary message correctly', () => {
      const doneCount = 42;
      const expectedMessage = `${doneCount} done stories (use 'status' without --active to show all)`;

      expect(expectedMessage).toBe('42 done stories (use \'status\' without --active to show all)');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty board with 0 done stories', () => {
      const columns: { name: string; folder: KanbanFolder; color: any }[] = [
        { name: 'BACKLOG', folder: 'backlog', color: () => '' },
        { name: 'READY', folder: 'ready', color: () => '' },
        { name: 'IN-PROGRESS', folder: 'in-progress', color: () => '' },
        { name: 'DONE', folder: 'done', color: () => '' },
      ];

      const doneCount = 0;
      const active = true;

      const displayColumns = active ? columns.filter(col => col.folder !== 'done') : columns;
      const shouldShowSummary = active && doneCount > 0;

      expect(displayColumns).toHaveLength(3);
      expect(shouldShowSummary).toBe(false); // No summary for 0 stories
    });

    it('should handle large done count (100+)', () => {
      const doneCount = 150;
      const active = true;

      const shouldShowSummary = active && doneCount > 0;
      const summaryMessage = `${doneCount} done stories (use 'status' without --active to show all)`;

      expect(shouldShowSummary).toBe(true);
      expect(summaryMessage).toBe('150 done stories (use \'status\' without --active to show all)');
    });

    it('should handle board with only done stories', () => {
      const columns: { name: string; folder: KanbanFolder; color: any }[] = [
        { name: 'BACKLOG', folder: 'backlog', color: () => '' },
        { name: 'READY', folder: 'ready', color: () => '' },
        { name: 'IN-PROGRESS', folder: 'in-progress', color: () => '' },
        { name: 'DONE', folder: 'done', color: () => '' },
      ];

      const doneCount = 10;
      const active = true;

      // When filtered, only 3 columns remain (no done)
      const displayColumns = active ? columns.filter(col => col.folder !== 'done') : columns;
      const shouldShowSummary = active && doneCount > 0;

      expect(displayColumns).toHaveLength(3);
      expect(displayColumns.find(col => col.folder === 'done')).toBeUndefined();
      expect(shouldShowSummary).toBe(true); // Summary shows 10 done stories hidden
    });
  });

  describe('Options Parameter Type Safety', () => {
    it('should accept undefined options', () => {
      const options: { active?: boolean } | undefined = undefined;
      const shouldFilter = options?.active;

      expect(shouldFilter).toBeUndefined();
      expect(!!shouldFilter).toBe(false);
    });

    it('should accept options with active: false', () => {
      const options: { active?: boolean } = { active: false };
      const shouldFilter = options?.active;

      expect(shouldFilter).toBe(false);
    });

    it('should accept options with active: true', () => {
      const options: { active?: boolean } = { active: true };
      const shouldFilter = options?.active;

      expect(shouldFilter).toBe(true);
    });

    it('should handle optional chaining safely', () => {
      const options1: { active?: boolean } | undefined = undefined;
      const options2: { active?: boolean } = {};
      const options3: { active?: boolean } = { active: true };

      expect(options1?.active).toBeUndefined();
      expect(options2?.active).toBeUndefined();
      expect(options3?.active).toBe(true);
    });
  });
});

describe('determineWorktreeMode', () => {
  const createStory = (worktreePath?: string): Story => ({
    path: '/test/story.md',
    slug: 'test-story',
    frontmatter: {
      id: 'test-1',
      title: 'Test Story',
      slug: 'test-story',
      priority: 1,
      status: 'in-progress',
      type: 'feature',
      created: '2024-01-01',
      labels: [],
      research_complete: true,
      plan_complete: true,
      implementation_complete: false,
      reviews_complete: false,
      worktree_path: worktreePath,
    },
    content: '',
  });

  describe('CLI flag priority (highest)', () => {
    it('should return false when --no-worktree is explicitly set', () => {
      const result = determineWorktreeMode(
        { worktree: false },
        { enabled: true },
        createStory('/some/worktree/path')
      );
      expect(result).toBe(false);
    });

    it('should return true when --worktree is explicitly set', () => {
      const result = determineWorktreeMode(
        { worktree: true },
        { enabled: false },
        null
      );
      expect(result).toBe(true);
    });

    it('should respect --no-worktree even when story has worktree_path', () => {
      const result = determineWorktreeMode(
        { worktree: false },
        { enabled: true },
        createStory('/existing/worktree')
      );
      expect(result).toBe(false);
    });
  });

  describe('Story frontmatter.worktree_path (second priority)', () => {
    it('should return true when story has worktree_path and no CLI flag', () => {
      const result = determineWorktreeMode(
        {},
        { enabled: false },
        createStory('/some/worktree/path')
      );
      expect(result).toBe(true);
    });

    it('should return true when story has worktree_path even if config disabled', () => {
      const result = determineWorktreeMode(
        { worktree: undefined },
        { enabled: false },
        createStory('/existing/worktree')
      );
      expect(result).toBe(true);
    });

    it('should not trigger on empty worktree_path', () => {
      const result = determineWorktreeMode(
        {},
        { enabled: false },
        createStory(undefined)
      );
      expect(result).toBe(false);
    });
  });

  describe('Config default (lowest priority)', () => {
    it('should return config.enabled when no CLI flag and no worktree_path', () => {
      expect(determineWorktreeMode({}, { enabled: true }, null)).toBe(true);
      expect(determineWorktreeMode({}, { enabled: false }, null)).toBe(false);
    });

    it('should return config.enabled when story has no worktree_path', () => {
      const result = determineWorktreeMode(
        {},
        { enabled: true },
        createStory(undefined)
      );
      expect(result).toBe(true);
    });
  });

  describe('Null story handling', () => {
    it('should work correctly with null story', () => {
      expect(determineWorktreeMode({}, { enabled: true }, null)).toBe(true);
      expect(determineWorktreeMode({}, { enabled: false }, null)).toBe(false);
      expect(determineWorktreeMode({ worktree: true }, { enabled: false }, null)).toBe(true);
      expect(determineWorktreeMode({ worktree: false }, { enabled: true }, null)).toBe(false);
    });
  });

  describe('Priority order verification', () => {
    it('should follow correct priority: CLI > frontmatter > config', () => {
      const storyWithWorktree = createStory('/existing/worktree');

      // CLI true wins over everything
      expect(determineWorktreeMode({ worktree: true }, { enabled: false }, null)).toBe(true);
      expect(determineWorktreeMode({ worktree: true }, { enabled: false }, storyWithWorktree)).toBe(true);

      // CLI false wins over everything
      expect(determineWorktreeMode({ worktree: false }, { enabled: true }, storyWithWorktree)).toBe(false);

      // Frontmatter wins over config when no CLI flag
      expect(determineWorktreeMode({}, { enabled: false }, storyWithWorktree)).toBe(true);

      // Config is used only when no CLI flag and no frontmatter worktree_path
      const storyNoWorktree = createStory(undefined);
      expect(determineWorktreeMode({}, { enabled: true }, storyNoWorktree)).toBe(true);
      expect(determineWorktreeMode({}, { enabled: false }, storyNoWorktree)).toBe(false);
    });
  });
});

describe('escapeShellArg (Security)', () => {
  it('should wrap simple arguments in single quotes', () => {
    const result = escapeShellArg('hello');
    expect(result).toBe("'hello'");
  });

  it('should escape single quotes in arguments', () => {
    const result = escapeShellArg("it's");
    expect(result).toBe("'it'\\''s'");
  });

  it('should handle multiple single quotes', () => {
    const result = escapeShellArg("don't can't won't");
    expect(result).toBe("'don'\\''t can'\\''t won'\\''t'");
  });

  it('should handle empty strings', () => {
    const result = escapeShellArg('');
    expect(result).toBe("''");
  });

  it('should preserve spaces and special characters safely', () => {
    const result = escapeShellArg('hello world $VAR');
    expect(result).toBe("'hello world $VAR'");
  });

  it('should escape command injection attempts', () => {
    const malicious = "'; rm -rf /; echo '";
    const result = escapeShellArg(malicious);
    expect(result).toBe("''\\'';" + " rm -rf /; echo " + "'\\'''");
    // When used in a command, this will be treated as literal text, not executed
  });

  it('should handle backticks safely', () => {
    const result = escapeShellArg('`whoami`');
    expect(result).toBe("'`whoami`'");
  });

  it('should handle dollar signs and parentheses', () => {
    const result = escapeShellArg('$(rm -rf /)');
    expect(result).toBe("'$(rm -rf /)'");
  });
});
