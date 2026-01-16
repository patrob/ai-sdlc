---
id: S-0047
title: Sequential Task Orchestrator
priority: 70
status: backlog
type: feature
created: '2026-01-16'
labels:
  - implementation
  - orchestration
  - core
estimated_effort: large
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: sequential-task-orchestrator
---
# Sequential Task Orchestrator

## User Story

**As a** developer using ai-sdlc,
**I want** implementation tasks to run as separate agents orchestrated sequentially,
**So that** each task gets fresh context, preventing quality degradation and enabling intelligent retry/recovery.

## Summary

This is the **core orchestrator** that ties together task parsing (S-0044), single-task agents (S-0045), and progress tracking (S-0046). The orchestrator:
1. Extracts tasks from the implementation plan
2. For each task: spawns a fresh agent, evaluates result, checkpoints progress
3. Makes decisions: continue, retry, fix, or fail

This delivers the primary value: **quality preservation through context isolation**.

## Context

### The Problem
A single long-running implementation agent experiences:
- Context window exhaustion (quality degrades as window fills)
- Error contamination (one failure pollutes context for unrelated tasks)
- No recovery point (interruption means restart from beginning)

### The Solution
An orchestrator that:
- Runs each task as an isolated agent with fresh context
- Evaluates each result before proceeding
- Checkpoints progress for resume capability
- Makes intelligent decisions about failures

## Acceptance Criteria

- [ ] Create `runImplementationOrchestrator(storyPath, options): OrchestratorResult` function
- [ ] Orchestrator parses tasks from plan using S-0044 functions
- [ ] Orchestrator runs tasks sequentially respecting dependency order
- [ ] Each task runs via `runSingleTaskAgent()` (S-0045)
- [ ] Progress is checkpointed after each task via S-0046 functions
- [ ] Orchestrator resumes from last incomplete task on restart
- [ ] Decision logic handles: success (continue), recoverable failure (retry), unrecoverable failure (stop)
- [ ] Maximum retry count per task is configurable (default: 2)
- [ ] Orchestrator commits after each successful task (atomic progress)
- [ ] Integration with existing `executeAction('implement', ...)` flow
- [ ] Add unit tests for orchestration logic (mocked agents)
- [ ] Add integration test for full orchestration flow
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Orchestrator Flow

```
┌─────────────────────────────────────────────────────────────┐
│ runImplementationOrchestrator(storyPath)                    │
│                                                             │
│  1. Parse tasks from plan (S-0044)                         │
│  2. Load/initialize task progress (S-0046)                 │
│  3. Get next pending task (respecting dependencies)        │
│                                                             │
│  LOOP while pending tasks exist:                           │
│  ├─ 4. Mark task in_progress                               │
│  ├─ 5. Build minimal context for task                      │
│  ├─ 6. Run single-task agent (S-0045)                      │
│  ├─ 7. Evaluate result                                     │
│  │   ├─ SUCCESS: mark completed, commit, continue          │
│  │   ├─ RECOVERABLE: increment retry, maybe retry          │
│  │   └─ UNRECOVERABLE: mark failed, stop                   │
│  └─ 8. Get next pending task                               │
│                                                             │
│  9. Return OrchestratorResult                              │
└─────────────────────────────────────────────────────────────┘
```

### Interface Definitions

```typescript
interface OrchestratorOptions {
  maxRetriesPerTask?: number;  // Default: 2
  commitAfterEachTask?: boolean;  // Default: true
  stopOnFirstFailure?: boolean;  // Default: true
  dryRun?: boolean;  // Don't actually run agents
}

interface OrchestratorResult {
  success: boolean;
  tasksCompleted: number;
  tasksFailed: number;
  tasksRemaining: number;
  failedTasks: Array<{
    taskId: string;
    error: string;
    attempts: number;
  }>;
  totalAgentInvocations: number;
}

async function runImplementationOrchestrator(
  storyPath: string,
  sdlcRoot: string,
  options?: OrchestratorOptions
): Promise<OrchestratorResult>
```

### Decision Logic

After each agent result, categorize the failure:

**Recoverable (retry):**
- Timeout
- Transient API error
- Verification failed but code was written

**Unrecoverable (stop):**
- Task dependencies not met
- Agent reported impossible task
- Max retries exceeded
- Agent modified files outside scope

### File Location

Create in `src/agents/orchestrator.ts`:
- `runImplementationOrchestrator()` - main function
- `evaluateTaskResult()` - decision logic
- `getNextTask()` - respects dependencies and progress
- `buildTaskContext()` - assembles minimal context

### Integration Point

Modify `src/agents/implementation.ts`:
```typescript
// In runImplementationAgent():
if (config.useOrchestrator) {  // New config option
  return runImplementationOrchestrator(storyPath, sdlcRoot, options);
}
// Existing implementation as fallback
```

### Commit Strategy

After each successful task:
1. Stage changed files
2. Commit with message: `feat(S-XXXX): Complete task T{n} - {description}`
3. Update story file with progress
4. Continue to next task

This ensures partial progress is preserved even if later tasks fail.

## Edge Cases

1. **No tasks in plan**: Return success with 0 tasks completed
2. **Circular dependencies**: Detect and fail fast with clear error
3. **Task modifies files of future task**: Allow (sequential guarantee)
4. **Interrupted mid-task**: Task marked in_progress, retry on resume
5. **All tasks fail**: Return failure with comprehensive error report

## Definition of Done

- [ ] Orchestrator implemented and exported
- [ ] Integrates with existing implementation action flow
- [ ] Resume capability verified (kill mid-run, restart, completes)
- [ ] Decision logic handles all failure categories
- [ ] Unit tests cover orchestration logic
- [ ] Integration test runs full orchestration
- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)

---

**Effort:** large
**Dependencies:** S-0044, S-0045, S-0046
**Blocks:** S-0048, S-0049
