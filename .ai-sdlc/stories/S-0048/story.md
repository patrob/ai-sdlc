---
id: S-0048
title: Task Dependency Graph Analysis
priority: 50
status: backlog
type: feature
created: '2026-01-16'
labels:
  - implementation
  - orchestration
  - optimization
estimated_effort: medium
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: task-dependency-graph-analysis
---
# Task Dependency Graph Analysis

## User Story

**As a** developer using ai-sdlc,
**I want** the orchestrator to understand task dependencies,
**So that** independent tasks can be identified for parallel execution and dependent tasks are ordered correctly.

## Summary

Build a dependency graph from task definitions. This enables:
1. Correct execution order (dependencies satisfied before dependents)
2. Identification of independent tasks (candidates for parallelization)
3. Detection of circular dependencies (fail fast)
4. Visualization of task relationships

This is the foundation for parallel task execution (S-0049).

## Context

Tasks in implementation plans may have explicit dependencies (via `Dependencies:` field) or implicit dependencies (via shared files). This story handles explicit dependencies; implicit detection is a future enhancement.

Example task dependencies:
```
T1: Create user model          (depends on: none)
T2: Create auth service        (depends on: T1)
T3: Create login endpoint      (depends on: T2)
T4: Create logout endpoint     (depends on: T2)
T5: Add auth middleware        (depends on: T1)
T6: Write integration tests    (depends on: T3, T4, T5)
```

Graph visualization:
```
    T1
   / | \
  T2 T5 |
 / \    |
T3 T4   |
  \ |  /
   T6
```

Independent task groups: [T3, T4, T5] can run in parallel after T2 and T1 complete.

## Acceptance Criteria

- [ ] Create `buildDependencyGraph(tasks: ImplementationTask[]): DependencyGraph` function
- [ ] Graph supports: get dependencies, get dependents, get roots, get leaves
- [ ] Create `getTopologicalOrder(graph): string[]` for sequential execution order
- [ ] Create `getIndependentTasks(graph, completedTasks): string[]` for parallel candidates
- [ ] Detect and report circular dependencies
- [ ] Validate all dependency references exist
- [ ] Integrate with orchestrator for correct task ordering
- [ ] Add unit tests for graph operations
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Interface Definitions

```typescript
interface DependencyGraph {
  // Core operations
  getDependencies(taskId: string): string[];  // Tasks this depends on
  getDependents(taskId: string): string[];    // Tasks that depend on this
  getRoots(): string[];                        // Tasks with no dependencies
  getLeaves(): string[];                       // Tasks with no dependents

  // Analysis
  hasCircularDependency(): boolean;
  getCircularPath(): string[] | null;          // Path if circular exists

  // Execution planning
  getTopologicalOrder(): string[];             // Valid execution order
  getIndependentTasks(completed: Set<string>): string[];  // Can run now

  // Utilities
  getAllTasks(): string[];
  isValidDependency(from: string, to: string): boolean;
}

function buildDependencyGraph(tasks: ImplementationTask[]): DependencyGraph;
```

### Graph Implementation

Use adjacency list representation:
```typescript
class TaskDependencyGraph implements DependencyGraph {
  private dependencies: Map<string, Set<string>>;  // task -> its dependencies
  private dependents: Map<string, Set<string>>;    // task -> tasks depending on it

  // Kahn's algorithm for topological sort
  // DFS for cycle detection
}
```

### File Location

Create in `src/core/dependency-graph.ts`:
- `TaskDependencyGraph` class
- `buildDependencyGraph()` factory function
- Cycle detection utilities

### Integration with Orchestrator

Modify `src/agents/orchestrator.ts`:
```typescript
// In runImplementationOrchestrator():
const graph = buildDependencyGraph(tasks);

if (graph.hasCircularDependency()) {
  return { success: false, error: 'Circular dependency detected: ' + graph.getCircularPath() };
}

// Get next task respecting dependencies
function getNextTask(completed: Set<string>): string | null {
  const ready = graph.getIndependentTasks(completed);
  return ready[0] || null;  // Sequential: just take first
}
```

### Parallel Execution Preview

For S-0049, the orchestrator will use:
```typescript
// Get ALL independent tasks, not just first
const parallelTasks = graph.getIndependentTasks(completed);
// Run all in parallel
await Promise.all(parallelTasks.map(t => runSingleTaskAgent(t)));
```

## Edge Cases

1. **No dependencies**: All tasks are roots, any order valid
2. **Linear chain**: T1 → T2 → T3, strictly sequential
3. **Diamond pattern**: T1 → [T2, T3] → T4, T2/T3 parallel
4. **Self-dependency**: T1 depends on T1, circular error
5. **Missing dependency**: T2 depends on T99 (doesn't exist), validation error
6. **Empty task list**: Return empty graph, no errors

## Definition of Done

- [ ] DependencyGraph implementation complete
- [ ] Topological sort produces valid execution order
- [ ] Independent task detection works correctly
- [ ] Circular dependency detection catches all cycles
- [ ] Integrated with orchestrator
- [ ] Unit tests cover all graph operations
- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)

---

**Effort:** medium
**Dependencies:** S-0044, S-0047
**Blocks:** S-0049
