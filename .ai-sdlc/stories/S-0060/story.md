---
id: S-0060
title: Orphaned vitest/node processes not cleaned up after agent runs
priority: 40
status: backlog
type: bug
created: '2026-01-18'
labels:
  - process-management
  - vitest
  - resource-leak
  - scaling
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: orphaned-vitest-processes-cleanup
---
# Orphaned vitest/node processes not cleaned up after agent runs

## User Story

**As a** developer running multiple ai-sdlc agents
**I want** child processes (vitest, node) to be properly cleaned up when agents complete or fail
**So that** my system resources aren't consumed by orphaned processes that slow down my machine

## Summary

When running ai-sdlc agents, child processes spawned for testing (vitest in watch mode) or other operations are not being properly terminated when the parent agent completes. This leads to resource exhaustion as orphaned processes accumulate, particularly problematic when scaling up agent usage.

## Bug Evidence

**Observed 2026-01-18:**

| Expected | Actual |
|----------|--------|
| 1 node process (ai-sdlc) | 17+ node processes |
| Clean process tree after agent | 16 orphaned vitest workers |
| ~1% CPU usage | ~110% CPU usage combined |

**Process snapshot showing orphaned vitest workers:**
```
probinson  15866  21.5%  node (vitest 6)  - started 4:51PM
probinson  43251  15.2%  node (vitest 2)  - started 5:01PM
probinson  15867  14.6%  node (vitest 7)  - started 4:51PM
probinson   3066  13.5%  node (vitest 2)  - started 4:44PM
probinson  43252  13.1%  node (vitest 3)  - started 5:01PM
... (11 more vitest workers)
```

**Root symptom:** Computer running slow, requiring manual `kill -9` of orphaned processes.

## Root Cause Analysis

**Likely causes (to investigate):**

1. **Vitest watch mode:** Tests may be running with `--watch` flag which keeps processes alive
2. **Missing signal handlers:** Parent process may not be forwarding SIGTERM/SIGINT to children
3. **Detached processes:** Child processes may be spawned with `detached: true`
4. **No cleanup on exit:** Missing process cleanup in error handlers or normal exit paths
5. **Agent subprocess spawning:** Agents spawning test commands may not track/cleanup children

## Acceptance Criteria

### Core Functionality
- [ ] All child processes spawned by ai-sdlc are tracked
- [ ] Child processes are terminated when parent agent completes (success or failure)
- [ ] Vitest specifically runs without watch mode in CI/automated contexts
- [ ] Signal handlers (SIGTERM, SIGINT, SIGKILL) propagate to child processes

### Process Management
- [ ] Implement process group management or explicit child tracking
- [ ] Add cleanup handler on process exit (normal, error, signal)
- [ ] Timeout for graceful shutdown before force-killing orphans
- [ ] Option to run in "isolated" mode with guaranteed cleanup

### Verification
- [ ] After agent run completes, `pgrep -f vitest` returns no orphaned processes
- [ ] Memory/CPU returns to baseline after agent completion
- [ ] Stress test: run 10 agents in sequence, verify no process accumulation

### Quality
- [ ] `make verify` passes
- [ ] Unit tests for process tracking and cleanup
- [ ] Integration test that spawns child process and verifies cleanup

## Technical Notes

### Investigation Areas

1. **How tests are invoked:**
   - Check if `npm test` is run with watch mode flags
   - Check vitest configuration for watch defaults

2. **Process spawning:**
   - Search for `spawn`, `exec`, `fork` calls
   - Check if processes are tracked for cleanup

3. **Exit handlers:**
   - Look for `process.on('exit')`, `process.on('SIGTERM')` handlers
   - Check if cleanup includes child process termination

### Proposed Solutions

**Option A: Vitest Configuration**
Ensure vitest runs with `--run` flag (single run, no watch):
```bash
vitest run  # instead of vitest or vitest --watch
```

**Option B: Process Group Management**
Spawn children in same process group, kill entire group on exit:
```typescript
const child = spawn('npm', ['test'], {
  detached: false,
  stdio: 'inherit'
});

process.on('exit', () => {
  process.kill(-child.pid); // Kill process group
});
```

**Option C: Explicit Child Tracking**
```typescript
const children: ChildProcess[] = [];

function spawnTracked(cmd: string, args: string[]): ChildProcess {
  const child = spawn(cmd, args);
  children.push(child);
  return child;
}

function cleanupChildren(): void {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

process.on('exit', cleanupChildren);
process.on('SIGTERM', cleanupChildren);
process.on('SIGINT', cleanupChildren);
```

**Option D: Tree-kill package**
Use `tree-kill` npm package to kill entire process trees:
```typescript
import treeKill from 'tree-kill';

process.on('exit', () => {
  for (const child of children) {
    treeKill(child.pid, 'SIGTERM');
  }
});
```

### Files to Investigate
- Test execution code (where `npm test` or `vitest` is invoked)
- Agent subprocess management
- CLI runner exit handlers
- `vitest.config.ts` for watch mode settings

## Out of Scope

- Cleanup of processes started by user outside ai-sdlc
- Monitoring/alerting for orphaned processes
- Process resource limits (ulimits)

## Definition of Done

- [ ] No orphaned vitest processes after agent runs complete
- [ ] Signal handling properly terminates child processes
- [ ] Vitest does not run in watch mode during automated runs
- [ ] Stress test passes: 10 sequential agent runs, 0 orphaned processes
- [ ] `make verify` passes
- [ ] Documentation updated if configuration changes needed

## Related

- Vitest documentation on run modes
- Node.js child_process documentation
- Signal handling in Node.js

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
