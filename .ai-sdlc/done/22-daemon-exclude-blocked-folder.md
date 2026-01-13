---
id: daemon-exclude-blocked-folder
title: Exclude blocked/ from daemon watch
type: feature
status: backlog
priority: 3
created: 2025-01-12
labels: [daemon, blocking, PRD-daemon-workflow-engine]
estimated_effort: small
sequence_file: .ai-sdlc/docs/daemon-workflow-engine-sequence.md
sequence_order: 3
depends_on: [daemon-block-max-refinements]
---

# Exclude blocked/ Folder from Daemon Watch

## User Story

**As a** developer using ai-sdlc in daemon mode
**I want** the daemon to ignore stories in the `blocked/` folder
**So that** blocked stories stay blocked until I manually unblock them

## Context

Once stories are moved to blocked/, they should remain there until a user explicitly unblocks them. The daemon currently watches backlog/, ready/, and in-progress/. We need to ensure it does NOT watch blocked/.

**Sequence**: This is Story 3 of the Daemon Workflow Engine PRD. See [sequence file](../docs/daemon-workflow-engine-sequence.md).
**Depends on**: Story 1 (daemon-block-max-refinements) - blocked/ folder must exist.

## Acceptance Criteria

- [ ] Daemon's chokidar watcher does NOT include `blocked/` in watched paths
- [ ] Stories manually placed in blocked/ are not picked up by daemon
- [ ] Stories moved to blocked/ via `moveToBlocked()` are not re-queued
- [ ] `assessState()` does not include blocked/ when scanning folders
- [ ] Unit test: verify blocked/ is not in watch paths
- [ ] Integration test: add story to blocked/, start daemon, verify story not processed

## Technical Notes

- Current watch paths in daemon.ts: `[backlogDir, readyDir, inProgressDir]`
- Ensure `assessState()` doesn't scan blocked/ (check `scanStoriesInFolder` calls)
- The `completedStoryIds` tracking may need to handle blocked stories too

## Out of Scope

- Unblock command (Story 4)
- Any automatic unblocking behavior

## Definition of Done

- [ ] All acceptance criteria checked
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual verification: put story in blocked/, run daemon, confirm ignored
