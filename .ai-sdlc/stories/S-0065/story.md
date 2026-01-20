---
id: S-0065
title: Backlog Processor Core Loop
priority: 15
status: backlog
type: feature
created: '2026-01-18'
labels:
  - automation
  - batch-processing
  - p1-production
  - epic-backlog-processor
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: backlog-processor-core-loop
---
# Backlog Processor Core Loop

## User Story

**As a** developer using ai-sdlc
**I want** the system to automatically process all backlog stories in priority order
**So that** I can maximize autonomous throughput and only engage when my input is needed

## Summary

This is the foundation story for the "Automatic Full Backlog Processing" epic. It creates a new BacklogProcessor class that orchestrates sequential processing of multiple stories from backlog through to PR creation. The processor tracks global state across all stories and stops when it encounters a blocking condition that requires human input.

## Technical Context

**Existing Infrastructure to Leverage:**
- `DaemonRunner` (src/cli/daemon.ts) - Continuous processing loop, graceful shutdown
- `WorkflowRunner` (src/cli/runner.ts) - Single story auto-mode execution
- `assessState()` (src/core/kanban.ts) - Priority-based action recommendations
- `workflow-state.ts` - State persistence pattern

**New Components:**
- `BacklogProcessor` class that wraps WorkflowRunner
- `BacklogProcessorState` interface for global state tracking
- State persistence in `.ai-sdlc/.backlog-processor-state.json`

## Acceptance Criteria

- [ ] Create `BacklogProcessor` class in `src/cli/backlog-processor.ts`
- [ ] Process stories sequentially in priority order (lowest priority number first)
- [ ] For each story, execute all phases: refine → research → plan → implement → review → create_pr
- [ ] Track global processor state:
  - Session ID and start time
  - Stories processed (completed)
  - Stories blocked (with reasons)
  - Current story being processed
- [ ] Persist state to `.ai-sdlc/.backlog-processor-state.json` after each story transition
- [ ] Stop processing when a story becomes blocked (status = 'blocked')
- [ ] Display progress: "Processing story X of Y: [story title]"
- [ ] On completion, display summary: N completed, M blocked, P remaining
- [ ] Handle graceful shutdown on SIGINT/SIGTERM (complete current action, save state)
- [ ] Respect existing config options (requireApprovalBeforeImplementation, requireApprovalBeforePR)

## State Interface

```typescript
interface BacklogProcessorState {
  version: '1.0';
  sessionId: string;
  startedAt: string;
  lastActivityAt: string;
  storiesProcessed: string[];      // Story IDs that reached done/PR
  storiesBlocked: Array<{
    storyId: string;
    blockedAt: string;
    reason: string;
  }>;
  currentStory: string | null;
  totalStories: number;
  status: 'running' | 'paused' | 'completed' | 'blocked';
}
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/cli/backlog-processor.ts` | Create | Core BacklogProcessor class |
| `src/types/index.ts` | Modify | Add BacklogProcessorState interface |
| `src/core/kanban.ts` | Modify | Add method to get all actionable stories sorted by priority |
| `tests/unit/backlog-processor.test.ts` | Create | Unit tests |
| `tests/integration/backlog-processor.test.ts` | Create | Integration tests |

## Edge Cases

- No stories in backlog → Display "No actionable stories found" and exit
- All stories already blocked → Display blocked count and exit
- Story transitions to 'done' folder during processing → Skip, continue to next
- State file corrupted → Start fresh with warning
- Concurrent processor instances → Detect and warn (don't allow)

## Out of Scope

- Parallel story processing (future enhancement)
- Notifications beyond console output (see S-0067)
- Resume from blocked state (see S-0068)
- CLI commands (see S-0069)

## Definition of Done

- [ ] BacklogProcessor class implemented with all acceptance criteria
- [ ] Unit tests for state management and story ordering
- [ ] Integration test for processing 3 mock stories sequentially
- [ ] Graceful shutdown test
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual testing confirms sequential processing works
