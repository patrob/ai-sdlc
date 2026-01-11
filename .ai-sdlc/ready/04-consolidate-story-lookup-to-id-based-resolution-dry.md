---
id: story-3irsu11w5t2d
title: Consolidate story lookup to ID-based resolution (DRY principle)
priority: 4
status: ready
type: refactor
created: '2026-01-10'
labels:
  - reliability
  - workflow
  - dry
  - s
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
updated: '2026-01-11'
---
# Consolidate story lookup to ID-based resolution (DRY principle)

## User Story

**As a** developer running agentic-sdlc workflows  
**I want** story lookups to consistently resolve by ID rather than file path  
**So that** agents can continue working seamlessly when stories move between folders (backlog → in-progress → done)

## Problem Statement

**Current behavior:** During `--auto` mode or full SDLC workflows, when a story moves between folders (via `moveStory()`), subsequent actions fail because agents hold stale path references. The `parseStory(oldPath)` call fails with "file not found".

**Root cause (DRY violation):** Story lookup logic is duplicated and inconsistently applied across the codebase:
- `findStoryById()` in `kanban.ts` (lines 42-49) - canonical ID-based lookup ✅
- `resolveStoryPath()` in `commands.ts` (lines 639-653) - private wrapper, limited scope ⚠️
- `runner.ts` - uses `action.storyPath` directly without resolution ❌
- Various agents call `parseStory(path)` directly, trusting paths are valid ❌

**Solution:** Establish a single, exported `getStory(sdlcRoot, storyId)` function as the source of truth for story retrieval. All code needing a story should look it up by ID, never trust a cached path.

## Acceptance Criteria

### Core Implementation
- [ ] Create `getStory(sdlcRoot: string, storyId: string): Story` in `src/core/story.ts`
  - Should internally use `findStoryById()` from `kanban.ts`
  - Should throw descriptive error if story ID not found
  - Should return fully parsed `Story` object (not just path)
- [ ] Update `WorkflowRunner.executeAction()` in `runner.ts` to:
  - Extract story ID from `action.storyPath` (parse filename)
  - Call `getStory(sdlcRoot, storyId)` to get current path
  - Pass resolved path to agent execution functions
- [ ] Update `commands.ts`:
  - Replace private `resolveStoryPath()` with calls to shared `getStory()`
  - Ensure all story-related commands use ID-based lookup

### Code Cleanup
- [ ] Audit all `parseStory(path)` calls across the codebase
  - Replace with `getStory(sdlcRoot, id)` where story ID is available
  - Document any cases where direct path usage is necessary (e.g., initial story creation)
- [ ] Consider moving `findStoryById()` from `kanban.ts` to `story.ts` for better module cohesion (or keep as-is if preferred)

### Testing
- [ ] Add integration test: story can be found after moving between folders
  - Test scenario: backlog → in-progress → done
  - Verify lookup succeeds at each stage using same ID
- [ ] Add unit test: `getStory()` throws clear error for non-existent story ID
- [ ] Add unit test: `getStory()` returns correct story when ID exists in multiple possible folders
- [ ] Verify all existing tests continue to pass (`npm test`)
- [ ] Verify TypeScript compilation succeeds (`npm run build`)

## Edge Cases & Constraints

1. **Story ID extraction:** Story filenames follow pattern `<id>-<slug>.md`. The `getStory()` function must handle cases where:
   - The story ID is passed directly (e.g., `"story-123"`)
   - A full path is passed (extract ID from filename)
   
2. **Multiple stories with same ID:** Should not happen, but `findStoryById()` should fail fast if duplicate IDs exist across folders

3. **Performance:** `findStoryById()` searches all kanban folders. For large projects with hundreds of stories, consider:
   - Caching story locations (future optimization, not in scope)
   - Early return once story is found (already implemented in `findStoryById()`)

4. **Backwards compatibility:** Agents currently expect file paths. Ensure the resolution happens at the orchestration layer (runner/commands) so agent functions don't need refactoring

5. **Concurrent operations:** If multiple actions run concurrently and move the same story, the ID-based lookup ensures they always get the current location

## Technical Architecture

**Current state (fragmented):**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   commands.ts   │     │    runner.ts    │     │   agents/*.ts   │
│                 │     │                 │     │                 │
│ resolveStoryPath│     │ action.storyPath│     │ parseStory(path)│
│ (private, local)│     │ (direct, stale) │     │ (direct, fails) │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         ▼                       ▼                       ▼
    findStoryById()         STALE PATH!            STALE PATH!
    (works, but              ERROR: file           ERROR: file
     not reused)             not found             not found
```

**Target state (centralized):**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   commands.ts   │     │    runner.ts    │     │   agents/*.ts   │
│                 │     │                 │     │                 │
│  getStory(id)   │     │  getStory(id)   │     │  (unchanged,    │
│                 │     │  ↓              │     │   receives      │
│                 │     │  resolvedPath   │     │   current path) │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                     ┌───────────────────────┐
                     │  story.ts: getStory() │
                     │                       │
                     │  Single source of     │
                     │  truth for story      │
                     │  lookup (ID-based)    │
                     │                       │
                     │  Internally uses:     │
                     │  findStoryById()      │
                     └───────────────────────┘
```

## Key Files

- **`src/core/story.ts`** - Add `getStory(sdlcRoot, storyId)` here (primary change)
- **`src/core/kanban.ts:42-49`** - `findStoryById()` already exists (may move to story.ts)
- **`src/cli/commands.ts:639-653`** - Replace private `resolveStoryPath()` with shared function
- **`src/cli/runner.ts`** - Update `executeAction()` to resolve by ID before agent execution
- **`src/agents/*.ts`** - Audit for direct `parseStory()` calls (minimal changes expected)

## Implementation Sequence

1. **Create the shared function** (`getStory()` in `story.ts`)
2. **Update runner.ts** (highest impact - fixes auto mode failures)
3. **Update commands.ts** (remove duplication)
4. **Audit and fix agents** (if needed)
5. **Add tests** (integration test for move scenarios, unit tests for edge cases)
6. **Verify build and tests pass**

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->

---

**Effort:** medium  
**Labels:** refactoring, technical-debt, DRY, bug-fix, reliability
