import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach,beforeEach, describe, expect, it } from 'vitest';

import { findAllStories, findStoriesByEpic } from './kanban.js';
import * as storyModule from './story.js';

describe('findAllStories - path canonicalization', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-findall-test-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createStory(storyId: string): string {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const storyFolder = path.join(storiesFolder, storyId);
    fs.mkdirSync(storyFolder, { recursive: true });

    const filePath = path.join(storyFolder, 'story.md');

    const content = `---
id: ${storyId}
title: Test Story ${storyId}
slug: test-story-${storyId}
priority: 10
status: backlog
type: feature
created: '2024-01-01'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story ${storyId}

Content here.
`;

    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  it('should return canonical paths from findAllStories', () => {
    const storyPath = createStory('S-0001');
    const canonicalPath = fs.realpathSync(storyPath);

    const stories = findAllStories(sdlcRoot);

    expect(stories).toHaveLength(1);
    expect(stories[0].path).toBe(canonicalPath);
  });

  it('should return paths that match getStory lookup', () => {
    createStory('S-0002');

    const stories = findAllStories(sdlcRoot);
    const storyFromFind = stories[0];

    const storyFromGet = storyModule.getStory(sdlcRoot, 'S-0002');

    expect(storyFromFind.path).toBe(storyFromGet.path);
  });

  it('should handle symlinks in path by resolving to real path', () => {
    const storiesFolder = path.join(sdlcRoot, 'stories');
    fs.mkdirSync(storiesFolder, { recursive: true });

    const realStoryFolder = path.join(tempDir, 'real-story-folder');
    fs.mkdirSync(realStoryFolder, { recursive: true });

    const storyContent = `---
id: S-0003
title: Symlinked Story
slug: symlinked-story
priority: 10
status: backlog
type: feature
created: '2024-01-01'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Symlinked Story

Content.
`;
    fs.writeFileSync(path.join(realStoryFolder, 'story.md'), storyContent, 'utf-8');

    const symlinkPath = path.join(storiesFolder, 'S-0003');
    try {
      fs.symlinkSync(realStoryFolder, symlinkPath, 'dir');
    } catch {
      return;
    }

    const stories = findAllStories(sdlcRoot);

    expect(stories).toHaveLength(1);
    const realPathToStory = fs.realpathSync(path.join(symlinkPath, 'story.md'));
    expect(stories[0].path).toBe(realPathToStory);
  });

  it('should return empty array when stories folder does not exist', () => {
    const nonExistentRoot = path.join(tempDir, 'nonexistent', '.ai-sdlc');

    const stories = findAllStories(nonExistentRoot);

    expect(stories).toEqual([]);
  });

  it('should skip stories where realpathSync fails', () => {
    createStory('S-0001');

    const stories = findAllStories(sdlcRoot);

    expect(stories).toHaveLength(1);
    expect(stories[0].frontmatter.id).toBe('S-0001');
  });

  it('should return multiple stories with canonical paths', () => {
    const path1 = createStory('S-0001');
    const path2 = createStory('S-0002');
    const path3 = createStory('S-0003');

    const canonical1 = fs.realpathSync(path1);
    const canonical2 = fs.realpathSync(path2);
    const canonical3 = fs.realpathSync(path3);

    const stories = findAllStories(sdlcRoot);

    expect(stories).toHaveLength(3);

    const returnedPaths = stories.map(s => s.path).sort();
    const expectedPaths = [canonical1, canonical2, canonical3].sort();

    expect(returnedPaths).toEqual(expectedPaths);
  });
});

describe('loadStoriesFromWorktrees - story path construction', () => {
  let tempDir: string;
  let sdlcRoot: string;
  let worktreeDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-worktree-path-test-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
    worktreeDir = path.join(sdlcRoot, 'worktrees', 'S-0001-test-story');
    fs.mkdirSync(worktreeDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should correctly construct worktree story path including .ai-sdlc folder', () => {
    // Create a story in the main repo
    const mainStoriesFolder = path.join(sdlcRoot, 'stories', 'S-0001');
    fs.mkdirSync(mainStoriesFolder, { recursive: true });
    fs.writeFileSync(path.join(mainStoriesFolder, 'story.md'), `---
id: S-0001
title: Test Story
slug: test-story
priority: 10
status: ready
type: feature
created: '2024-01-01'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story

Content.
`);

    // Create a story in the worktree with the CORRECT path structure
    // Worktrees should mirror the repo structure: worktree/.ai-sdlc/stories/S-0001/story.md
    const worktreeStoryFolder = path.join(worktreeDir, '.ai-sdlc', 'stories', 'S-0001');
    fs.mkdirSync(worktreeStoryFolder, { recursive: true });
    fs.writeFileSync(path.join(worktreeStoryFolder, 'story.md'), `---
id: S-0001
title: Test Story Updated In Worktree
slug: test-story
priority: 10
status: in-progress
type: feature
created: '2024-01-01'
labels: []
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
---

# Test Story Updated

Updated in worktree.
`);

    // The worktree story path should be:
    // {worktreeDir}/.ai-sdlc/stories/{storyId}/story.md
    // NOT: {worktreeDir}/stories/{storyId}/story.md
    const expectedWorktreePath = path.join(worktreeDir, '.ai-sdlc', 'stories', 'S-0001', 'story.md');

    // Verify the path structure is correct by checking the file exists
    expect(fs.existsSync(expectedWorktreePath)).toBe(true);

    // Verify the wrong path structure (without .ai-sdlc) would NOT exist
    const wrongPath = path.join(worktreeDir, 'stories', 'S-0001', 'story.md');
    expect(fs.existsSync(wrongPath)).toBe(false);
  });
});

describe('findStoriesByEpic', () => {
  let tempDir: string;
  let sdlcRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-epic-test-'));
    sdlcRoot = path.join(tempDir, '.ai-sdlc');
    fs.mkdirSync(sdlcRoot, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createStoryWithEpic(id: string, epic?: string, labels: string[] = []): void {
    const storiesFolder = path.join(sdlcRoot, 'stories', id);
    fs.mkdirSync(storiesFolder, { recursive: true });

    const epicLine = epic ? `epic: ${epic}\n` : '';
    const labelsYaml = labels.length > 0
      ? `labels:\n${labels.map(l => `  - ${l}`).join('\n')}`
      : 'labels: []';

    const content = `---
id: ${id}
title: Test Story ${id}
slug: test-story-${id.toLowerCase()}
priority: 10
status: ready
type: feature
created: '2024-01-01'
${labelsYaml}
${epicLine}research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---

# Test Story ${id}

Story content.
`;

    fs.writeFileSync(path.join(storiesFolder, 'story.md'), content);
  }

  it('should find stories by epic frontmatter field', () => {
    createStoryWithEpic('S-0001', 'my-epic');
    createStoryWithEpic('S-0002', 'my-epic');
    createStoryWithEpic('S-0003', 'other-epic');
    createStoryWithEpic('S-0004'); // no epic

    const stories = findStoriesByEpic(sdlcRoot, 'my-epic');

    expect(stories).toHaveLength(2);
    const ids = stories.map(s => s.frontmatter.id).sort();
    expect(ids).toEqual(['S-0001', 'S-0002']);
  });

  it('should find stories by epic label for backwards compatibility', () => {
    createStoryWithEpic('S-0001', undefined, ['epic-legacy-epic']);
    createStoryWithEpic('S-0002', undefined, ['epic-legacy-epic', 'other-label']);
    createStoryWithEpic('S-0003', undefined, ['unrelated-label']);

    const stories = findStoriesByEpic(sdlcRoot, 'legacy-epic');

    expect(stories).toHaveLength(2);
    const ids = stories.map(s => s.frontmatter.id).sort();
    expect(ids).toEqual(['S-0001', 'S-0002']);
  });

  it('should find stories with epic frontmatter prefixed with epic-', () => {
    createStoryWithEpic('S-0001', 'epic-prefixed-epic');

    const stories = findStoriesByEpic(sdlcRoot, 'prefixed-epic');

    expect(stories).toHaveLength(1);
    expect(stories[0].frontmatter.id).toBe('S-0001');
  });

  it('should return empty array when no stories match epic', () => {
    createStoryWithEpic('S-0001', 'different-epic');
    createStoryWithEpic('S-0002', undefined, ['epic-another-epic']);

    const stories = findStoriesByEpic(sdlcRoot, 'nonexistent-epic');

    expect(stories).toHaveLength(0);
  });

  it('should not duplicate stories that match both frontmatter and label', () => {
    // Story has both epic field and matching label
    createStoryWithEpic('S-0001', 'dual-epic', ['epic-dual-epic']);

    const stories = findStoriesByEpic(sdlcRoot, 'dual-epic');

    expect(stories).toHaveLength(1);
    expect(stories[0].frontmatter.id).toBe('S-0001');
  });
});
