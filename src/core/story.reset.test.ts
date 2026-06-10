import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

import { parseStory } from './story.js';

describe('resetWorkflowState', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-')));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
    // Set fake timers for deterministic timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function createStoryWithWorktree(options: {
    status: string;
    research_complete: boolean;
    plan_complete: boolean;
    implementation_complete: boolean;
  }): Promise<string> {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyId = 'S-0001';
    const storyFolder = path.join(storiesFolder, storyId);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');

    const content = `---
id: ${storyId}
title: Test Story
slug: test-story
priority: 10
status: ${options.status}
type: feature
created: '2024-01-01'
labels: []
research_complete: ${options.research_complete}
plan_complete: ${options.plan_complete}
implementation_complete: ${options.implementation_complete}
reviews_complete: false
worktree_path: /test/worktrees/S-0001-test
branch: ai-sdlc/S-0001-test
---

# Test Story

Test content
`;

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  it('clears worktree_path and branch fields', async () => {
    const { resetWorkflowState } = await import('./story.js');
    const storyPath = await createStoryWithWorktree({
      status: 'in-progress',
      research_complete: true,
      plan_complete: true,
      implementation_complete: false,
    });

    let story = parseStory(storyPath);
    expect(story.frontmatter.worktree_path).toBe('/test/worktrees/S-0001-test');
    expect(story.frontmatter.branch).toBe('ai-sdlc/S-0001-test');

    story = await resetWorkflowState(story);

    expect(story.frontmatter.worktree_path).toBeUndefined();
    expect(story.frontmatter.branch).toBeUndefined();
  });

  it('sets status to ready when plan is complete', async () => {
    const { resetWorkflowState } = await import('./story.js');
    const storyPath = await createStoryWithWorktree({
      status: 'in-progress',
      research_complete: true,
      plan_complete: true,
      implementation_complete: false,
    });

    let story = parseStory(storyPath);
    story = await resetWorkflowState(story);

    expect(story.frontmatter.status).toBe('ready');
  });

  it('sets status to backlog when only research is complete', async () => {
    const { resetWorkflowState } = await import('./story.js');
    const storyPath = await createStoryWithWorktree({
      status: 'in-progress',
      research_complete: true,
      plan_complete: false,
      implementation_complete: false,
    });

    let story = parseStory(storyPath);
    story = await resetWorkflowState(story);

    expect(story.frontmatter.status).toBe('backlog');
  });

  it('sets status to backlog when no phases are complete', async () => {
    const { resetWorkflowState } = await import('./story.js');
    const storyPath = await createStoryWithWorktree({
      status: 'in-progress',
      research_complete: false,
      plan_complete: false,
      implementation_complete: false,
    });

    let story = parseStory(storyPath);
    story = await resetWorkflowState(story);

    expect(story.frontmatter.status).toBe('backlog');
  });

  it('sets status to ready when implementation is complete', async () => {
    const { resetWorkflowState } = await import('./story.js');
    const storyPath = await createStoryWithWorktree({
      status: 'in-progress',
      research_complete: true,
      plan_complete: true,
      implementation_complete: true,
    });

    let story = parseStory(storyPath);
    story = await resetWorkflowState(story);

    expect(story.frontmatter.status).toBe('ready');
  });

  it('preserves title, slug, labels, effort, and created date', async () => {
    const { resetWorkflowState } = await import('./story.js');
    const storyPath = await createStoryWithWorktree({
      status: 'in-progress',
      research_complete: true,
      plan_complete: true,
      implementation_complete: false,
    });

    const original = parseStory(storyPath);
    const story = await resetWorkflowState(original);

    expect(story.frontmatter.id).toBe(original.frontmatter.id);
    expect(story.frontmatter.title).toBe(original.frontmatter.title);
    expect(story.frontmatter.slug).toBe(original.frontmatter.slug);
    expect(story.frontmatter.labels).toEqual(original.frontmatter.labels);
    expect(story.frontmatter.created).toBe(original.frontmatter.created);
  });

  it('updates timestamp', async () => {
    const { resetWorkflowState } = await import('./story.js');
    const storyPath = await createStoryWithWorktree({
      status: 'in-progress',
      research_complete: true,
      plan_complete: true,
      implementation_complete: false,
    });

    let story = parseStory(storyPath);
    story = await resetWorkflowState(story);

    expect(story.frontmatter.updated).toBe('2024-01-15');
  });

  it('writes changes to disk', async () => {
    const { resetWorkflowState } = await import('./story.js');
    const storyPath = await createStoryWithWorktree({
      status: 'in-progress',
      research_complete: true,
      plan_complete: true,
      implementation_complete: false,
    });

    const story = parseStory(storyPath);
    await resetWorkflowState(story);

    // Re-read from disk to verify persistence
    const reloaded = parseStory(storyPath);
    expect(reloaded.frontmatter.worktree_path).toBeUndefined();
    expect(reloaded.frontmatter.branch).toBeUndefined();
    expect(reloaded.frontmatter.status).toBe('ready');
  });
});
describe('isPRMerged', () => {
  it('should return true when pr_merged is true', async () => {
    const { isPRMerged } = await import('./story.js');
    const story = {
      path: '/test/story.md',
      slug: 'test',
      frontmatter: {
        id: 'S-0001',
        title: 'Test',
        slug: 'test',
        priority: 1,
        status: 'done' as const,
        type: 'feature' as const,
        created: '2024-01-01',
        labels: [],
        research_complete: true,
        plan_complete: true,
        implementation_complete: true,
        reviews_complete: true,
        pr_url: 'https://github.com/test/repo/pull/1',
        pr_merged: true,
        merge_sha: 'abc123',
      },
      content: '# Test',
    };

    expect(isPRMerged(story)).toBe(true);
  });

  it('should return false when pr_merged is false', async () => {
    const { isPRMerged } = await import('./story.js');
    const story = {
      path: '/test/story.md',
      slug: 'test',
      frontmatter: {
        id: 'S-0001',
        title: 'Test',
        slug: 'test',
        priority: 1,
        status: 'done' as const,
        type: 'feature' as const,
        created: '2024-01-01',
        labels: [],
        research_complete: true,
        plan_complete: true,
        implementation_complete: true,
        reviews_complete: true,
        pr_url: 'https://github.com/test/repo/pull/1',
        pr_merged: false,
      },
      content: '# Test',
    };

    expect(isPRMerged(story)).toBe(false);
  });

  it('should return false when pr_merged is undefined', async () => {
    const { isPRMerged } = await import('./story.js');
    const story = {
      path: '/test/story.md',
      slug: 'test',
      frontmatter: {
        id: 'S-0001',
        title: 'Test',
        slug: 'test',
        priority: 1,
        status: 'done' as const,
        type: 'feature' as const,
        created: '2024-01-01',
        labels: [],
        research_complete: true,
        plan_complete: true,
        implementation_complete: true,
        reviews_complete: true,
        pr_url: 'https://github.com/test/repo/pull/1',
      },
      content: '# Test',
    };

    expect(isPRMerged(story)).toBe(false);
  });
});
describe('markPRMerged', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-')));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createTestStoryWithPR(): string {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, 'S-0001');
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');

    const content = `---
id: S-0001
title: Test Story
slug: test-story
priority: 1
status: done
type: feature
created: '2024-01-01'
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
pr_url: 'https://github.com/test/repo/pull/1'
---

# Test Story

Test content
`;

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  it('should set pr_merged to true', async () => {
    const { markPRMerged } = await import('./story.js');
    const storyPath = createTestStoryWithPR();
    let story = parseStory(storyPath);

    expect(story.frontmatter.pr_merged).toBeUndefined();

    story = await markPRMerged(story);

    expect(story.frontmatter.pr_merged).toBe(true);
  });

  it('should set merge_sha when provided', async () => {
    const { markPRMerged } = await import('./story.js');
    const storyPath = createTestStoryWithPR();
    let story = parseStory(storyPath);

    story = await markPRMerged(story, 'abc123def456');

    expect(story.frontmatter.merge_sha).toBe('abc123def456');
  });

  it('should set merged_at timestamp', async () => {
    const { markPRMerged } = await import('./story.js');
    const storyPath = createTestStoryWithPR();
    let story = parseStory(storyPath);

    story = await markPRMerged(story);

    expect(story.frontmatter.merged_at).toBeDefined();
    const timestamp = new Date(story.frontmatter.merged_at!);
    expect(timestamp.getTime()).toBeGreaterThan(0);
  });

  it('should persist changes to disk', async () => {
    const { markPRMerged } = await import('./story.js');
    const storyPath = createTestStoryWithPR();
    const story = parseStory(storyPath);

    await markPRMerged(story, 'abc123');

    // Re-read from disk
    const reloaded = parseStory(storyPath);
    expect(reloaded.frontmatter.pr_merged).toBe(true);
    expect(reloaded.frontmatter.merge_sha).toBe('abc123');
    expect(reloaded.frontmatter.merged_at).toBeDefined();
  });
});
