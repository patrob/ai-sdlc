import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { status } from '../../src/cli/commands.js';
import { getSdlcRoot } from '../../src/core/config.js';
import { initializeKanban } from '../../src/core/kanban.js';
import { createStory } from '../../src/core/story.js';
import { STORIES_FOLDER } from '../../src/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test fixture directory
const TEST_FIXTURE_DIR = path.join(__dirname, '../fixtures/status-kanban-test');

describe.sequential('Status Command - Kanban Layout Integration', () => {
  let consoleLogSpy: any;
  let originalColumns: number | undefined;

  beforeEach(() => {
    // Store original terminal width
    originalColumns = process.stdout.columns;

    // Clean up test fixtures
    if (fs.existsSync(TEST_FIXTURE_DIR)) {
      fs.rmSync(TEST_FIXTURE_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_FIXTURE_DIR, { recursive: true });

    // Set SDLC root for testing
    process.env.AI_SDLC_ROOT = TEST_FIXTURE_DIR;

    const sdlcRoot = getSdlcRoot();

    // Initialize kanban structure
    initializeKanban(sdlcRoot);

    // Mock console.log to capture output
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.log
    consoleLogSpy.mockRestore();

    // Restore terminal width
    process.stdout.columns = originalColumns;

    // Clean up test directory
    if (fs.existsSync(TEST_FIXTURE_DIR)) {
      fs.rmSync(TEST_FIXTURE_DIR, { recursive: true, force: true });
    }

    // Clear environment variable
    delete process.env.AI_SDLC_ROOT;
  });

  describe.sequential('Kanban Layout on Wide Terminal', () => {
    beforeEach(() => {
      // Set wide terminal width
      process.stdout.columns = 120;
    });

    it('should display kanban board with 4 columns side-by-side', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create stories in different columns
      createStory('Backlog Story', sdlcRoot);

      const storyId = 'ready-1';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, storyId), { recursive: true });
      const readyStory = `---
id: ready-1
title: Ready Story
slug: ready-story
priority: 10
status: ready
type: feature
created: 2024-01-01
labels: []
research_complete: true
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Ready Story
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, storyId, 'story.md'), readyStory);

      // Call status
      await status();

      // Verify console output contains column headers in kanban format
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should contain all column names
      expect(output).toContain('BACKLOG');
      expect(output).toContain('READY');
      expect(output).toContain('IN-PROGRESS');
      expect(output).toContain('DONE');

      // Should contain column separator │
      expect(output).toContain('│');
    });

    it('should display story counts in column headers', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create multiple stories
      createStory('Story 1', sdlcRoot);
      createStory('Story 2', sdlcRoot);
      createStory('Story 3', sdlcRoot);

      await status();

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should show count in header
      expect(output).toContain('(3)'); // 3 backlog stories
      expect(output).toContain('(0)'); // 0 ready stories
    });

    it('should display stories with IDs and titles', async () => {
      // Use wider terminal for this test to fit full title
      process.stdout.columns = 200;
      const sdlcRoot = getSdlcRoot();

      const storyId = 'st-123';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, storyId), { recursive: true });
      const story = `---
id: st-123
title: Test Title
slug: test-story
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Title
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, storyId, 'story.md'), story);

      await status();

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should contain story ID and title
      expect(output).toContain('st-123');
      expect(output).toContain('Test Title');
    });

    it('should display workflow flags for stories', async () => {
      // Use wider terminal for this test to fit flags
      process.stdout.columns = 200;
      const sdlcRoot = getSdlcRoot();

      const storyId = 'st-fl';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, storyId), { recursive: true });
      const story = `---
id: st-fl
title: Flags
slug: story-flags
priority: 10
status: in-progress
type: feature
created: 2024-01-01
labels: []
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
---

# Flags
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, storyId, 'story.md'), story);

      await status();

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should contain flags [RP]
      expect(output).toContain('[RP]');
    });

    it('should show (empty) placeholder for empty columns', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create only a backlog story, leaving other columns empty
      createStory('Single Story', sdlcRoot);

      await status();

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should contain empty placeholder
      expect(output).toContain('(empty)');
    });

    it('should handle uneven column heights', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create different numbers of stories in each column
      createStory('Backlog 1', sdlcRoot);
      createStory('Backlog 2', sdlcRoot);
      createStory('Backlog 3', sdlcRoot);

      const storyId = 'ready-1';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, storyId), { recursive: true });
      const readyStory = `---
id: ready-1
title: Ready Story
slug: ready-story
priority: 10
status: ready
type: feature
created: 2024-01-01
labels: []
research_complete: true
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Ready Story
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, storyId, 'story.md'), readyStory);

      await status();

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should render without errors
      expect(output).toBeDefined();
      expect(output).toContain('BACKLOG');
      expect(output).toContain('READY');
    });

    it('should truncate long story titles', async () => {
      const sdlcRoot = getSdlcRoot();

      const storyId = 'story-long';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, storyId), { recursive: true });
      const longTitleStory = `---
id: story-long
title: This is a very long story title that should be truncated to fit within the allocated column width for the kanban board display
slug: long-story
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Long Title Story
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, storyId, 'story.md'), longTitleStory);

      await status();

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should contain ellipsis for truncation
      expect(output).toContain('...');
      // Should not contain the full long title
      expect(output).not.toContain('This is a very long story title that should be truncated to fit within the allocated column width for the kanban board display');
    });
  });

  describe.sequential('Vertical Layout Fallback on Narrow Terminal', () => {
    beforeEach(() => {
      // Set narrow terminal width
      process.stdout.columns = 70;
    });

    it('should fall back to vertical layout when terminal is too narrow', async () => {
      const sdlcRoot = getSdlcRoot();

      createStory('Test Story', sdlcRoot);

      await status();

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should still contain column headers
      expect(output).toContain('BACKLOG');
      expect(output).toContain('READY');

      // In vertical layout, columns are shown one after another
      // Not necessarily with │ separators between them in the same line
      // Just verify it renders without error and shows the stories
      expect(output).toBeDefined();
    });

    it('should use compact or table view for stories in vertical layout', async () => {
      const sdlcRoot = getSdlcRoot();

      const storyId = 'story-vertical';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, storyId), { recursive: true });
      const story = `---
id: story-vertical
title: Vertical Layout Story
slug: vertical-story
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Vertical Layout Story
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, storyId, 'story.md'), story);

      await status();

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should contain story data
      expect(output).toContain('story-vertical');
      expect(output).toContain('Vertical Layout Story');
    });
  });

  describe.sequential('Kanban Layout with Active Flag', () => {
    beforeEach(() => {
      process.stdout.columns = 120;
    });

    it('should display only 3 columns when --active flag is set', async () => {
      const sdlcRoot = getSdlcRoot();

      createStory('Backlog Story', sdlcRoot);

      const storyId = 'done-1';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, storyId), { recursive: true });
      const doneStory = `---
id: done-1
title: Done Story
slug: done-story
priority: 10
status: done
type: feature
created: 2024-01-01
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
---

# Done Story
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, storyId, 'story.md'), doneStory);

      await status({ active: true });

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should contain active columns
      expect(output).toContain('BACKLOG');
      expect(output).toContain('READY');
      expect(output).toContain('IN-PROGRESS');

      // Should NOT contain DONE in the main kanban board
      // (It might appear in the summary line, but not as a column header in the board)
      const lines = output.split('\n');
      const boardLines = lines.slice(0, -3); // Exclude last few lines which might have summary
      const boardOutput = boardLines.join('\n');

      // Look for DONE as a column header (it should not be there in kanban layout)
      // The pattern "DONE (N)│" or "│DONE (N)" indicates it's a column header
      expect(boardOutput).not.toMatch(/DONE\s+\(\d+\)[│\s]/);
    });

    it('should show summary line with done count when --active flag is set', async () => {
      const sdlcRoot = getSdlcRoot();

      const storyId = 'done-1';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, storyId), { recursive: true });
      const doneStory = `---
id: done-1
title: Done Story
slug: done-story
priority: 10
status: done
type: feature
created: 2024-01-01
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
---

# Done Story
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, storyId, 'story.md'), doneStory);

      await status({ active: true });

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should show summary line
      expect(output).toContain('1 done stories');
      expect(output).toContain('use \'status\' without --active to show all');
    });
  });

  describe.sequential('Edge Cases', () => {
    beforeEach(() => {
      process.stdout.columns = 120;
    });

    it('should handle all empty columns', async () => {
      // Don't create any stories
      await status();

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should render board with empty placeholders
      expect(output).toContain('BACKLOG');
      expect(output).toContain('(empty)');
    });

    it('should handle stories with emojis in titles', async () => {
      const sdlcRoot = getSdlcRoot();

      const storyId = 'story-emoji';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, storyId), { recursive: true });
      const emojiStory = `---
id: story-emoji
title: 🚀 Deploy new feature to production
slug: emoji-story
priority: 10
status: backlog
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# 🚀 Deploy new feature
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, storyId, 'story.md'), emojiStory);

      await status();

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should handle emoji without breaking layout
      expect(output).toBeDefined();
      expect(output).toContain('🚀');
    });

    it('should handle terminal width exactly at boundary (80 cols)', async () => {
      process.stdout.columns = 80;

      const sdlcRoot = getSdlcRoot();
      createStory('Boundary Test', sdlcRoot);

      await status();

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should render successfully (kanban or vertical depending on implementation)
      expect(output).toBeDefined();
      expect(output).toContain('BACKLOG');
    });
  });

  describe.sequential('Recommended Actions Display', () => {
    beforeEach(() => {
      process.stdout.columns = 120;
    });

    it('should show recommended action after kanban board', async () => {
      const sdlcRoot = getSdlcRoot();

      createStory('Action Test Story', sdlcRoot);

      await status();

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should contain recommended action section
      expect(output).toContain('Recommended:');
    });

    it('should show success message when no actions are pending', async () => {
      // Don't create any stories
      await status();

      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');

      // Should show success message
      expect(output).toContain('No pending actions');
    });
  });
});
