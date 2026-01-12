---
id: daemon-single-story-startup
title: Pick one story on daemon startup
type: feature
status: backlog
priority: 6
created: 2025-01-12
labels: [daemon, priority, PRD-daemon-workflow-engine]
estimated_effort: small
sequence_file: .ai-sdlc/docs/daemon-workflow-engine-sequence.md
sequence_order: 6
parallel_safe: true
---

# Pick One Story on Daemon Startup

## User Story

**As a** developer starting the daemon with multiple stories
**I want** the daemon to pick the single highest-priority story to work on first
**So that** story selection is predictable and follows priority rules

## Context

Currently, when daemon starts with `ignoreInitial: false`, all existing stories in watched folders get queued. Users expect the daemon to assess all stories, pick THE highest priority one, complete it, then reassess for the next one.

**Sequence**: This is Story 6 of the Daemon Workflow Engine PRD. See [sequence file](../docs/daemon-workflow-engine-sequence.md).
**Parallel-safe**: This story has no dependencies and can be worked alongside Stories 1-5.

## Acceptance Criteria

- [ ] On daemon startup, call `assessState()` to get all stories and actions
- [ ] Select only the single highest-priority action (first in sorted list)
- [ ] Process that story to completion (or blocking) before reassessing
- [ ] After story completion, call `assessState()` again to pick next story
- [ ] Do NOT queue all existing stories at once
- [ ] Startup log shows: "Found {N} stories, starting with: {story-id} ({reason})"
- [ ] Unit test: verify only one story processed initially
- [ ] Integration test: start with 3 stories, verify highest priority worked first

## Technical Notes

- Change from `ignoreInitial: false` (queue all) to manual initial assessment
- The `assessState()` already returns sorted actions by priority
- Key change: process ONE action, reassess, repeat (instead of queue batch)
- Folder priority: in-progress (0-150) > ready (200-400) > backlog (500+)

## Out of Scope

- "Nearest completion" refinement (Story 7)
- Frontmatter priority field as tiebreaker (can be added, but folder priority is main)

## Definition of Done

- [ ] All acceptance criteria checked
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual verification: start daemon with multiple stories, verify predictable selection
