---
id: S-0046
title: Task Progress Tracking in Stories
priority: 75
status: backlog
type: feature
created: '2026-01-16'
labels:
  - implementation
  - orchestration
  - persistence
estimated_effort: small
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: task-progress-tracking-in-stories
---
# Task Progress Tracking in Stories

## User Story

**As a** developer using ai-sdlc,
**I want** individual task progress persisted in the story file,
**So that** implementation can resume from the last completed task after interruptions.

## Summary

Add task-level progress tracking to story files. When the orchestrator completes a task, it updates the story to mark that task complete. This enables:
- Resume from interruption (crash, timeout, user stop)
- Visibility into implementation progress
- Clear audit trail of what's done vs pending

## Context

Currently, story files track phase-level completion (`implementation_complete: true/false`). With task-level orchestration, we need finer granularity:
- Which tasks are complete?
- Which task is currently in progress?
- Which tasks are pending?

This is orthogonal to the task parsing (S-0044) - parsing extracts tasks from the plan, this story tracks their execution status.

## Acceptance Criteria

- [ ] Add `## Task Progress` section to story files during implementation
- [ ] Create `getTaskProgress(storyPath): TaskProgress[]` function
- [ ] Create `updateTaskProgress(storyPath, taskId, status): void` function
- [ ] Progress section uses same task IDs from the plan
- [ ] Progress persists across process restarts (file-based)
- [ ] `getPendingTasks(storyPath)` returns tasks not yet completed
- [ ] `getCurrentTask(storyPath)` returns in-progress task (if any)
- [ ] Add unit tests for progress read/write operations
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Story File Addition

After implementation starts, add to story.md:

```markdown
## Task Progress

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| T1 | completed | 2026-01-16T10:00:00Z | 2026-01-16T10:05:00Z |
| T2 | completed | 2026-01-16T10:05:30Z | 2026-01-16T10:12:00Z |
| T3 | in_progress | 2026-01-16T10:12:30Z | - |
| T4 | pending | - | - |
| T5 | pending | - | - |
```

### Interface Definitions

```typescript
interface TaskProgress {
  taskId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: string;  // ISO timestamp
  completedAt?: string;  // ISO timestamp
  error?: string;  // If failed
}

interface TaskProgressAPI {
  getTaskProgress(storyPath: string): Promise<TaskProgress[]>;
  updateTaskProgress(storyPath: string, taskId: string, status: TaskProgress['status'], error?: string): Promise<void>;
  getPendingTasks(storyPath: string): Promise<string[]>;
  getCurrentTask(storyPath: string): Promise<string | null>;
  initializeTaskProgress(storyPath: string, taskIds: string[]): Promise<void>;
}
```

### File Location

Create in `src/core/task-progress.ts`:
- All TaskProgressAPI functions
- Markdown table parsing/generation utilities

### Storage Strategy

- Parse existing Task Progress table if present
- Append/update table in story file
- Use markdown table format for human readability
- Consider YAML alternative in frontmatter for machine parsing (negotiate)

### Initialization Flow

When orchestrator starts:
1. Parse tasks from plan (S-0044)
2. Check for existing Task Progress section
3. If none: create with all tasks as 'pending'
4. If exists: resume from current state

## Edge Cases

1. **Story file locked**: Retry with backoff, fail after N attempts
2. **Corrupted progress section**: Log warning, reinitialize from plan
3. **Task ID mismatch**: Plan changed since last run - reconcile or warn
4. **Concurrent updates**: Single-writer assumption (orchestrator is serial)

## Definition of Done

- [ ] TaskProgressAPI implemented and exported
- [ ] Story file format supports Task Progress section
- [ ] Read/write operations are atomic (no partial writes)
- [ ] Unit tests cover all operations and edge cases
- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)

---

**Effort:** small
**Dependencies:** S-0044 (Structured Task Format)
**Blocks:** S-0047 (Sequential Task Orchestrator)
