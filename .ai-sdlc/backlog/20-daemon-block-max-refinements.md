---
id: daemon-block-max-refinements
title: Block stories on max refinements
type: feature
status: backlog
priority: 1
created: 2025-01-12
labels: [daemon, blocking, PRD-daemon-workflow-engine]
estimated_effort: small
sequence_file: .ai-sdlc/docs/daemon-workflow-engine-sequence.md
sequence_order: 1
---

# Block Stories on Max Refinements

## User Story

**As a** developer using ai-sdlc in daemon mode
**I want** stories that hit max refinement attempts to move to a `blocked/` folder
**So that** I can clearly see which stories need manual intervention without them cluttering active workflow

## Context

Currently, when a story hits max refinement attempts (default: 3), it stays in its original folder with a very high priority number (priority + 10000). This makes blocked stories invisible and they remain mixed with active work.

**Sequence**: This is Story 1 of the Daemon Workflow Engine PRD. See [sequence file](../docs/daemon-workflow-engine-sequence.md).

## Acceptance Criteria

- [ ] A `blocked/` folder exists in `.ai-sdlc/` (created on first use if missing)
- [ ] `StoryFrontmatter` type includes `blocked_reason?: string` field
- [ ] `StoryFrontmatter` type includes `blocked_at?: string` field (ISO timestamp)
- [ ] New function `moveToBlocked(storyPath, reason)` in `src/core/story.ts`:
  - Moves story file to `.ai-sdlc/blocked/`
  - Sets `blocked_reason` in frontmatter
  - Sets `blocked_at` to current timestamp
  - Updates `status` to `'blocked'`
- [ ] `assessState()` in kanban.ts calls `moveToBlocked()` when `!canRetryRefinement()`
- [ ] Daemon logs "Story {id} blocked: {reason}" when a story is moved to blocked/
- [ ] Unit tests verify moveToBlocked() behavior
- [ ] Integration test: story reaching max refinements ends up in blocked/

## Technical Notes

- Add `'blocked'` to `StoryStatus` type
- Add `BLOCKED_DIR` constant alongside existing folder constants
- The `moveToBlocked()` function should use existing `moveStory()` as reference
- Blocked reason for max refinements: "Max refinement attempts ({count}/{max}) reached"

## Out of Scope

- Unblock command (Story 4)
- Daemon watching/ignoring blocked/ folder (Story 3)
- Blocking on max review retries (Story 2)

## Definition of Done

- [ ] All acceptance criteria checked
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual verification: run daemon, hit max refinements, verify story in blocked/
