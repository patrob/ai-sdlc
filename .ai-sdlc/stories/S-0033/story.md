---
id: S-0033
title: Per-Story Workflow State
priority: 2
status: backlog
type: feature
created: '2026-01-15'
labels:
  - concurrent-workflows
  - phase-1
  - infrastructure
epic: concurrent-workflows
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: per-story-workflow-state
---
# Per-Story Workflow State

## User Story

**As a** developer using ai-sdlc,
**I want** workflow state to be isolated per story,
**So that** concurrent executions don't corrupt shared state.

## Summary

Currently, workflow state is stored in a single `.workflow-state.json` file at the SDLC root. This creates a bottleneck and potential corruption when multiple stories execute concurrently. This story moves workflow state to a per-story location, enabling safe concurrent execution.

## Context

This is the first story in **Phase 1: Isolation Hardening** of the Concurrent Workflows epic. It is a prerequisite for:
- S-0034: Atomic Story Updates
- All Phase 2 concurrent execution stories

**Reference:** `docs/ROADMAP_TO_CONCURRENT_WORK.md` (Section 6, Phase 1 Stories)

## Acceptance Criteria

- [ ] `.workflow-state.json` moves to `stories/{id}/.workflow-state.json`
- [ ] `loadWorkflowState()` accepts optional `storyId` parameter
- [ ] `saveWorkflowState()` writes to story-specific location
- [ ] When `storyId` is provided, state is read/written from story directory
- [ ] When `storyId` is omitted, falls back to legacy global location (backward compatibility)
- [ ] Migration utility handles existing global state file
- [ ] Tests verify isolation between two story states
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Current Implementation

```typescript
// Current signature
function loadWorkflowState(sdlcRoot: string): WorkflowState;
function saveWorkflowState(sdlcRoot: string, state: WorkflowState): void;
```

### Target Implementation

```typescript
// New signature with optional storyId
function loadWorkflowState(sdlcRoot: string, storyId?: string): WorkflowState;
function saveWorkflowState(sdlcRoot: string, state: WorkflowState, storyId?: string): void;

// Storage location logic
function getWorkflowStatePath(sdlcRoot: string, storyId?: string): string {
  if (storyId) {
    return path.join(sdlcRoot, 'stories', storyId, '.workflow-state.json');
  }
  return path.join(sdlcRoot, '.workflow-state.json'); // Legacy fallback
}
```

### Migration Strategy

1. Check for global `.workflow-state.json`
2. If exists and contains `currentStoryId`, move to that story's directory
3. Delete global file after successful migration
4. Log migration action for user visibility

### Files to Modify

- `src/core/workflow-state.ts` - Add storyId parameter, update paths
- `src/cli/runner.ts` - Pass storyId when loading/saving state
- `src/cli/commands.ts` - Pass storyId in relevant commands

## Edge Cases

1. **No active story**: Fall back to global state (maintains backward compatibility)
2. **Story directory doesn't exist**: Create it before writing state
3. **Concurrent writes to same story**: Handled by S-0034 (Atomic Story Updates)
4. **Migration during active run**: Warn user, don't migrate mid-execution

## Definition of Done

- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Manual verification: Two stories have independent workflow states
- [ ] Migration tested with existing global state file
- [ ] No temporary files created during development

---

**Effort:** small
**Dependencies:** None (first in phase)
**Blocks:** S-0034, all Phase 2 stories
