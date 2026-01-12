---
id: daemon-block-max-retries
title: Block stories on max review retries
type: feature
status: backlog
priority: 2
created: 2025-01-12
labels: [daemon, blocking, PRD-daemon-workflow-engine]
estimated_effort: small
sequence_file: .ai-sdlc/docs/daemon-workflow-engine-sequence.md
sequence_order: 2
depends_on: [daemon-block-max-refinements]
---

# Block Stories on Max Review Retries

## User Story

**As a** developer using ai-sdlc in daemon mode
**I want** stories that fail review too many times to move to the `blocked/` folder
**So that** persistently failing stories don't clog the workflow indefinitely

## Context

When a story repeatedly fails code/security/product owner reviews, it currently keeps retrying or stays in-progress with a high priority flag. This story extends the blocking mechanism from Story 1 to cover review failures.

**Sequence**: This is Story 2 of the Daemon Workflow Engine PRD. See [sequence file](../docs/daemon-workflow-engine-sequence.md).
**Depends on**: Story 1 (daemon-block-max-refinements) must be complete first.

## Acceptance Criteria

- [ ] When `isAtMaxRetries(story, config)` returns true, call `moveToBlocked()`
- [ ] Blocked reason: "Max review retries ({count}/{max}) reached - last failure: {summary}"
- [ ] Integration point: `assessState()` in kanban.ts, similar to max refinements check
- [ ] Review rejection counter (`retry_count`) is preserved in frontmatter after blocking
- [ ] Unit tests verify blocking triggers at correct retry count
- [ ] Integration test: story failing reviews N times ends up in blocked/

## Technical Notes

- Reuse `moveToBlocked()` from Story 1
- The `isAtMaxRetries()` function already exists, just need to call moveToBlocked
- Consider: Should we capture the last review issues in blocked_reason? (Keep concise)
- Default `maxRetries` may still be Infinity; Story 8 will change this default

## Out of Scope

- Changing maxRetries default (Story 8)
- Unblock command (Story 4)
- Blocking on agent errors (future story if needed)

## Definition of Done

- [ ] All acceptance criteria checked
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual verification: trigger max retries, verify story in blocked/
