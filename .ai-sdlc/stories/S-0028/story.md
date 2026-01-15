---
id: S-0028
slug: spurious-story-path-updated-message
title: Fix spurious "Story path updated" message during phase transitions
status: done
priority: 100
created: 2025-01-14
updated: 2025-01-14
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
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

- [x] Running `--auto` or `--full-sdlc` does not print "Story path updated" unless the file actually moved
- [x] Unit test confirms paths are canonicalized in `findAllStories()`

## Implementation Summary

### Changes Made

1. **`src/core/kanban.ts`**: Updated `findAllStories()` to canonicalize paths using `fs.realpathSync()` before returning stories.

2. **`src/core/story.ts`**: Updated `findStoryById()` to canonicalize paths in all three return points (new architecture, old kanban folders, and blocked folder). Also updated `createStory()` to return a canonical path for consistency.

3. **`src/core/kanban.test.ts`**: Added comprehensive tests for path canonicalization including:
   - Test that `findAllStories()` returns canonical paths
   - Test that paths from `findAllStories()` match `getStory()` lookup
   - Test for symlink resolution
   - Test for multiple stories with canonical paths

All 835 tests pass (684 unit tests + 151 integration tests).
