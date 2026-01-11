---
id: story-3irsu11w5t2d
title: >-
  Consolidate story lookup to ID-based resolution (DRY principle)
priority: 1
status: backlog
type: refactor
created: '2026-01-10'
labels:
  - reliability
  - workflow
  - dry
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Consolidate story lookup to ID-based resolution (DRY principle)

## Summary

As a developer using agentic-sdlc, when a story moves between folders (e.g., backlog → in-progress), agents should continue working without failing due to stale path references.

**Current behavior:** During `--auto` mode or full SDLC workflows, when a story moves (via `moveStory()`), subsequent actions fail because they hold the old path. The `parseStory(oldPath)` call fails with "file not found".

**Root cause (DRY violation):** Story lookup logic is duplicated and inconsistently applied:
- `findStoryById()` in `kanban.ts` - the canonical ID-based lookup (correct approach)
- `resolveStoryPath()` in `commands.ts` - wraps `findStoryById()` but is private and only used locally
- `runner.ts` - uses `action.storyPath` directly without any resolution
- Various places call `parseStory(path)` directly, assuming the path is valid

**Solution:** Establish `findStoryById()` as the single source of truth for story retrieval. All code that needs a story should look it up by ID, never trust a cached path.

## Acceptance Criteria

- [ ] Create `getStory(sdlcRoot, storyId)` in `story.ts` that wraps `findStoryById()` (single canonical function)
- [ ] Update `WorkflowRunner.executeAction()` to resolve story by ID before passing to agents
- [ ] Update `commands.ts` to use the shared `getStory()` function
- [ ] Audit all `parseStory()` calls - replace with ID-based lookup where story ID is available
- [ ] Add test: story can be found after moving between any two folders
- [ ] Existing tests continue to pass

## Technical Notes

**The principle:** Story IDs are stable across moves. File paths are not. Always resolve by ID.

**Current state:**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   commands.ts   │     │    runner.ts    │     │   agents/*.ts   │
│                 │     │                 │     │                 │
│ resolveStoryPath│     │ action.storyPath│     │ parseStory(path)│
│ (private, good) │     │ (direct, bad)   │     │ (direct, bad)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         ▼                       ▼                       ▼
    findStoryById()         STALE PATH!            STALE PATH!
```

**Target state:**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   commands.ts   │     │    runner.ts    │     │   agents/*.ts   │
│                 │     │                 │     │                 │
│  getStory(id)   │     │  getStory(id)   │     │  getStory(id)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                     ┌───────────────────────┐
                     │  story.ts: getStory() │
                     │  (single source of    │
                     │   truth, uses ID)     │
                     └───────────────────────┘
```

**Key files:**
- `src/core/story.ts` - Add `getStory(sdlcRoot, storyId)` here
- `src/core/kanban.ts:42-49` - `findStoryById()` already exists and works (move to story.ts?)
- `src/cli/commands.ts:639-653` - Replace private `resolveStoryPath()` with shared function
- `src/cli/runner.ts` - Update `executeAction()` to resolve by ID first

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
