---
id: daemon-nearest-completion-priority
title: Nearest completion priority
type: feature
status: backlog
priority: 7
created: 2025-01-12
labels: [daemon, priority, PRD-daemon-workflow-engine]
estimated_effort: small
sequence_file: .ai-sdlc/docs/daemon-workflow-engine-sequence.md
sequence_order: 7
depends_on: [daemon-single-story-startup]
---

# Nearest Completion Priority

## User Story

**As a** developer with multiple in-progress stories
**I want** the daemon to prioritize stories that are closest to completion
**So that** almost-done stories get finished before starting earlier-stage work

## Context

When multiple stories are in-progress, the daemon should prefer finishing work that's further along. A story with `implementation_complete=true` waiting for review should be prioritized over a story still in planning.

**Sequence**: This is Story 7 of the Daemon Workflow Engine PRD. See [sequence file](../docs/daemon-workflow-engine-sequence.md).
**Depends on**: Story 6 (daemon-single-story-startup) - single selection must work first.

## Acceptance Criteria

- [ ] Within same folder (especially in-progress), calculate "completion score"
- [ ] Completion score based on workflow flags:
  - `reviews_complete=true`: +40 points
  - `implementation_complete=true`: +30 points
  - `plan_complete=true`: +20 points
  - `research_complete=true`: +10 points
- [ ] Higher completion score = lower priority number (worked first)
- [ ] Update `assessState()` priority calculation to include completion score
- [ ] If completion scores tie, use frontmatter `priority` field as tiebreaker
- [ ] Unit test: verify completion score calculation
- [ ] Integration test: two in-progress stories, more complete one picked first

## Technical Notes

- Current priority for in-progress: 0-150 based on action type
- Add completion score as secondary sort within that range
- Example: in-progress story needing review (priority 100) with high completion score should beat in-progress story needing implementation (priority 50) with low completion score
- Consider: should we subtract completion score from priority? Or use it as secondary sort key?

## Out of Scope

- Time-based priority escalation
- Manual priority override via CLI flag
- Story age affecting priority

## Definition of Done

- [ ] All acceptance criteria checked
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual verification: two in-progress stories at different stages, verify correct selection
