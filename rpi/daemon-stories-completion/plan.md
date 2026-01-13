# Implementation Plan: Complete Daemon Workflow Engine Stories 3-9

## Overview
This plan completes the remaining 7 daemon stories from the daemon-workflow-engine PRD sequence. The stories enhance the ai-sdlc daemon with proper blocking behavior, continuous operation, intelligent priority selection, and improved terminal UI. Stories are organized into phases respecting dependencies, with parallel-safe stories grouped together.

## FACTS Validation Summary
- **Feasibility**: All tasks leverage existing patterns (moveToBlocked, assessState, chokidar). Code examples provided in research document match codebase style.
- **Atomicity**: Each task is a discrete file change or test addition, completable in 5-15 minutes. No task requires multiple unrelated changes.
- **Clarity**: Tasks specify exact file paths, function names, and expected behavior based on story acceptance criteria.
- **Testability**: Each implementation task paired with corresponding unit or integration test. Verification via `npm test` and `npm run build` at phase end.
- **Scope**: Phases represent committable units (blocking infrastructure, daemon behavior, config, UI). Each phase completes 1-3 related stories.

## Prerequisites
- Node.js and npm installed
- All dependencies installed (`npm install`)
- Stories 1-2 complete (blocking infrastructure exists)
- `blocked/` folder infrastructure exists

---

## Phase 1: Verification and Blocking Infrastructure (Stories 3, 4)

**Goal**: Ensure blocked/ folder is excluded from daemon watch; add unblock CLI command
**Committable State**: Daemon ignores blocked/ folder; users can unblock stories via CLI

### Story 3: daemon-exclude-blocked-folder

- [ ] Verify `blocked/` is NOT in watch paths in `src/cli/daemon.ts` (should already exclude it)
- [ ] Verify `assessState()` in `src/core/kanban.ts` does NOT scan blocked/ folder
- [ ] Add unit test in `src/cli/daemon.test.ts`: verify chokidar watch paths do not include `blocked/`
- [ ] Add integration test in `tests/integration/blocked-stories.test.ts`: place story in blocked/, verify daemon does not pick it up
- [ ] Move story file from `.ai-sdlc/backlog/22-daemon-exclude-blocked-folder.md` to `.ai-sdlc/done/`
- [ ] Update sequence file `.ai-sdlc/docs/daemon-workflow-engine-sequence.md`: mark Story 3 checkbox `[x]`

### Story 4: daemon-unblock-command

- [ ] Add `unblockStory()` function to `src/core/story.ts`:
  - Accept `storyId: string`, `sdlcRoot: string`, `options?: { resetRetries?: boolean }`
  - Find story in `blocked/` folder by ID
  - Clear `blocked_reason`, `blocked_at` from frontmatter
  - Determine destination folder based on workflow flags
  - Move story to destination folder
  - Optionally reset `retry_count` and `refinement_count`
- [ ] Update `findStoryById()` in `src/core/kanban.ts` to also search `blocked/` folder
- [ ] Add `unblock` CLI command to `src/index.ts`:
  - Command: `ai-sdlc unblock <story-id>`
  - Option: `--reset-retries` to reset retry/refinement counts
- [ ] Add unit tests in `src/core/story.test.ts` for `unblockStory()`
- [ ] Add integration test in `tests/integration/blocked-stories.test.ts`: block/unblock cycle
- [ ] Move story file from `.ai-sdlc/backlog/23-daemon-unblock-command.md` to `.ai-sdlc/done/`
- [ ] Update sequence file: mark Story 4 checkbox `[x]`

### Phase 1 Verification
- [ ] Run `npm test` - all tests pass
- [ ] Run `npm run build` - TypeScript compilation succeeds
- [ ] Manual test: `ai-sdlc unblock <id>` works correctly

---

## Phase 2: Daemon Behavior (Stories 5, 6, 8 - Parallel Safe)

**Goal**: Implement continuous polling, single-story selection on startup, and sensible config defaults
**Committable State**: Daemon runs continuously, picks one story at a time, uses sensible defaults

### Story 5: daemon-continuous-polling

- [ ] Add `pollInterval` and `pollTimerId` properties to `DaemonRunner` class in `src/cli/daemon.ts`
- [ ] Implement `startPolling()` private method using recursive `setTimeout` pattern
- [ ] Call `startPolling()` in `start()` method after watcher setup
- [ ] Add `storiesProcessedCount` counter and `startTime` property for uptime tracking
- [ ] Update `stop()` to clear poll timer
- [ ] Add unit tests in `src/cli/daemon.test.ts`: verify polling starts/stops correctly
- [ ] Move story file from `.ai-sdlc/backlog/24-daemon-continuous-polling.md` to `.ai-sdlc/done/`
- [ ] Update sequence file: mark Story 5 checkbox `[x]`

### Story 6: daemon-single-story-startup

- [ ] Change chokidar option from `ignoreInitial: false` to `ignoreInitial: true` in `src/cli/daemon.ts`
- [ ] Add initial assessment call after watcher setup in `start()` method
- [ ] Extract `queueStory(path, id)` helper method from `onFileAdded()` logic
- [ ] Add startup log: "Found {N} stories, starting with: {story-id}"
- [ ] Add unit test: verify only one story queued initially
- [ ] Add integration test in `tests/integration/daemon.test.ts`: verify highest priority worked first
- [ ] Move story file from `.ai-sdlc/backlog/25-daemon-single-story-startup.md` to `.ai-sdlc/done/`
- [ ] Update sequence file: mark Story 6 checkbox `[x]`

### Story 8: daemon-config-defaults

- [ ] Change `maxRetries` default from `Infinity` to `3` in `src/core/config.ts`
- [ ] Change `maxRetriesUpperBound` default from `Infinity` to `10`
- [ ] Verify `daemon.pollingInterval` default is `5000` (already set)
- [ ] Add JSDoc comments documenting all daemon config defaults in `src/types/index.ts`
- [ ] Add unit tests in `src/core/config.test.ts`: verify defaults are correct
- [ ] Move story file from `.ai-sdlc/backlog/27-daemon-config-defaults.md` to `.ai-sdlc/done/`
- [ ] Update sequence file: mark Story 8 checkbox `[x]`

### Phase 2 Verification
- [ ] Run `npm test` - all tests pass
- [ ] Run `npm run build` - TypeScript compilation succeeds
- [ ] Manual test: daemon with multiple stories, verify single-story selection and continuous polling

---

## Phase 3: Priority Algorithm Enhancement (Story 7)

**Goal**: Add nearest-completion priority to favor almost-done stories
**Committable State**: Stories closer to completion are prioritized within same folder

**Depends on**: Story 6 (single-story selection must work first)

### Story 7: daemon-nearest-completion-priority

- [ ] Add `calculateCompletionScore(story: Story): number` function to `src/core/kanban.ts`:
  - reviews_complete: +40 points
  - implementation_complete: +30 points
  - plan_complete: +20 points
  - research_complete: +10 points
- [ ] Export `calculateCompletionScore` function for testing
- [ ] Update priority calculation in `assessState()` to include completion score
- [ ] Add secondary sort: if priorities equal, prefer higher completion score
- [ ] Add unit tests in `src/core/kanban.test.ts` for `calculateCompletionScore()`
- [ ] Add integration test in `tests/integration/daemon.test.ts`: verify more complete story picked first
- [ ] Move story file from `.ai-sdlc/backlog/26-daemon-nearest-completion-priority.md` to `.ai-sdlc/done/`
- [ ] Update sequence file: mark Story 7 checkbox `[x]`

### Phase 3 Verification
- [ ] Run `npm test` - all tests pass
- [ ] Run `npm run build` - TypeScript compilation succeeds
- [ ] Manual test: two in-progress stories at different stages, verify correct selection

---

## Phase 4: Terminal UI Polish (Story 9)

**Goal**: Redesign daemon output for cleaner, less cluttered display
**Committable State**: Daemon shows compact output with summary status, --verbose flag available

**Depends on**: Stories 1-8 (UI should reflect final daemon behavior)

### Story 9: daemon-terminal-ui

- [ ] Add `--verbose` / `-v` flag to daemon command in `src/index.ts`
- [ ] Add `verbose: boolean` option to `DaemonOptions` interface in `src/cli/daemon.ts`
- [ ] Add `DaemonStats` interface to track: done, active, queued, blocked, startTime
- [ ] Add `stats: DaemonStats` property to `DaemonRunner` class
- [ ] Create `formatSummaryStatus()` helper in `src/cli/formatting.ts`:
  - Return format: `X done | Y active | Z queued | W blocked`
- [ ] Create `formatCompactStoryCompletion()` helper in formatting.ts:
  - Single line format: `✓ story-id [N actions · Xs]`
- [ ] Update `logWorkflowComplete()` to use compact format by default
- [ ] Update idle message to show summary status once
- [ ] Add elapsed time tracking per story
- [ ] Ensure output respects `NO_COLOR` environment variable
- [ ] Add unit tests in `src/cli/formatting.test.ts` for new formatting functions
- [ ] Add unit tests in `src/cli/daemon.test.ts` for verbose flag and stats tracking
- [ ] Move story file from `.ai-sdlc/backlog/28-daemon-terminal-ui.md` to `.ai-sdlc/done/`
- [ ] Update sequence file: mark Story 9 checkbox `[x]`

### Phase 4 Verification
- [ ] Run `npm test` - all tests pass
- [ ] Run `npm run build` - TypeScript compilation succeeds
- [ ] Manual test: run daemon, verify compact output format
- [ ] Manual test: run daemon with `--verbose`, verify detailed output

---

## Final Validation Checklist

- [ ] All 7 stories (3-9) moved to `.ai-sdlc/done/`
- [ ] Sequence file updated with all checkboxes marked `[x]`
- [ ] `npm test` passes with 0 failures
- [ ] `npm run build` succeeds
- [ ] Manual verification complete

---

## File Reference Summary

| File | Stories Affected |
|------|------------------|
| `src/cli/daemon.ts` | 3, 5, 6, 9 |
| `src/core/story.ts` | 4 |
| `src/core/kanban.ts` | 4, 7 |
| `src/core/config.ts` | 8 |
| `src/cli/formatting.ts` | 9 |
| `src/index.ts` | 4, 9 |
| `src/types/index.ts` | 8, 9 |
| `src/cli/daemon.test.ts` | 3, 5, 6, 9 |
| `src/core/story.test.ts` | 4 |
| `src/core/kanban.test.ts` | 7 |
| `src/core/config.test.ts` | 8 |
| `src/cli/formatting.test.ts` | 9 |
| `tests/integration/blocked-stories.test.ts` | 3, 4 |
| `tests/integration/daemon.test.ts` | 6, 7 |
