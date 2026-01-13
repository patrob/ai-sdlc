import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { migrateToFolderPerStory } from './migrate.js';
import { parseStory } from '../../core/story.js';

describe('Migration Command', () => {
  let testDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-13T10:30:00Z'));
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('migrateToFolderPerStory', () => {
    it('should migrate stories from backlog folder', async () => {
      const backlogDir = path.join(testDir, 'backlog');
      fs.mkdirSync(backlogDir, { recursive: true });

      const storyContent = `---
id: story-abc123
title: Test Story
priority: 1
status: backlog
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Test Story

Content here.`;

      fs.writeFileSync(path.join(backlogDir, '01-test-story.md'), storyContent);

      const result = await migrateToFolderPerStory(testDir, { backup: false, force: true });

      expect(result.dryRun).toBe(false);
      expect(result.errors).toHaveLength(0);
      expect(result.migrations).toHaveLength(1);
      expect(result.migrations[0].storyId).toBe('story-abc123');
      expect(result.migrations[0].status).toBe('backlog');
      expect(result.migrations[0].priority).toBe(1);
      expect(result.migrations[0].slug).toBe('test-story');

      const newPath = path.join(testDir, 'stories', 'story-abc123', 'story.md');
      expect(fs.existsSync(newPath)).toBe(true);

      const migratedStory = parseStory(newPath);
      expect(migratedStory.frontmatter.id).toBe('story-abc123');
      expect(migratedStory.frontmatter.status).toBe('backlog');
      expect(migratedStory.frontmatter.priority).toBe(1);
      expect(migratedStory.frontmatter.slug).toBe('test-story');
    });

    it('should migrate stories from all status folders', async () => {
      const folders = ['backlog', 'ready', 'in-progress', 'done', 'blocked'];

      for (let i = 0; i < folders.length; i++) {
        const folderPath = path.join(testDir, folders[i]);
        fs.mkdirSync(folderPath, { recursive: true });

        const storyContent = `---
id: story-${i}
title: Story ${i}
priority: ${i + 1}
status: ${folders[i]}
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Story ${i}`;

        fs.writeFileSync(path.join(folderPath, `0${i + 1}-story-${i}.md`), storyContent);
      }

      const result = await migrateToFolderPerStory(testDir, { backup: false, force: true });

      expect(result.errors).toHaveLength(0);
      expect(result.migrations).toHaveLength(5);

      for (let i = 0; i < folders.length; i++) {
        const newPath = path.join(testDir, 'stories', `story-${i}`, 'story.md');
        expect(fs.existsSync(newPath)).toBe(true);

        const story = parseStory(newPath);
        expect(story.frontmatter.status).toBe(folders[i]);
        expect(story.frontmatter.slug).toBe(`story-${i}`);
      }
    });

    it('should extract priority from filename prefix', async () => {
      const backlogDir = path.join(testDir, 'backlog');
      fs.mkdirSync(backlogDir, { recursive: true });

      const storyContent = `---
id: story-priority-test
title: Priority Test
priority: 999
status: backlog
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Priority Test`;

      fs.writeFileSync(path.join(backlogDir, '42-priority-test.md'), storyContent);

      const result = await migrateToFolderPerStory(testDir, { backup: false, force: true });

      expect(result.migrations[0].priority).toBe(42);

      const newPath = path.join(testDir, 'stories', 'story-priority-test', 'story.md');
      const story = parseStory(newPath);
      expect(story.frontmatter.priority).toBe(42);
    });

    it('should derive slug from filename without priority prefix', async () => {
      const backlogDir = path.join(testDir, 'backlog');
      fs.mkdirSync(backlogDir, { recursive: true });

      const storyContent = `---
id: story-slug-test
title: Slug Test
priority: 1
status: backlog
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Slug Test`;

      fs.writeFileSync(path.join(backlogDir, '05-my-awesome-story-name.md'), storyContent);

      const result = await migrateToFolderPerStory(testDir, { backup: false, force: true });

      expect(result.migrations[0].slug).toBe('my-awesome-story-name');

      const newPath = path.join(testDir, 'stories', 'story-slug-test', 'story.md');
      const story = parseStory(newPath);
      expect(story.frontmatter.slug).toBe('my-awesome-story-name');
    });

    it('should handle stories without priority prefix', async () => {
      const backlogDir = path.join(testDir, 'backlog');
      fs.mkdirSync(backlogDir, { recursive: true });

      const storyContent = `---
id: story-no-priority
title: No Priority
priority: 1
status: backlog
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# No Priority`;

      fs.writeFileSync(path.join(backlogDir, 'no-priority-story.md'), storyContent);

      const result = await migrateToFolderPerStory(testDir, { backup: false, force: true });

      expect(result.migrations[0].priority).toBe(99);
      expect(result.migrations[0].slug).toBe('no-priority-story');
    });

    it('should detect duplicate IDs and abort migration', async () => {
      const backlogDir = path.join(testDir, 'backlog');
      const readyDir = path.join(testDir, 'ready');
      fs.mkdirSync(backlogDir, { recursive: true });
      fs.mkdirSync(readyDir, { recursive: true });

      const storyContent = `---
id: story-duplicate
title: Duplicate Story
priority: 1
status: backlog
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Duplicate`;

      fs.writeFileSync(path.join(backlogDir, '01-story-one.md'), storyContent);
      fs.writeFileSync(path.join(readyDir, '01-story-two.md'), storyContent);

      const result = await migrateToFolderPerStory(testDir, { backup: false, force: true });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Duplicate story ID');
      expect(result.migrations).toHaveLength(0);

      expect(fs.existsSync(path.join(testDir, 'stories'))).toBe(false);
    });

    it('should generate IDs for stories without IDs and warn', async () => {
      const backlogDir = path.join(testDir, 'backlog');
      fs.mkdirSync(backlogDir, { recursive: true });

      const storyContent = `---
title: No ID Story
priority: 1
status: backlog
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# No ID`;

      fs.writeFileSync(path.join(backlogDir, '01-no-id-story.md'), storyContent);

      const result = await migrateToFolderPerStory(testDir, { backup: false, force: true });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('has no ID'))).toBe(true);
      expect(result.migrations).toHaveLength(1);
      expect(result.migrations[0].storyId).toMatch(/^story-[a-z0-9-]+$/);
    });

    it('should preserve non-.md files and warn', async () => {
      const backlogDir = path.join(testDir, 'backlog');
      fs.mkdirSync(backlogDir, { recursive: true });

      const storyContent = `---
id: story-test
title: Test
priority: 1
status: backlog
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Test`;

      fs.writeFileSync(path.join(backlogDir, '01-test.md'), storyContent);
      fs.writeFileSync(path.join(backlogDir, 'README.txt'), 'Some notes');

      const result = await migrateToFolderPerStory(testDir, { backup: false, force: true });

      expect(result.warnings.some(w => w.includes('Non-.md files'))).toBe(true);
      expect(result.warnings.some(w => w.includes('README.txt'))).toBe(true);

      expect(fs.existsSync(path.join(backlogDir, 'README.txt'))).toBe(true);
    });

    it('should remove empty old folders after migration', async () => {
      const backlogDir = path.join(testDir, 'backlog');
      fs.mkdirSync(backlogDir, { recursive: true });

      const storyContent = `---
id: story-cleanup
title: Cleanup Test
priority: 1
status: backlog
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Test`;

      fs.writeFileSync(path.join(backlogDir, '01-test.md'), storyContent);

      const result = await migrateToFolderPerStory(testDir, { backup: false, force: true });

      expect(result.errors).toHaveLength(0);
      expect(fs.existsSync(backlogDir)).toBe(false);
    });

    it('should not remove non-empty old folders', async () => {
      const backlogDir = path.join(testDir, 'backlog');
      fs.mkdirSync(backlogDir, { recursive: true });

      const storyContent = `---
id: story-preserve
title: Preserve Test
priority: 1
status: backlog
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Test`;

      fs.writeFileSync(path.join(backlogDir, '01-test.md'), storyContent);
      fs.writeFileSync(path.join(backlogDir, 'notes.txt'), 'Keep this');

      const result = await migrateToFolderPerStory(testDir, { backup: false, force: true });

      expect(fs.existsSync(backlogDir)).toBe(true);
      expect(result.warnings.some(w => w.includes('not removed'))).toBe(true);
    });

    it('should skip migration if already migrated', async () => {
      const migratedFile = path.join(testDir, '.migrated');
      fs.writeFileSync(migratedFile, JSON.stringify({ version: 2, migratedAt: '2026-01-12T00:00:00Z', storiesCount: 5 }));

      const result = await migrateToFolderPerStory(testDir, { backup: false, force: true });

      expect(result.warnings.some(w => w.includes('Already migrated'))).toBe(true);
      expect(result.migrations).toHaveLength(0);
    });

    it('should create migration state file after successful migration', async () => {
      const backlogDir = path.join(testDir, 'backlog');
      fs.mkdirSync(backlogDir, { recursive: true });

      const storyContent = `---
id: story-state-test
title: State Test
priority: 1
status: backlog
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Test`;

      fs.writeFileSync(path.join(backlogDir, '01-test.md'), storyContent);

      const result = await migrateToFolderPerStory(testDir, { backup: false, force: true });

      const migratedFile = path.join(testDir, '.migrated');
      expect(fs.existsSync(migratedFile)).toBe(true);

      const state = JSON.parse(fs.readFileSync(migratedFile, 'utf-8'));
      expect(state.version).toBe(2);
      expect(state.migratedAt).toBe('2026-01-13T10:30:00.000Z');
      expect(state.storiesCount).toBe(1);
    });

    it('should support dry-run mode without making changes', async () => {
      const backlogDir = path.join(testDir, 'backlog');
      fs.mkdirSync(backlogDir, { recursive: true });

      const storyPath = path.join(backlogDir, '01-test.md');
      const storyContent = `---
id: story-dryrun
title: Dry Run Test
priority: 1
status: backlog
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Test`;

      fs.writeFileSync(storyPath, storyContent);

      const result = await migrateToFolderPerStory(testDir, { dryRun: true, backup: false, force: true });

      expect(result.dryRun).toBe(true);
      expect(result.migrations).toHaveLength(1);
      expect(result.migrations[0].storyId).toBe('story-dryrun');

      expect(fs.existsSync(storyPath)).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'stories'))).toBe(false);
      expect(fs.existsSync(path.join(testDir, '.migrated'))).toBe(false);
    });

    it('should warn if active workflow state exists', async () => {
      const backlogDir = path.join(testDir, 'backlog');
      fs.mkdirSync(backlogDir, { recursive: true });

      const storyContent = `---
id: story-workflow
title: Workflow Test
priority: 1
status: backlog
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Test`;

      fs.writeFileSync(path.join(backlogDir, '01-test.md'), storyContent);

      const workflowState = { workflowId: 'test-123', completedActions: [] };
      fs.writeFileSync(path.join(testDir, '.workflow-state.json'), JSON.stringify(workflowState));

      const result = await migrateToFolderPerStory(testDir, { backup: false, force: true });

      expect(result.warnings.some(w => w.includes('Active workflow checkpoint'))).toBe(true);
    });

    it('should invalidate workflow state after migration', async () => {
      const backlogDir = path.join(testDir, 'backlog');
      fs.mkdirSync(backlogDir, { recursive: true });

      const storyContent = `---
id: story-invalidate
title: Invalidate Test
priority: 1
status: backlog
type: feature
created: '2026-01-13'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Test`;

      fs.writeFileSync(path.join(backlogDir, '01-test.md'), storyContent);

      const workflowStatePath = path.join(testDir, '.workflow-state.json');
      const workflowState = { workflowId: 'test-456', completedActions: [] };
      fs.writeFileSync(workflowStatePath, JSON.stringify(workflowState));

      await migrateToFolderPerStory(testDir, { backup: false, force: true });

      const updatedState = JSON.parse(fs.readFileSync(workflowStatePath, 'utf-8'));
      expect(updatedState.invalidated).toBe(true);
      expect(updatedState.invalidatedReason).toBe('Story paths changed during migration');
    });
  });
});
