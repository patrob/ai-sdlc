---
id: daemon-unblock-command
title: Add unblock CLI command
type: feature
status: backlog
priority: 4
created: 2025-01-12
labels: [daemon, cli, blocking, PRD-daemon-workflow-engine]
estimated_effort: small
sequence_file: .ai-sdlc/docs/daemon-workflow-engine-sequence.md
sequence_order: 4
depends_on: [daemon-block-max-refinements]
---

# Add Unblock CLI Command

## User Story

**As a** developer who has blocked stories
**I want** a CLI command to unblock stories and return them to the workflow
**So that** I can retry stories after manually addressing the blocking issues

## Context

Once stories are in blocked/, users need a way to return them to active workflow. The unblock command moves a story from blocked/ to the appropriate folder based on its workflow state.

**Sequence**: This is Story 4 of the Daemon Workflow Engine PRD. See [sequence file](../docs/daemon-workflow-engine-sequence.md).
**Depends on**: Story 1 (daemon-block-max-refinements) - blocking mechanism must exist.

## Acceptance Criteria

- [ ] New CLI command: `ai-sdlc unblock <story-id>`
- [ ] Command finds story in blocked/ folder by ID
- [ ] Command clears `blocked_reason` and `blocked_at` from frontmatter
- [ ] Command moves story to appropriate folder based on state:
  - If `implementation_complete` or `plan_complete` or `research_complete` → in-progress/
  - If refined (was in ready before blocking) → ready/
  - Otherwise → backlog/
- [ ] Optional `--reset-retries` flag resets `retry_count` and `refinement_count` to 0
- [ ] Command outputs: "Unblocked story {id}, moved to {folder}/"
- [ ] Error if story not found in blocked/
- [ ] Unit tests for destination folder logic
- [ ] Integration test: block story, unblock it, verify correct folder

## Technical Notes

- Add `unblock` to CLI commands in src/cli/index.ts
- Create `unblockStory(storyId, options)` function in src/core/story.ts
- Determine destination based on workflow flags in frontmatter
- Consider: should unblock also update `status` field to match destination?

## Out of Scope

- Automatic unblocking after time delay
- Unblocking multiple stories at once
- Notification when story is unblocked

## Definition of Done

- [ ] All acceptance criteria checked
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual verification: `ai-sdlc unblock <id>` works correctly
