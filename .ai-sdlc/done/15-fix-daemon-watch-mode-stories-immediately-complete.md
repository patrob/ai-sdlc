---
id: story-mkb3z7uu-vphu
title: Fix daemon watch mode - stories immediately complete without executing actions
priority: 15
status: done
type: feature
created: '2026-01-12'
labels:
  - bug
  - daemon
  - watch-mode
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
updated: '2026-01-12'
---
I'll refine this story to make it more actionable and well-defined.

---

# Fix daemon watch mode - stories immediately complete without executing actions

## User Story

**As a** developer using the ai-sdlc daemon in watch mode  
**I want** stories to execute their complete workflow (research → plan → implement → review)  
**So that** the automated SDLC process actually performs the intended agent actions instead of immediately marking stories as complete

## Problem Statement

When running `ai-sdlc run --auto --watch`, the daemon detects new stories but skips all agent actions, immediately transitioning from "Starting workflow" to "Workflow completed" without executing research, planning, implementation, or review steps.

**Current behavior:**
```
New story detected: 13-reset-rpiv-cycle-on-review-rejection-fresh-researc.md
  Starting workflow for: 13-reset-rpiv-cycle-on-review-rejection-fresh-researc
  Workflow completed: 13-reset-rpiv-cycle-on-review-rejection-fresh-researc
Queue empty, waiting for new stories...
```

**Expected behavior:**
```
New story detected: 13-reset-rpiv-cycle-on-review-rejection-fresh-researc.md
  Starting workflow for: story-0013
  Executing action: research for story-0013
  [Agent output...]
  Executing action: plan for story-0013
  [Agent output...]
  ...
  Workflow completed: story-0013
```

## Investigation Context

### Already Verified Working
- ✅ `assessState()` returns correct recommended actions with correct `storyId` values
- ✅ `parseStory()` correctly extracts `frontmatter.id` from story files
- ✅ Action matching logic (`action.storyId === storyId`) works in unit tests
- ✅ Local daemon test detects stories and initiates workflow

### Known Issues Fixed (alpha.5-alpha.7)
- Fixed `storyId` mismatch by using `frontmatter.id` instead of filename
- Added error handling around `parseStory()` for file read errors

### Root Cause Hypotheses
1. **Queue processing gap**: Actions are assessed but not queued/dequeued properly in `processStory()`
2. **Silent action filtering**: Actions are being filtered out somewhere between `assessState()` and execution
3. **Async timing issue**: Race condition where story completes before actions execute
4. **Package build issue**: Published npm package missing code that local version has

## Acceptance Criteria

### Core Functionality
- [ ] `ai-sdlc run --auto --watch` detects new stories in `stories/backlog/`
- [ ] Daemon executes all recommended actions (research, plan, implement, review) for each story
- [ ] Each action shows visible output/logging during execution
- [ ] Stories progress through state transitions: backlog → ready → in-progress → review → done
- [ ] "Starting workflow for:" logs use `frontmatter.id` (e.g., `story-0013`), not filename

### Debugging & Observability
- [ ] Add debug logging to show:
  - Number of actions returned by `assessState()`
  - Number of actions queued in `processStory()`
  - Each action before execution with its `storyId`
- [ ] If no actions are found, log the reason (e.g., "No actions match storyId", "Queue empty")

### Testing
- [ ] Integration test: Mock `assessState()` to return actions, verify `executeAction()` is called for each
- [ ] Integration test: Verify daemon processes a test story file through complete workflow
- [ ] Unit test: Verify action filtering logic doesn't drop valid actions

## Constraints & Edge Cases

### Constraints
- Must work with published npm package (`npx ai-sdlc@latest`), not just local dev environment
- Must not break single-story execution (`ai-sdlc run --auto <story-file>`)
- Must handle file system events from chokidar correctly (not double-processing)

### Edge Cases to Consider
1. **Empty action queue**: Story has no recommended actions (should log and skip, not crash)
2. **Action execution failure**: One action fails mid-workflow (should log error, potentially retry or skip)
3. **Story file changes during execution**: File modified while actions are running (should use snapshot from start)
4. **Multiple stories detected simultaneously**: Queue should process them sequentially, not interleave
5. **Invalid story format**: Missing `frontmatter.id` or malformed markdown (should log error and skip)

## Implementation Hints

### Likely Code Locations
- `src/cli/daemon.ts` - `processStory()` function (action queuing/execution loop)
- `src/cli/runner.ts` - `runWorkflow()` function (action execution)
- `src/core/state.ts` - `assessState()` function (verify action generation)

### Debugging Strategy
1. Add `console.log()` statements at key points:
   - After `assessState()` returns (log action count and storyIds)
   - Before each `executeAction()` call (log action type and storyId)
   - In action execution handlers (log entry/exit)
2. Test with minimal story file to isolate issue
3. Compare local `dist/` output with published npm package contents

### Potential Root Cause
The most likely culprit is in `processStory()` or `runWorkflow()` where actions are either:
- Not being iterated over correctly (loop exiting early)
- Filtered out by incorrect storyId matching despite fixes
- Executed but output suppressed/not awaited

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->

---

## Metadata

**Effort**: large  
**Labels**: bug, daemon, high-priority, watch-mode, workflow-execution

---

This refined story now includes:
- ✅ Clear user story format with user type, goal, and benefit
- ✅ Specific, testable acceptance criteria organized by category
- ✅ Detailed edge cases and constraints
- ✅ Implementation hints to guide the research/planning agents
- ✅ Debugging observability requirements to prevent similar issues
- ✅ Effort estimate (large - requires debugging, testing multiple scenarios, and ensuring npm package works)
- ✅ Relevant labels for filtering and prioritization
