# Daemon Workflow Engine - Story Sequence

**PRD**: [PRD-daemon-workflow-engine.md](./PRD-daemon-workflow-engine.md)

This file tracks the implementation order for the Daemon Workflow Engine improvements.
Stories should be worked on in sequence. Each story references this file to confirm
it's the correct story to work on at this time.

---

## Implementation Sequence

| Order | Story ID | Title | Status | Dependencies |
|-------|----------|-------|--------|--------------|
| 1 | daemon-block-max-refinements | Block stories on max refinements | done | None |
| 2 | daemon-block-max-retries | Block stories on max review retries | done | Story 1 |
| 3 | daemon-exclude-blocked-folder | Exclude blocked/ from daemon watch | done | Story 1 |
| 4 | daemon-unblock-command | Add unblock CLI command | done | Story 1 |
| 5 | daemon-continuous-polling | Daemon runs continuously | done | None (parallel-safe) |
| 6 | daemon-single-story-startup | Pick one story on daemon startup | done | None (parallel-safe) |
| 7 | daemon-nearest-completion-priority | Nearest completion priority | done | Story 6 |
| 8 | daemon-config-defaults | Set sensible config defaults | done | None (parallel-safe) |
| 9 | story-ui-daemon-tui | Redesign daemon terminal UI | done | Stories 1-8 |

---

## Sequencing Rules

1. **Stories 1-4** form a chain: blocking foundation first, then integration, then unblock
2. **Stories 5, 6, 8** are independent and can be worked in parallel with the blocking chain
3. **Story 7** depends on Story 6 (needs single-story selection to add priority refinement)
4. **Story 9** (Terminal UI) should be done last - UI should reflect final daemon behavior

## How to Use

When the daemon picks up a story from this endeavor:
1. Check this sequence file
2. Verify the story is the next "ready" item OR is marked "parallel-safe"
3. If not, skip and log why

## Completion Tracking

Mark stories complete here as they're finished:
- [x] Story 1: daemon-block-max-refinements
- [x] Story 2: daemon-block-max-retries
- [x] Story 3: daemon-exclude-blocked-folder
- [x] Story 4: daemon-unblock-command
- [x] Story 5: daemon-continuous-polling
- [x] Story 6: daemon-single-story-startup
- [x] Story 7: daemon-nearest-completion-priority
- [x] Story 8: daemon-config-defaults
- [x] Story 9: story-ui-daemon-tui
