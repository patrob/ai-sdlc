---
id: S-0095
title: Parallel Epic Processing with --epic flag
priority: 6
status: backlog
type: feature
created: '2026-01-19'
labels:
  - cli
  - automation
  - batch-processing
  - parallelization
  - epic-batch-automation
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: parallel-epic-processing
dependencies:
  - S-0094
  - S-0096
---
# Parallel Epic Processing with --epic flag

## User Story

**As a** developer using ai-sdlc
**I want** to process all stories in an epic with automatic parallelization
**So that** I can complete an entire epic faster by running independent stories concurrently

## Summary

Add an `--epic` flag to the `run` command that finds all stories with a matching epic label and processes them with intelligent parallelization. Stories are grouped by dependency order, and independent stories within each group run in parallel using separate worktrees.

## Technical Context

**Current State:**
- Stories support `labels` array in frontmatter (e.g., `epic-ticketing-integration`)
- Worktrees enable filesystem isolation for parallel work
- S-0094 provides sequential batch processing foundation
- No mechanism to discover stories by epic or run in parallel

**Target State:**
- `ai-sdlc run --epic ticketing-integration` finds and processes all matching stories
- Independent stories run in parallel (up to configurable limit)
- Each parallel story uses its own worktree for isolation
- Progress dashboard shows status of all concurrent stories

## Acceptance Criteria

### CLI Interface

- [ ] Add `--epic <epic-id>` option to `run` command
  - Accepts epic identifier: `--epic ticketing-integration`
  - Matches stories with label `epic-{epic-id}`
  - Normalizes input (strips `epic-` prefix if provided)

- [ ] Flag validation:
  - [ ] `--epic` conflicts with `--story` and `--batch` (mutually exclusive)
  - [ ] `--epic` conflicts with `--watch` (mutually exclusive)
  - [ ] `--epic` requires worktrees to be enabled in config
  - [ ] `--epic` can combine with `--dry-run`, `--force`

- [ ] Add `--max-concurrent <n>` option (default: 3)
  - Limits parallel story count to prevent resource exhaustion
  - Validates n >= 1

### Epic Story Discovery

- [ ] Find stories by epic label matching `epic-{epic-id}`
- [ ] Sort discovered stories by:
  1. `dependencies` field (topological order)
  2. `priority` field (ascending)
  3. `created` date (ascending)
- [ ] Display discovered stories before processing:
  ```
  Found 7 stories for epic: ticketing-integration

    Phase 1 (parallel):
      S-0071: Document existing configuration
      S-0072: Design ticketing provider interface

    Phase 2 (parallel):
      S-0073: Implement GitHub Issues provider
      S-0074: Implement Linear provider

    Phase 3 (sequential):
      S-0075: Add ticketing commands to CLI
      ...
  ```

### Parallel Execution

- [ ] Group stories by dependency phases
- [ ] Run stories within each phase in parallel (up to max-concurrent)
- [ ] Wait for all stories in a phase to complete before starting next phase
- [ ] Create one worktree per concurrent story
- [ ] Clean up worktrees after story completion (unless `--keep-worktrees`)

### Progress Dashboard

- [ ] Real-time status display for all concurrent stories:
  ```
  Epic: ticketing-integration (Phase 2/3)
  ┌─────────────────────────────────────────────────────┐
  │ S-0073 [████████░░] implementing  (task 4/6)        │
  │ S-0074 [██████████] reviewing     (waiting approval)│
  │ S-0075 [──────────] queued        (depends: S-0073) │
  └─────────────────────────────────────────────────────┘
  Completed: 2/7  Failed: 0  In Progress: 2
  ```
- [ ] Write per-story logs to `.ai-sdlc/stories/{id}/epic-run.log`

### Error Handling

- [ ] If a story fails:
  - Continue other parallel stories in same phase
  - Skip dependent stories with clear message
  - Don't start new phases if blocking story failed
- [ ] Summary report shows all failures with root causes
- [ ] Return non-zero exit code if any story failed

### Configuration

- [ ] Add to `.ai-sdlc.json`:
  ```json
  {
    "epic": {
      "maxConcurrent": 3,
      "keepWorktrees": false,
      "continueOnFailure": true
    }
  }
  ```

## Files to Modify

| File | Change |
|------|--------|
| `src/index.ts` | Add `--epic` and `--max-concurrent` options |
| `src/cli/commands.ts` | Add epic processing orchestration |
| `src/core/config.ts` | Add epic configuration schema |
| `src/core/kanban.ts` | Use `findStoriesByEpic()` from S-0096 |

## Files to Create

| File | Purpose |
|------|---------|
| `src/cli/epic-processor.ts` | Parallel epic orchestration logic |
| `src/cli/progress-dashboard.ts` | Real-time multi-story progress display |
| `tests/integration/epic-processing.test.ts` | Integration tests for epic mode |

## Implementation Notes

```typescript
// src/cli/epic-processor.ts
export interface EpicResult {
  epicId: string;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  duration: number;
  phases: PhaseResult[];
}

export interface PhaseResult {
  phase: number;
  stories: StoryResult[];
  parallel: boolean;
}

export async function processEpic(
  epicId: string,
  sdlcRoot: string,
  projectRoot: string,
  options: {
    maxConcurrent?: number;
    dryRun?: boolean;
    force?: boolean;
    keepWorktrees?: boolean;
  }
): Promise<EpicResult>
```

### Dependency Resolution Algorithm

```typescript
function groupStoriesByPhase(stories: Story[]): Story[][] {
  // Build dependency graph
  // Topological sort with grouping
  // Stories with no unmet dependencies go in current phase
  // Repeat until all stories assigned
}
```

## Testing Requirements

- [ ] Unit tests for epic label matching
- [ ] Unit tests for dependency phase grouping
- [ ] Unit tests for topological sort with cycles detection
- [ ] Integration test: epic with 3 independent stories (parallel)
- [ ] Integration test: epic with sequential dependencies
- [ ] Integration test: epic with mixed parallel/sequential phases
- [ ] Integration test: story failure skips dependents
- [ ] Integration test: `--max-concurrent` respected
- [ ] Integration test: worktree cleanup
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Out of Scope

- Cross-epic dependencies
- Resumable epic state (can be added later)
- Distributed processing across machines (future vision)

## Definition of Done

- [ ] `--epic` flag implemented and documented in help
- [ ] Epic story discovery working with label matching
- [ ] Parallel execution respects dependencies and limits
- [ ] Progress dashboard displays real-time status
- [ ] Worktree cleanup works correctly
- [ ] All tests pass
- [ ] `make verify` passes

## References

- Prerequisites:
  - S-0094 (Sequential Batch Processing) - batch execution foundation
  - S-0096 (Grouping Query Infrastructure) - `findStoriesByEpic()` and grouping types
- Existing worktree support: `src/core/worktree.ts`
- Daemon queue pattern: `src/cli/daemon.ts` (reference for concurrent tracking)
