import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { status } from '../../src/cli/commands.js';
import { getSdlcRoot } from '../../src/core/config.js';
import { initializeKanban } from '../../src/core/kanban.js';
import { createStory } from '../../src/core/story.js';
import { STORIES_FOLDER } from '../../src/types/index.js';
import type { StatusJsonOutput } from '../../src/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test fixture directory
const TEST_FIXTURE_DIR = path.join(__dirname, '../fixtures/status-json-output-test');

describe.sequential('Status Command - JSON Output Integration', () => {
  let consoleLogSpy: any;

  beforeEach(() => {
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

    // Clean up test directory
    if (fs.existsSync(TEST_FIXTURE_DIR)) {
      fs.rmSync(TEST_FIXTURE_DIR, { recursive: true, force: true });
    }

    // Clear environment variable
    delete process.env.AI_SDLC_ROOT;
  });

  describe.sequential('Basic JSON Output', () => {
    it('should output valid JSON when --json flag is provided', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create stories in different statuses
      createStory('Backlog Story', sdlcRoot);

      // Create ready story
      const readyStoryId = 'ready-1';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, readyStoryId), { recursive: true });
      const readyStory = `---
id: ready-1
title: Ready Story
slug: ready-story
priority: 20
status: ready
type: feature
created: 2024-01-02
labels: []
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
---

# Ready Story
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, readyStoryId, 'story.md'), readyStory);

      // Create in-progress story
      const inProgressStoryId = 'in-progress-1';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, inProgressStoryId), { recursive: true });
      const inProgressStory = `---
id: in-progress-1
title: In Progress Story
slug: in-progress-story
priority: 30
status: in-progress
type: bug
created: 2024-01-03
labels: []
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
---

# In Progress Story
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, inProgressStoryId, 'story.md'), inProgressStory);

      // Create done story
      const doneStoryId = 'done-1';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, doneStoryId), { recursive: true });
      const doneStory = `---
id: done-1
title: Done Story
slug: done-story
priority: 40
status: done
type: chore
created: 2024-01-04
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
---

# Done Story
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, doneStoryId, 'story.md'), doneStory);

      // Call status with --json flag
      await status({ json: true });

      // Verify console.log was called exactly once
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);

      // Get the JSON output
      const output = consoleLogSpy.mock.calls[0][0];

      // Verify it's valid JSON
      let parsed: StatusJsonOutput;
      expect(() => {
        parsed = JSON.parse(output);
      }).not.toThrow();

      // Verify structure
      parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('backlog');
      expect(parsed).toHaveProperty('ready');
      expect(parsed).toHaveProperty('inProgress');
      expect(parsed).toHaveProperty('done');
      expect(parsed).toHaveProperty('counts');
      expect(Array.isArray(parsed.backlog)).toBe(true);
      expect(Array.isArray(parsed.ready)).toBe(true);
      expect(Array.isArray(parsed.inProgress)).toBe(true);
      expect(Array.isArray(parsed.done)).toBe(true);

      // Verify counts
      expect(parsed.counts.backlog).toBe(1);
      expect(parsed.counts.ready).toBe(1);
      expect(parsed.counts.inProgress).toBe(1);
      expect(parsed.counts.done).toBe(1);

      // Verify story count in each column
      expect(parsed.backlog).toHaveLength(1);
      expect(parsed.ready).toHaveLength(1);
      expect(parsed.inProgress).toHaveLength(1);
      expect(parsed.done).toHaveLength(1);
    });

    it('should include required fields in each story object', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create a single story with known values
      const storyId = 'test-story-1';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, storyId), { recursive: true });
      const story = `---
id: test-story-1
title: Test Story Title
slug: test-story-title
priority: 50
status: backlog
type: spike
created: 2024-02-05
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, storyId, 'story.md'), story);

      // Call status with --json flag
      await status({ json: true });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed: StatusJsonOutput = JSON.parse(output);

      // Get the story from backlog
      const storyObj = parsed.backlog[0];

      // Verify all required fields are present
      expect(storyObj).toHaveProperty('id');
      expect(storyObj).toHaveProperty('title');
      expect(storyObj).toHaveProperty('status');
      expect(storyObj).toHaveProperty('priority');
      expect(storyObj).toHaveProperty('type');
      expect(storyObj).toHaveProperty('created');

      // Verify values match
      expect(storyObj.id).toBe('test-story-1');
      expect(storyObj.title).toBe('Test Story Title');
      expect(storyObj.status).toBe('backlog');
      expect(storyObj.priority).toBe(50);
      expect(storyObj.type).toBe('spike');
      expect(storyObj.created).toBe('2024-02-05');
    });

    it('should output valid JSON for an empty board', async () => {
      // Don't create any stories

      // Call status with --json flag
      await status({ json: true });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed: StatusJsonOutput = JSON.parse(output);

      // Verify empty arrays
      expect(parsed.backlog).toEqual([]);
      expect(parsed.ready).toEqual([]);
      expect(parsed.inProgress).toEqual([]);
      expect(parsed.done).toEqual([]);

      // Verify zero counts
      expect(parsed.counts.backlog).toBe(0);
      expect(parsed.counts.ready).toBe(0);
      expect(parsed.counts.inProgress).toBe(0);
      expect(parsed.counts.done).toBe(0);
    });

    it('should not output visual elements in JSON mode', async () => {
      const sdlcRoot = getSdlcRoot();
      createStory('Test Story', sdlcRoot);

      // Call status with --json flag
      await status({ json: true });

      // Verify console.log was called exactly once
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);

      const output = consoleLogSpy.mock.calls[0][0];

      // Verify no visual elements (kanban board characters)
      expect(output).not.toContain('═══');
      expect(output).not.toContain('│');
      expect(output).not.toContain('BACKLOG');
      expect(output).not.toContain('AI SDLC Board');
      expect(output).not.toContain('Recommended:');
    });
  });

  describe.sequential('JSON Output with --active Flag', () => {
    it('should exclude done stories when both --json and --active flags are provided', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create backlog story
      createStory('Backlog Story', sdlcRoot);

      // Create done stories
      const doneStoryId1 = 'done-1';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, doneStoryId1), { recursive: true });
      const doneStory1 = `---
id: done-1
title: Done Story 1
slug: done-story-1
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

# Done Story 1
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, doneStoryId1, 'story.md'), doneStory1);

      const doneStoryId2 = 'done-2';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, doneStoryId2), { recursive: true });
      const doneStory2 = `---
id: done-2
title: Done Story 2
slug: done-story-2
priority: 20
status: done
type: bug
created: 2024-01-02
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
---

# Done Story 2
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, doneStoryId2, 'story.md'), doneStory2);

      // Call status with both --json and --active flags
      await status({ json: true, active: true });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed: StatusJsonOutput = JSON.parse(output);

      // Verify done array is empty
      expect(parsed.done).toEqual([]);

      // Verify done count is 0
      expect(parsed.counts.done).toBe(0);

      // Verify backlog story is still present
      expect(parsed.backlog).toHaveLength(1);
      expect(parsed.counts.backlog).toBe(1);
    });
  });

  describe.sequential('Edge Cases', () => {
    it('should handle stories with emojis in titles', async () => {
      const sdlcRoot = getSdlcRoot();

      const storyId = 'emoji-story';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, storyId), { recursive: true });
      const story = `---
id: emoji-story
title: 🚀 Deploy feature with ✨ magic
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

# Emoji Story
`;
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, storyId, 'story.md'), story);

      // Call status with --json flag
      await status({ json: true });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed: StatusJsonOutput = JSON.parse(output);

      // Verify emoji is preserved in JSON output
      expect(parsed.backlog[0].title).toBe('🚀 Deploy feature with ✨ magic');
    });

    it('should handle very long story titles', async () => {
      const sdlcRoot = getSdlcRoot();

      const longTitle = 'A'.repeat(200); // 200 character title
      const storyId = 'long-title-story';
      fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, storyId), { recursive: true });
      const story = `---
id: long-title-story
title: ${longTitle}
slug: long-title-story
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
      fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, storyId, 'story.md'), story);

      // Call status with --json flag
      await status({ json: true });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed: StatusJsonOutput = JSON.parse(output);

      // Verify full title is included (no truncation)
      expect(parsed.backlog[0].title).toBe(longTitle);
      expect(parsed.backlog[0].title).toHaveLength(200);
    });

    it('should handle multiple stories in the same column', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create 5 backlog stories
      for (let i = 1; i <= 5; i++) {
        const storyId = `backlog-story-${i}`;
        fs.mkdirSync(path.join(sdlcRoot, STORIES_FOLDER, storyId), { recursive: true });
        const story = `---
id: backlog-story-${i}
title: Backlog Story ${i}
slug: backlog-story-${i}
priority: ${i * 10}
status: backlog
type: feature
created: 2024-01-0${i}
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Backlog Story ${i}
`;
        fs.writeFileSync(path.join(sdlcRoot, STORIES_FOLDER, storyId, 'story.md'), story);
      }

      // Call status with --json flag
      await status({ json: true });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed: StatusJsonOutput = JSON.parse(output);

      // Verify all 5 stories are in backlog
      expect(parsed.backlog).toHaveLength(5);
      expect(parsed.counts.backlog).toBe(5);

      // Verify stories are ordered by priority
      expect(parsed.backlog[0].priority).toBe(10);
      expect(parsed.backlog[4].priority).toBe(50);
    });
  });

  describe.sequential('Backward Compatibility', () => {
    it('should not affect default behavior when --json flag is not provided', async () => {
      const sdlcRoot = getSdlcRoot();
      createStory('Test Story', sdlcRoot);

      // Call status without --json flag
      await status();

      // Verify console.log was called multiple times (visual output)
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(1);

      // Verify visual elements are present
      const allOutput = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(allOutput).toContain('AI SDLC Board');
    });
  });
});
