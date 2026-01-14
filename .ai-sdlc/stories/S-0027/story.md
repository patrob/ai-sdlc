---
id: S-0027
title: Fix case-sensitive path comparison bug in --story flag
priority: 1
status: backlog
type: bug
created: '2026-01-14'
labels:
  - p0-critical
  - bug
  - cli
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: story-flag-case-sensitivity-bug
---

# Fix case-sensitive path comparison bug in --story flag

## User Story

**As a** user running `ai-sdlc run --story <id>`
**I want** the story to be found regardless of ID casing
**So that** I can target stories without worrying about exact case matching

## Bug Description

Running `ai-sdlc run --story S-0026` shows "No pending actions" even though the story exists in backlog and should have a `refine` action.

**Observed behavior:**
```
> ai-sdlc run --story S-0026
Targeting story: Implementation agent should retry on test failures
  ID: S-0026
  Status: backlog
  Actions: 0 of 17 total

No pending actions for story "S-0026".
The specified work may already be complete.
```

**Expected behavior:**
Should find and execute the `refine` action for the backlog story.

## Root Cause Analysis

The bug is a **case-sensitivity mismatch** between two code paths:

1. **Input normalization** (`src/cli/commands.ts:367`):
   ```typescript
   const normalizedInput = options.story.toLowerCase().trim();
   ```
   Converts `S-0026` → `s-0026`

2. **Path construction** (`src/core/story.ts:604`):
   ```typescript
   const storyPath = path.join(sdlcRoot, STORIES_FOLDER, storyId, STORY_FILENAME);
   ```
   Creates `.ai-sdlc/stories/s-0026/story.md` (lowercase)

3. **macOS behavior**: Case-insensitive filesystem finds the file even with wrong case

4. **Returned path**: `story.path` is set to the constructed (lowercase) path

5. **Action paths** (`src/core/kanban.ts:25`):
   ```typescript
   const storyPaths = glob.sync(pattern);
   ```
   Returns actual filesystem casing: `.ai-sdlc/stories/S-0026/story.md`

6. **Filtering fails** (`src/cli/commands.ts:416`):
   ```typescript
   action.storyPath === targetStory!.path
   // 'S-0026' !== 's-0026' → no match
   ```

## Acceptance Criteria

- [ ] `ai-sdlc run --story S-0026` finds actions for the story
- [ ] `ai-sdlc run --story s-0026` also works (case-insensitive matching)
- [ ] Path comparison is consistent across macOS and Linux
- [ ] `make verify` passes

## Technical Approach

**Option A: Normalize paths with `fs.realpathSync()`** (Recommended)
- In `findStoryById()`, use `fs.realpathSync()` to get canonical path
- Ensures returned `story.path` matches actual filesystem casing

**Option B: Case-insensitive path comparison**
- Modify the filter to use case-insensitive comparison
- `action.storyPath.toLowerCase() === targetStory.path.toLowerCase()`

**Option C: Don't lowercase the input**
- Remove `.toLowerCase()` from input normalization
- Risk: Users would need exact case matching

## Files to Modify

- `src/core/story.ts` - `findStoryById()` function (~line 602-612)
- `src/cli/commands.ts` - path comparison (~line 416)

## Testing Strategy

### Unit Tests
- Test `findStoryById()` returns correct path casing
- Test path comparison works with mixed case inputs

### Manual Testing
- `ai-sdlc run --story S-0026` - uppercase ID
- `ai-sdlc run --story s-0026` - lowercase ID
- `ai-sdlc run --story S-0026 --auto` - full SDLC mode

## Workaround

Use `--auto --story` combination which bypasses the broken path filtering:
```bash
ai-sdlc run --auto --story S-0026
```
