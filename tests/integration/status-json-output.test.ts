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

/** Helper to write a story markdown file into the fixture directory */
function writeStoryFixture(sdlcRoot: string, id: string, fields: Record<string, unknown>): void {
  const dir = path.join(sdlcRoot, STORIES_FOLDER, id);
  fs.mkdirSync(dir, { recursive: true });
  const fm = Object.entries(fields).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}: [${v.map(i => JSON.stringify(i)).join(', ')}]`;
    // Quote date-like strings so YAML doesn't auto-convert to Date objects
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${k}: '${v}'`;
    return `${k}: ${v}`;
  }).join('\n');
  fs.writeFileSync(path.join(dir, 'story.md'), `---\n${fm}\n---\n\n# ${fields.title}\n`);
}

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
    it('should output valid JSON with v1 schema when --json flag is provided', async () => {
      const sdlcRoot = getSdlcRoot();

      // Create stories in different statuses
      createStory('Backlog Story', sdlcRoot);

      writeStoryFixture(sdlcRoot, 'ready-1', {
        id: 'ready-1', title: 'Ready Story', slug: 'ready-story',
        priority: 20, status: 'ready', type: 'feature', created: '2024-01-02',
        labels: [], research_complete: true, plan_complete: true,
        implementation_complete: false, reviews_complete: false,
      });

      writeStoryFixture(sdlcRoot, 'in-progress-1', {
        id: 'in-progress-1', title: 'In Progress Story', slug: 'in-progress-story',
        priority: 30, status: 'in-progress', type: 'bug', created: '2024-01-03',
        labels: [], research_complete: true, plan_complete: true,
        implementation_complete: false, reviews_complete: false,
      });

      writeStoryFixture(sdlcRoot, 'done-1', {
        id: 'done-1', title: 'Done Story', slug: 'done-story',
        priority: 40, status: 'done', type: 'chore', created: '2024-01-04',
        labels: [], research_complete: true, plan_complete: true,
        implementation_complete: true, reviews_complete: true,
      });

      await status({ json: true });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);

      const parsed: StatusJsonOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      // Verify v1 schema envelope
      expect(parsed.version).toBe(1);
      expect(parsed.generatedAt).toBeDefined();
      expect(new Date(parsed.generatedAt).toISOString()).toBe(parsed.generatedAt);

      // Verify arrays
      expect(Array.isArray(parsed.backlog)).toBe(true);
      expect(Array.isArray(parsed.ready)).toBe(true);
      expect(Array.isArray(parsed.inProgress)).toBe(true);
      expect(Array.isArray(parsed.done)).toBe(true);
      expect(Array.isArray(parsed.blocked)).toBe(true);

      // Verify story counts per column
      expect(parsed.backlog).toHaveLength(1);
      expect(parsed.ready).toHaveLength(1);
      expect(parsed.inProgress).toHaveLength(1);
      expect(parsed.done).toHaveLength(1);
      expect(parsed.blocked).toHaveLength(0);

      // Verify total
      expect(parsed.total).toBe(4);

      // Verify no `counts` property (removed)
      expect(parsed).not.toHaveProperty('counts');
    });

    it('should include all required fields including slug and labels in each story', async () => {
      const sdlcRoot = getSdlcRoot();

      writeStoryFixture(sdlcRoot, 'test-story-1', {
        id: 'test-story-1', title: 'Test Story Title', slug: 'test-story-title',
        priority: 50, status: 'backlog', type: 'spike', created: '2024-02-05',
        labels: ['epic-auth', 'sprint-1'],
        research_complete: false, plan_complete: false,
        implementation_complete: false, reviews_complete: false,
      });

      await status({ json: true });

      const parsed: StatusJsonOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      const storyObj = parsed.backlog[0];

      // Verify all required fields
      expect(storyObj.id).toBe('test-story-1');
      expect(storyObj.slug).toBe('test-story-title');
      expect(storyObj.title).toBe('Test Story Title');
      expect(storyObj.status).toBe('backlog');
      expect(storyObj.priority).toBe(50);
      expect(storyObj.type).toBe('spike');
      expect(storyObj.created).toBe('2024-02-05');
      expect(storyObj.labels).toEqual(['epic-auth', 'sprint-1']);
    });

    it('should default labels to empty array when story has no labels', async () => {
      const sdlcRoot = getSdlcRoot();
      createStory('No Labels Story', sdlcRoot);

      await status({ json: true });

      const parsed: StatusJsonOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(parsed.backlog[0].labels).toEqual([]);
    });

    it('should output valid JSON for an empty board', async () => {
      await status({ json: true });

      const parsed: StatusJsonOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(parsed.version).toBe(1);
      expect(parsed.backlog).toEqual([]);
      expect(parsed.ready).toEqual([]);
      expect(parsed.inProgress).toEqual([]);
      expect(parsed.done).toEqual([]);
      expect(parsed.blocked).toEqual([]);
      expect(parsed.total).toBe(0);
    });

    it('should not output visual elements in JSON mode', async () => {
      const sdlcRoot = getSdlcRoot();
      createStory('Test Story', sdlcRoot);

      await status({ json: true });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);

      const output = consoleLogSpy.mock.calls[0][0];

      expect(output).not.toContain('═══');
      expect(output).not.toContain('│');
      expect(output).not.toContain('BACKLOG');
      expect(output).not.toContain('AI SDLC Board');
      expect(output).not.toContain('Recommended:');
    });
  });

  describe.sequential('Blocked Stories', () => {
    it('should include blocked stories in the blocked array', async () => {
      const sdlcRoot = getSdlcRoot();

      writeStoryFixture(sdlcRoot, 'blocked-1', {
        id: 'blocked-1', title: 'Blocked Story', slug: 'blocked-story',
        priority: 10, status: 'blocked', type: 'feature', created: '2024-01-01',
        labels: ['epic-infra'],
        research_complete: true, plan_complete: true,
        implementation_complete: false, reviews_complete: false,
        blocked_reason: 'Dependency not available',
      });

      writeStoryFixture(sdlcRoot, 'backlog-1', {
        id: 'backlog-1', title: 'Backlog Story', slug: 'backlog-story',
        priority: 20, status: 'backlog', type: 'feature', created: '2024-01-02',
        labels: [],
        research_complete: false, plan_complete: false,
        implementation_complete: false, reviews_complete: false,
      });

      await status({ json: true });

      const parsed: StatusJsonOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(parsed.blocked).toHaveLength(1);
      expect(parsed.blocked[0].id).toBe('blocked-1');
      expect(parsed.blocked[0].slug).toBe('blocked-story');
      expect(parsed.blocked[0].labels).toEqual(['epic-infra']);
      expect(parsed.backlog).toHaveLength(1);
      expect(parsed.total).toBe(2);
    });
  });

  describe.sequential('Total Field', () => {
    it('should have total equal to sum of all array lengths', async () => {
      const sdlcRoot = getSdlcRoot();

      createStory('Backlog 1', sdlcRoot);
      createStory('Backlog 2', sdlcRoot);

      writeStoryFixture(sdlcRoot, 'ready-1', {
        id: 'ready-1', title: 'Ready', slug: 'ready',
        priority: 30, status: 'ready', type: 'feature', created: '2024-01-03',
        labels: [], research_complete: true, plan_complete: true,
        implementation_complete: false, reviews_complete: false,
      });

      writeStoryFixture(sdlcRoot, 'blocked-1', {
        id: 'blocked-1', title: 'Blocked', slug: 'blocked',
        priority: 40, status: 'blocked', type: 'bug', created: '2024-01-04',
        labels: [],
        research_complete: true, plan_complete: true,
        implementation_complete: false, reviews_complete: false,
      });

      await status({ json: true });

      const parsed: StatusJsonOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      const sum = parsed.backlog.length + parsed.ready.length +
        parsed.inProgress.length + parsed.done.length + parsed.blocked.length;
      expect(parsed.total).toBe(sum);
      expect(parsed.total).toBe(4);
    });
  });

  describe.sequential('Security - Allowlist Verification', () => {
    it('should NOT expose sensitive fields (path, content, last_error, blocked_diagnostic, worktree_path)', async () => {
      const sdlcRoot = getSdlcRoot();

      writeStoryFixture(sdlcRoot, 'sensitive-1', {
        id: 'sensitive-1', title: 'Sensitive Story', slug: 'sensitive-story',
        priority: 10, status: 'backlog', type: 'feature', created: '2024-01-01',
        labels: [],
        research_complete: false, plan_complete: false,
        implementation_complete: false, reviews_complete: false,
        last_error: 'secret error details',
        worktree_path: '/home/user/secret/path',
      });

      await status({ json: true });

      const parsed: StatusJsonOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      const story = parsed.backlog[0] as Record<string, unknown>;

      expect(story).not.toHaveProperty('path');
      expect(story).not.toHaveProperty('content');
      expect(story).not.toHaveProperty('last_error');
      expect(story).not.toHaveProperty('blocked_diagnostic');
      expect(story).not.toHaveProperty('worktree_path');

      // Verify only allowlisted fields exist
      const allowedFields = ['id', 'slug', 'title', 'status', 'priority', 'type', 'created', 'labels'];
      expect(Object.keys(story).sort()).toEqual(allowedFields.sort());
    });
  });

  describe.sequential('JSON Output with --active Flag', () => {
    it('should exclude done stories but include blocked when --active is set', async () => {
      const sdlcRoot = getSdlcRoot();

      createStory('Backlog Story', sdlcRoot);

      writeStoryFixture(sdlcRoot, 'done-1', {
        id: 'done-1', title: 'Done Story 1', slug: 'done-story-1',
        priority: 10, status: 'done', type: 'feature', created: '2024-01-01',
        labels: [], research_complete: true, plan_complete: true,
        implementation_complete: true, reviews_complete: true,
      });

      writeStoryFixture(sdlcRoot, 'done-2', {
        id: 'done-2', title: 'Done Story 2', slug: 'done-story-2',
        priority: 20, status: 'done', type: 'bug', created: '2024-01-02',
        labels: [], research_complete: true, plan_complete: true,
        implementation_complete: true, reviews_complete: true,
      });

      writeStoryFixture(sdlcRoot, 'blocked-1', {
        id: 'blocked-1', title: 'Blocked Story', slug: 'blocked-story',
        priority: 30, status: 'blocked', type: 'feature', created: '2024-01-03',
        labels: [],
        research_complete: true, plan_complete: true,
        implementation_complete: false, reviews_complete: false,
      });

      await status({ json: true, active: true });

      const parsed: StatusJsonOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      // Done excluded
      expect(parsed.done).toEqual([]);

      // Blocked still included
      expect(parsed.blocked).toHaveLength(1);
      expect(parsed.blocked[0].id).toBe('blocked-1');

      // Backlog still present
      expect(parsed.backlog).toHaveLength(1);

      // Total adjusts (done excluded)
      expect(parsed.total).toBe(2); // backlog + blocked
    });
  });

  describe.sequential('Edge Cases', () => {
    it('should handle stories with emojis in titles', async () => {
      const sdlcRoot = getSdlcRoot();

      writeStoryFixture(sdlcRoot, 'emoji-story', {
        id: 'emoji-story', title: '🚀 Deploy feature with ✨ magic', slug: 'emoji-story',
        priority: 10, status: 'backlog', type: 'feature', created: '2024-01-01',
        labels: [],
        research_complete: false, plan_complete: false,
        implementation_complete: false, reviews_complete: false,
      });

      await status({ json: true });

      const parsed: StatusJsonOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(parsed.backlog[0].title).toBe('🚀 Deploy feature with ✨ magic');
    });

    it('should handle very long story titles', async () => {
      const sdlcRoot = getSdlcRoot();

      const longTitle = 'A'.repeat(200);
      writeStoryFixture(sdlcRoot, 'long-title-story', {
        id: 'long-title-story', title: longTitle, slug: 'long-title-story',
        priority: 10, status: 'backlog', type: 'feature', created: '2024-01-01',
        labels: [],
        research_complete: false, plan_complete: false,
        implementation_complete: false, reviews_complete: false,
      });

      await status({ json: true });

      const parsed: StatusJsonOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(parsed.backlog[0].title).toBe(longTitle);
      expect(parsed.backlog[0].title).toHaveLength(200);
    });

    it('should handle multiple stories in the same column', async () => {
      const sdlcRoot = getSdlcRoot();

      for (let i = 1; i <= 5; i++) {
        writeStoryFixture(sdlcRoot, `backlog-story-${i}`, {
          id: `backlog-story-${i}`, title: `Backlog Story ${i}`, slug: `backlog-story-${i}`,
          priority: i * 10, status: 'backlog', type: 'feature', created: `2024-01-0${i}`,
          labels: [],
          research_complete: false, plan_complete: false,
          implementation_complete: false, reviews_complete: false,
        });
      }

      await status({ json: true });

      const parsed: StatusJsonOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(parsed.backlog).toHaveLength(5);
      expect(parsed.total).toBe(5);

      // Verify stories are ordered by priority
      expect(parsed.backlog[0].priority).toBe(10);
      expect(parsed.backlog[4].priority).toBe(50);
    });
  });

  describe.sequential('Backward Compatibility', () => {
    it('should not affect default behavior when --json flag is not provided', async () => {
      const sdlcRoot = getSdlcRoot();
      createStory('Test Story', sdlcRoot);

      await status();

      // Verify console.log was called multiple times (visual output)
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(1);

      // Verify visual elements are present
      const allOutput = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(allOutput).toContain('AI SDLC Board');
    });
  });
});
