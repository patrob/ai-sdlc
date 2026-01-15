---
id: S-0028
slug: spurious-story-path-updated-message
title: Fix spurious "Story path updated" message during phase transitions
status: backlog
priority: 100
created: 2025-01-14
updated: 2025-01-14
---

# Fix spurious "Story path updated" message during phase transitions

## Problem

During `--auto` or `--full-sdlc` runs, each phase transition incorrectly prints:
```
Note: Story path updated (file was moved)
  From: /path/to/story.md
  To: /path/to/story.md
```

The paths appear identical but the comparison fails due to path normalization differences.

## Root Cause

- `findAllStories()` in `src/core/kanban.ts` returns paths from `glob.sync()` without canonicalizing them
- `findStoryById()` in `src/core/story.ts` uses `fs.realpathSync()` to get canonical paths
- When `executeAction()` compares the original `action.storyPath` (from `findAllStories`) with the resolved path (from `getStory` -> `findStoryById`), they differ on case-insensitive filesystems (macOS) even though they point to the same file

## Fix

In `findAllStories()` (src/core/kanban.ts lines 27-30), canonicalize paths the same way `findStoryById()` does:

```typescript
for (const storyPath of storyPaths) {
  try {
    const canonicalPath = fs.realpathSync(storyPath);
    const story = parseStory(canonicalPath);
    stories.push({ ...story, path: canonicalPath });
  } catch (err) {
    // Skip malformed stories
    continue;
  }
}
```

## Acceptance Criteria

- [ ] Running `--auto` or `--full-sdlc` does not print "Story path updated" unless the file actually moved
- [ ] Unit test confirms paths are canonicalized in `findAllStories()`
