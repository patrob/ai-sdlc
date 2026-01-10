import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { status } from '../../src/cli/commands.js';
import { getSdlcRoot } from '../../src/core/config.js';
import { initializeKanban } from '../../src/core/kanban.js';
import { createStory } from '../../src/core/story.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test fixture directory
const TEST_FIXTURE_DIR = path.join(__dirname, '../fixtures/status-active-flag-test');

describe('Status Command - Active Flag Integration', () => {
  let consoleLogSpy: any;

  beforeEach(() => {
    // Clean up test fixtures
    if (fs.existsSync(TEST_FIXTURE_DIR)) {
      fs.rmSync(TEST_FIXTURE_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_FIXTURE_DIR, { recursive: true });

    // Set SDLC root for testing
    process.env.AGENTIC_SDLC_ROOT = TEST_FIXTURE_DIR;

    const sdlcRoot = getSdlcRoot();

    // Initialize kanban structure
    initializeKanban(sdlcRoot);

    // Mock console.log to capture output
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.log
    consoleLogSpy.mockRestore();

    // Clean up test directory
    if (fs.existsSync(TEST_FIXTURE_DIR)) {
      fs.rmSync(TEST_FIXTURE_DIR, { recursive: true, force: true });
    }

    // Clear environment variable
    delete process.env.AGENTIC_SDLC_ROOT;
  });

  describe('Default Behavior (No Flag)', () => {
    it('should show all columns including done when --active flag is not provided', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create stories in each folder
      createStory('Backlog Story', sdlcRoot);

      // Create a done story manually
      const doneStory = `---
id: done-1
title: Done Story
priority: 1
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
      fs.writeFileSync(path.join(sdlcRoot, 'done', 'done-story.md'), doneStory);

      // Call status without --active flag
      await status();

      // Verify console output contains all column headers
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('BACKLOG');
      expect(output).toContain('READY');
      expect(output).toContain('IN-PROGRESS');
      expect(output).toContain('DONE');
    });

    it('should not show summary line when --active flag is not provided', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create a done story
      const doneStory = `---
id: done-1
title: Done Story
priority: 1
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
      fs.writeFileSync(path.join(sdlcRoot, 'done', 'done-story.md'), doneStory);

      // Call status without --active flag
      await status();

      // Verify no summary line appears
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).not.toContain('done stories (use \'status\' without --active to show all)');
    });
  });

  describe('Active Flag Behavior', () => {
    it('should hide done column when --active flag is true', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create stories in each folder
      createStory('Backlog Story', sdlcRoot);

      const doneStory = `---
id: done-1
title: Done Story
priority: 1
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
      fs.writeFileSync(path.join(sdlcRoot, 'done', 'done-story.md'), doneStory);

      // Call status with --active flag
      await status({ active: true });

      // Verify console output contains active columns but not DONE
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('BACKLOG');
      expect(output).toContain('READY');
      expect(output).toContain('IN-PROGRESS');
      expect(output).not.toContain('DONE');
    });

    it('should show summary line when --active is true and done count > 0', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create 3 done stories
      for (let i = 1; i <= 3; i++) {
        const doneStory = `---
id: done-${i}
title: Done Story ${i}
priority: ${i}
status: done
type: feature
created: 2024-01-01
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
---

# Done Story ${i}
`;
        fs.writeFileSync(path.join(sdlcRoot, 'done', `done-story-${i}.md`), doneStory);
      }

      // Call status with --active flag
      await status({ active: true });

      // Verify summary line appears with correct count
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('3 done stories (use \'status\' without --active to show all)');
    });

    it('should not show summary line when --active is true but done count is 0', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create only a backlog story (no done stories)
      createStory('Backlog Story', sdlcRoot);

      // Call status with --active flag
      await status({ active: true });

      // Verify no summary line appears
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).not.toContain('done stories (use \'status\' without --active to show all)');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty board with 0 done stories', async () => {
      const sdlcRoot = getSdlcRoot();

      // No stories created - empty board

      // Call status with --active flag
      await status({ active: true });

      // Verify output contains columns but no summary
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('BACKLOG');
      expect(output).not.toContain('DONE');
      expect(output).not.toContain('done stories');
    });

    it('should handle large done count (100+)', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create 150 done stories
      for (let i = 1; i <= 150; i++) {
        const doneStory = `---
id: done-${i}
title: Done Story ${i}
priority: ${i}
status: done
type: feature
created: 2024-01-01
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
---

# Done Story ${i}
`;
        fs.writeFileSync(path.join(sdlcRoot, 'done', `done-story-${i}.md`), doneStory);
      }

      // Call status with --active flag
      await status({ active: true });

      // Verify summary line shows correct large count
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('150 done stories (use \'status\' without --active to show all)');
      expect(output).not.toContain('DONE');
    });

    it('should handle board with only done stories', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create only done stories (no active work)
      for (let i = 1; i <= 5; i++) {
        const doneStory = `---
id: done-${i}
title: Done Story ${i}
priority: ${i}
status: done
type: feature
created: 2024-01-01
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
---

# Done Story ${i}
`;
        fs.writeFileSync(path.join(sdlcRoot, 'done', `done-story-${i}.md`), doneStory);
      }

      // Call status with --active flag
      await status({ active: true });

      // Verify output shows empty board with summary
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('BACKLOG (0)');
      expect(output).toContain('READY (0)');
      expect(output).toContain('IN-PROGRESS (0)');
      expect(output).not.toContain('DONE');
      expect(output).toContain('5 done stories (use \'status\' without --active to show all)');
    });
  });

  describe('Options Parameter Handling', () => {
    it('should handle undefined options parameter', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create a done story
      const doneStory = `---
id: done-1
title: Done Story
priority: 1
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
      fs.writeFileSync(path.join(sdlcRoot, 'done', 'done-story.md'), doneStory);

      // Call status with undefined (same as no flag)
      await status(undefined);

      // Verify done column is shown
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('DONE');
      expect(output).not.toContain('done stories (use \'status\' without --active to show all)');
    });

    it('should handle options with active: false', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create a done story
      const doneStory = `---
id: done-1
title: Done Story
priority: 1
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
      fs.writeFileSync(path.join(sdlcRoot, 'done', 'done-story.md'), doneStory);

      // Call status with active: false
      await status({ active: false });

      // Verify done column is shown
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('DONE');
      expect(output).not.toContain('done stories (use \'status\' without --active to show all)');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain default behavior when no options provided', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create stories in each folder
      createStory('Backlog Story', sdlcRoot);

      const readyStory = `---
id: ready-1
title: Ready Story
priority: 1
status: ready
type: feature
created: 2024-01-01
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Ready Story
`;
      fs.writeFileSync(path.join(sdlcRoot, 'ready', 'ready-story.md'), readyStory);

      const doneStory = `---
id: done-1
title: Done Story
priority: 1
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
      fs.writeFileSync(path.join(sdlcRoot, 'done', 'done-story.md'), doneStory);

      // Call status with no parameters (backward compatible)
      await status();

      // Verify all columns are shown (including done)
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('BACKLOG (1)');
      expect(output).toContain('READY (1)');
      expect(output).toContain('DONE (1)');
    });
  });
});
