---
id: S-0049
title: Parallel Task Execution
priority: 40
status: backlog
type: feature
created: '2026-01-16'
labels:
  - implementation
  - orchestration
  - performance
estimated_effort: medium
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: parallel-task-execution
---
# Parallel Task Execution

## User Story

**As a** developer using ai-sdlc,
**I want** independent implementation tasks to run in parallel,
**So that** implementation completes faster while maintaining quality through context isolation.

## Summary

Extend the sequential orchestrator to run independent tasks concurrently. When multiple tasks have no dependencies on each other, spawn multiple agents simultaneously. This provides:
- Faster implementation (N independent tasks in ~1x time instead of Nx)
- Same quality benefits (each agent still has fresh context)
- Efficient resource utilization

## Context

With the dependency graph (S-0048), we can identify tasks that have no mutual dependencies. These can safely run in parallel because:
- They don't share modified files (by definition of independence)
- They don't depend on each other's output
- Each runs in isolated context anyway

Example from S-0048:
```
    T1
   / | \
  T2 T5 |
 / \    |
T3 T4   |
  \ |  /
   T6
```

After T2 completes: T3, T4 can run in parallel
After T1 completes: T5 can run (even while T3/T4 run)
T6 waits for all of T3, T4, T5

## Acceptance Criteria

- [ ] Add `parallel: boolean` option to orchestrator (default: false)
- [ ] When parallel=true, spawn agents for all independent tasks simultaneously
- [ ] Configurable max concurrent agents (default: 3)
- [ ] Handle mixed results: some succeed, some fail
- [ ] Progress tracking handles concurrent updates safely
- [ ] Commit strategy: batch commit after parallel batch completes
- [ ] Failure handling: if one fails, let others finish, then decide
- [ ] Add unit tests for parallel orchestration logic
- [ ] Add integration test for parallel execution
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Extended Orchestrator Interface

```typescript
interface OrchestratorOptions {
  // ... existing options from S-0047
  parallel?: boolean;           // Enable parallel execution (default: false)
  maxConcurrent?: number;       // Max simultaneous agents (default: 3)
  parallelCommitStrategy?: 'batch' | 'individual';  // How to commit (default: 'batch')
}
```

### Parallel Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Parallel Orchestration Loop                                 │
│                                                             │
│  LOOP while pending tasks exist:                           │
│  ├─ 1. Get all independent tasks (via dependency graph)    │
│  ├─ 2. Limit to maxConcurrent                              │
│  ├─ 3. Mark all as in_progress                             │
│  ├─ 4. Spawn agents in parallel (Promise.all)              │
│  ├─ 5. Await all results                                   │
│  ├─ 6. Process results:                                    │
│  │   ├─ Successes: mark completed                          │
│  │   └─ Failures: mark failed, maybe retry                 │
│  ├─ 7. Batch commit successes                              │
│  └─ 8. Repeat with next independent batch                  │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Sketch

```typescript
async function runParallelBatch(
  tasks: string[],
  context: OrchestratorContext
): Promise<BatchResult> {
  // Mark all in_progress
  await Promise.all(tasks.map(t => updateTaskProgress(t, 'in_progress')));

  // Run all agents concurrently
  const results = await Promise.allSettled(
    tasks.map(taskId => runSingleTaskAgent(
      buildTaskContext(taskId, context)
    ))
  );

  // Process results
  const successes: string[] = [];
  const failures: Array<{ taskId: string; error: string }> = [];

  results.forEach((result, index) => {
    const taskId = tasks[index];
    if (result.status === 'fulfilled' && result.value.success) {
      successes.push(taskId);
    } else {
      const error = result.status === 'rejected'
        ? result.reason.message
        : result.value.error;
      failures.push({ taskId, error });
    }
  });

  // Update progress and commit
  await Promise.all(successes.map(t => updateTaskProgress(t, 'completed')));
  await Promise.all(failures.map(f => updateTaskProgress(f.taskId, 'failed')));

  if (successes.length > 0) {
    await batchCommit(successes);
  }

  return { successes, failures };
}
```

### File Location

Extend `src/agents/orchestrator.ts`:
- `runParallelBatch()` - new helper function
- Modify main loop to use parallel batches when `parallel: true`

### Concurrency Considerations

1. **File conflicts**: Independent tasks shouldn't share files, but validate
2. **Progress updates**: Use atomic file operations (already in S-0046)
3. **Git commits**: Batch commit after parallel batch to avoid conflicts
4. **Error isolation**: One failure shouldn't cancel in-flight agents

### Failure Handling Strategy

When some tasks in a parallel batch fail:
1. Let all in-flight agents complete (don't cancel)
2. Commit successful tasks
3. Mark failed tasks
4. On next iteration, failed tasks can retry (if retries remain)
5. Dependent tasks wait until dependencies succeed

### Resource Limits

Default `maxConcurrent: 3` balances:
- API rate limits
- Local machine resources (multiple agent processes)
- Reasonable parallelism benefit

Make configurable for different environments.

## Edge Cases

1. **All tasks independent**: Run all in parallel (up to maxConcurrent)
2. **All tasks sequential**: Falls back to sequential behavior
3. **Mixed results**: Some succeed, some fail - handle gracefully
4. **Retry in parallel**: Failed task can be retried in next parallel batch
5. **Single task remaining**: Just run it (no parallelism overhead)

## Definition of Done

- [ ] Parallel execution mode implemented
- [ ] maxConcurrent limit enforced
- [ ] Batch commit strategy working
- [ ] Mixed success/failure handling correct
- [ ] No race conditions in progress tracking
- [ ] Unit tests cover parallel scenarios
- [ ] Integration test proves parallelism works
- [ ] Performance improvement measurable (N tasks faster than N * single-task time)
- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)

---

**Effort:** medium
**Dependencies:** S-0047, S-0048
**Blocks:** None (final story in sequence)
