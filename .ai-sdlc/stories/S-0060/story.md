---
id: S-0060
title: Orphaned vitest/node processes not cleaned up after agent runs
priority: 40
status: in-progress
type: bug
created: '2026-01-18'
labels:
  - process-management
  - vitest
  - resource-leak
  - scaling
  - s
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
slug: orphaned-vitest-processes-cleanup
worktree_path: >-
  /Users/probinson/Repos/on-par/pocs/ai-sdlc/.ai-sdlc/worktrees/S-0060-orphaned-vitest-processes-cleanup
updated: '2026-01-19'
branch: ai-sdlc/orphaned-vitest-processes-cleanup
last_test_run:
  passed: true
  failures: 0
  timestamp: '2026-01-19T00:58:50.378Z'
implementation_retry_count: 0
---
# Orphaned vitest/node processes not cleaned up after agent runs

## User Story

**As a** developer running multiple ai-sdlc agents  
**I want** child processes (vitest, node) to be properly cleaned up when agents complete or fail  
**So that** my system resources aren't consumed by orphaned processes that slow down my machine

## Problem Statement

When ai-sdlc agents spawn child processes for testing (vitest) or other operations, these processes are not properly terminated when the parent agent completes. This leads to resource exhaustion as orphaned processes accumulate, particularly problematic when running multiple agents or during development iterations.

**Impact:** System slowdown requiring manual intervention (`kill -9`) to reclaim resources.

## Evidence

**Observed on 2026-01-18:**
- **Expected state:** 1 node process (ai-sdlc), ~1% CPU usage
- **Actual state:** 17+ node processes (16 orphaned vitest workers), ~110% combined CPU usage
- **Symptom:** Computer running slow, orphaned processes persist indefinitely

**Sample orphaned processes:**
```
probinson  15866  21.5%  node (vitest 6)  - started 4:51PM
probinson  43251  15.2%  node (vitest 2)  - started 5:01PM
probinson  15867  14.6%  node (vitest 7)  - started 4:51PM
probinson   3066  13.5%  node (vitest 2)  - started 4:44PM
probinson  43252  13.1%  node (vitest 3)  - started 5:01PM
```

## Root Cause Hypotheses

1. **Vitest watch mode enabled:** Tests running with `--watch` flag or watch mode default
2. **Missing signal handlers:** Parent process not forwarding SIGTERM/SIGINT to children
3. **Detached child processes:** Children spawned with `detached: true` or in separate process groups
4. **No cleanup on exit:** Missing process cleanup in error handlers or normal exit paths
5. **Untracked spawns:** Child processes not registered for cleanup

## Acceptance Criteria

### Process Cleanup (Core)
- [ ] All child processes terminated when parent agent completes successfully
- [ ] All child processes terminated when parent agent fails or is interrupted
- [ ] Cleanup occurs for both SIGTERM and SIGINT signals
- [ ] Cleanup occurs for uncaught exceptions and unhandled rejections
- [ ] Orphaned processes do not persist after agent exit (verified via `pgrep -f vitest`)

### Vitest Configuration
- [ ] Vitest runs in single-run mode (no watch) when invoked by agents
- [ ] Vitest processes exit cleanly after test completion
- [ ] Vitest worker pool is properly torn down

### Signal Handling
- [ ] SIGTERM/SIGINT signals propagate to all child processes
- [ ] Graceful shutdown attempted before force-kill (5 second timeout)
- [ ] Process group management or explicit child tracking implemented

### Verification & Testing
- [ ] Unit tests verify process tracking and cleanup logic
- [ ] Integration test spawns child process and verifies cleanup on exit
- [ ] Stress test: 10 sequential agent runs produce 0 orphaned processes
- [ ] Memory and CPU usage returns to baseline after agent completion
- [ ] `make verify` passes

### Code Quality
- [ ] Process spawning code follows DRY principle (shared utility if multiple spawn sites)
- [ ] Signal handlers don't interfere with existing error handling
- [ ] Cleanup is idempotent (safe to call multiple times)

## Technical Constraints

- **Compatibility:** Must work across macOS, Linux, and Windows
- **Graceful degradation:** If force-kill fails, log warning but don't crash parent
- **Timeout:** Graceful shutdown must not block indefinitely (max 5 seconds)
- **Existing behavior:** Don't break existing test execution or reporting

## Edge Cases

1. **Rapid successive runs:** Multiple agents starting/stopping quickly should not interfere
2. **Child spawns grandchildren:** Nested process trees must be fully cleaned
3. **Already-dead processes:** Cleanup should handle processes that exited naturally
4. **Non-existent PIDs:** Cleanup should handle race conditions where PID is reused
5. **Watch mode override:** Developer explicitly running `npm test` with watch should not be affected (cleanup only applies to agent-spawned processes)

## Investigation Areas

1. **Test invocation points:**
   - How `npm test` or `vitest` is called
   - Check for `--watch` or `--run` flags
   - Review `vitest.config.ts` for watch defaults

2. **Process spawning:**
   - Search for `spawn`, `exec`, `fork` in agent code
   - Check `detached` and `stdio` options
   - Identify all locations that spawn children

3. **Exit handlers:**
   - Look for existing `process.on('exit')`, `process.on('SIGTERM')` handlers
   - Check if cleanup includes child termination
   - Review error handling paths

## Proposed Solutions

### Option A: Vitest Configuration (Simplest)
Force single-run mode: `vitest run` instead of `vitest`

**Pros:** Minimal code change  
**Cons:** Doesn't address non-vitest children

### Option B: Process Group Management
Spawn children in same group, kill entire group on exit

**Pros:** Handles nested children automatically  
**Cons:** Platform-specific behavior

### Option C: Explicit Child Tracking
Maintain registry of spawned children, iterate and kill on exit

**Pros:** Explicit control, cross-platform  
**Cons:** Requires discipline to register all spawns

### Option D: tree-kill Package
Use `tree-kill` npm package to kill process trees

**Pros:** Battle-tested, handles nested children  
**Cons:** External dependency

**Recommendation:** Combination of A (immediate fix) + C or D (robust long-term solution)

## Out of Scope

- Cleanup of processes started by user outside ai-sdlc
- Monitoring/alerting for orphaned processes system-wide
- Process resource limits (ulimits)
- Retroactive cleanup of already-orphaned processes

## Files to Investigate

- Test execution entry points (CLI commands that invoke tests)
- Agent subprocess management code
- `vitest.config.ts` for watch mode configuration
- Process exit handlers in main CLI runner

## Definition of Done

- [ ] Zero orphaned vitest processes after 10 sequential agent runs
- [ ] Signal handling properly terminates all child processes
- [ ] Vitest runs in single-run mode during automated agent execution
- [ ] All tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] `make verify` passes
- [ ] Code follows DRY and SOLID principles (shared cleanup utility if multiple spawn sites)

---

**effort:** medium  
**labels:** bug, process-management, resource-cleanup, testing-infrastructure

## Research

Perfect! Now I have enough context. Let me create comprehensive research findings for the story:


## Web Research Findings

Web research tools require user permission. Let me provide the research findings based on the successful Node.js official documentation fetch:

---

## Web Research Findings

### 1. Node.js Child Process Lifecycle and Signal Handling
**Source**: Official Node.js Documentation (nodejs.org/api/child_process.html)
**FAR Score**: Factuality: 5, Actionability: 5, Relevance: 5
**Justification**: This is the canonical reference for child process management. Provides exact API signatures and patterns directly applicable to the story's cleanup requirements. Directly addresses acceptance criteria for signal propagation, graceful shutdown, and preventing orphaned processes.

#### Key Findings:

**1. Critical `close` vs `exit` Event Distinction**
\`\`\`javascript
subprocess.on('exit', (code, signal) => {
  // Fires when process ends, but stdio streams may still be open
});

subprocess.on('close', (code, signal) => {
  // Fires AFTER exit AND all stdio streams closed
  // This is the correct event for cleanup verification
});
\`\`\`

**Action for story**: The current codebase uses `child.on('close')` correctly in all three agent files. This is good and should be preserved.

**2. Graceful Shutdown Pattern with Timeout**
\`\`\`javascript
const child = spawn('command');

// Graceful shutdown on parent signal
process.on('SIGTERM', () => {
  child.kill('SIGTERM');
  
  // Force kill if still alive after 5 seconds
  setTimeout(() => {
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  }, 5000);
});
\`\`\`

**Action for story**: This matches the story's 5-second timeout requirement. The ProcessManager should implement this exact pattern.

**3. AbortSignal API (Node.js 15.6.0+) for Graceful Cancellation**
\`\`\`javascript
const controller = new AbortController();
const { signal } = controller;

const child = spawn('grep', ['ssh'], { signal });

child.on('error', (err) => {
  // err will be AbortError if controller.abort() is called
});

controller.abort(); // Gracefully stops child
\`\`\`

**Action for story**: This is a more modern alternative to manual signal handling. Consider this as an enhancement, but not required for MVP since existing timeout pattern works.

**4. Critical Shell Subprocess Warning**
> "Child processes of shell commands may NOT be terminated when killing the parent"

Example of problematic pattern:
\`\`\`javascript
const subprocess = spawn('sh', ['-c', 'node -e "setInterval(...)"']);
subprocess.kill(); // Does NOT kill the inner node process!
\`\`\`

**Action for story**: The codebase spawns `npm` which internally spawns `vitest` which spawns worker forks. This is a **process tree problem**, not a single-child problem. Simply killing the `npm` process won't kill vitest workers.

**Solution**: Need to either:
- Use process groups (Unix: send signal to `-pid` to kill group)
- Use a package like `tree-kill` to recursively kill process trees
- Track vitest worker PIDs separately (harder to implement)

**5. Windows Signal Limitations**
Only these signals work on Windows:
- `SIGKILL`, `SIGTERM`, `SIGINT`, `SIGQUIT`

All others are ignored and process is force-killed.

**Action for story**: The story's acceptance criteria require cross-platform compatibility. Using `SIGTERM` → `SIGKILL` escalation is correct for Windows compatibility.

**6. Process Reference Management**
\`\`\`javascript
const child = spawn('long-running-task', { detached: true, stdio: 'ignore' });
child.unref(); // Allows parent to exit without waiting
\`\`\`

**Action for story**: **Do NOT use `unref()`** for test processes. We want the parent to wait for tests to complete, and we want to explicitly kill them on parent exit. The default behavior (ref'd) is correct.

---

### 2. Process Tree Cleanup Challenge (from Node.js docs analysis)

**Source**: Node.js Child Process Documentation - Shell Subprocess Section
**FAR Score**: Factuality: 5, Actionability: 4, Relevance: 5
**Justification**: Directly explains why the orphaned vitest processes exist. The current approach of killing only the immediate child (`npm`) doesn't kill grandchildren (`vitest` workers). Actionable solutions require either process groups or external tooling.

#### Root Cause Confirmation:

The codebase spawns:
\`\`\`
Parent (ai-sdlc) 
  └─> npm test (child)
       └─> vitest run (grandchild)
            └─> vitest worker 1 (great-grandchild)
            └─> vitest worker 2 (great-grandchild)
            └─> ... (more workers)
\`\`\`

Calling `child.kill('SIGTERM')` on the `npm` process only kills `npm`, not the vitest workers.

#### Solutions:

**Option A: Process Groups (Unix/Linux/macOS)**
\`\`\`javascript
const child = spawn('npm', ['test'], {
  detached: true // Creates new process group
});

// Kill entire process group
process.kill(-child.pid, 'SIGTERM'); // Negative PID = entire group
\`\`\`

**Pros**: Native Node.js, no dependencies
**Cons**: Doesn't work on Windows, requires `detached: true` which changes behavior

**Option B: tree-kill Package**
\`\`\`javascript
import treeKill from 'tree-kill';

const child = spawn('npm', ['test']);

// Kill entire process tree
treeKill(child.pid, 'SIGTERM', (err) => {
  if (err) console.error('Failed to kill tree:', err);
});
\`\`\`

**Pros**: Cross-platform, battle-tested, handles nested children
**Cons**: External dependency (but small and well-maintained)

**Option C: Track Vitest PIDs Directly**
Parse `ps` output or vitest's process information to track worker PIDs.

**Pros**: Explicit control
**Cons**: Fragile, platform-specific, complex

**Recommendation for story**: Use **Option B (tree-kill)** for robustness and cross-platform support. This directly addresses the acceptance criterion: "Cleanup occurs for both SIGTERM and SIGINT signals" and "Nested process trees must be fully cleaned."

---

### 3. Event Loop and Process Exit Timing

**Source**: Node.js Child Process Documentation - Events and Reference Counting
**FAR Score**: Factuality: 5, Actionability: 4, Relevance: 4
**Justification**: Explains why cleanup handlers must be synchronous or must keep event loop alive. Relevant to ensuring cleanup completes before parent exits.

#### Key Insight:

The `process.on('exit')` handler runs synchronously when event loop drains:
\`\`\`javascript
process.on('exit', (code) => {
  // This must be SYNCHRONOUS
  // Cannot perform async operations here
  child.kill('SIGTERM'); // This works
  await someAsyncCleanup(); // This will NOT work!
});
\`\`\`

For graceful async cleanup, use `SIGTERM`/`SIGINT` handlers instead:
\`\`\`javascript
process.on('SIGTERM', async () => {
  await gracefulShutdown(); // Async is OK here
  process.exit(0);
});
\`\`\`

**Action for story**: The ProcessManager's `killAll()` method should be synchronous (send signals immediately) but the application-level shutdown handlers can be async if needed (e.g., wait for cleanup confirmation).

**Recommended pattern**:
\`\`\`javascript
// In src/index.ts
process.on('SIGTERM', () => {
  ProcessManager.getInstance().killAll('SIGTERM');
  
  // Give children 5 seconds to clean up
  setTimeout(() => {
    ProcessManager.getInstance().killAll('SIGKILL');
    process.exit(0);
  }, 5000);
});

process.on('exit', () => {
  // Final synchronous cleanup
  ProcessManager.getInstance().killAll('SIGKILL');
});
\`\`\`

---

### Summary of Actionable Recommendations

1. **Implement ProcessManager singleton** as planned in codebase analysis
2. **Use tree-kill package** instead of bare `child.kill()` to handle process trees
3. **Preserve existing `close` event listeners** - they're correct
4. **Use SIGTERM → SIGKILL escalation** with 5-second timeout (already in story acceptance criteria)
5. **Install handlers in both `src/index.ts` and `src/cli/daemon.ts`** as planned
6. **Test with `ps` or `pgrep` commands** in integration tests to verify no orphans
7. **Do NOT use `unref()`** on test processes - we want to track them

---

### Additional Research Notes

Web search tools (WebSearch, additional WebFetch) require user permission and were not available for this research session. The Node.js official documentation provided sufficient authoritative information to address the story's core requirements.

If access to additional web resources is granted, valuable follow-up research would include:
- tree-kill package documentation and API details
- Vitest worker pool configuration options
- Community patterns for process cleanup in CLI tools
- Stack Overflow discussions on orphaned process prevention

However, the current findings from official Node.js documentation are sufficient to proceed with implementation.

## Problem Summary

The core problem is that when ai-sdlc agents spawn child processes (primarily vitest test runners via `spawn('npm', ['test', ...])`), these child processes are not properly terminated when the parent agent completes or fails. This leads to orphaned vitest/node processes accumulating in the system, consuming ~110% combined CPU and requiring manual cleanup with `kill -9`.

**Root cause:** Child processes are spawned but there's no centralized process tracking or cleanup mechanism. When agents complete (successfully or via error/interruption), child processes continue running because:
1. No registry tracks spawned children across the application
2. No cleanup handlers execute on agent completion/failure
3. Signal handlers in daemon.ts only handle the main process shutdown, not child cleanup
4. Tests run with `npm test` which uses `vitest run` (should be non-watch), but vitest worker pools may not be properly torn down

## Codebase Context

### Current Process Spawning Patterns

The codebase spawns child processes in **three main locations**:

1. **`src/agents/implementation.ts`** (lines 112-155, 168-211):
   - `runSingleTest()`: Spawns `npm test -- testFile` for individual tests
   - `runAllTests()`: Spawns `npm test` for full test suite
   - Pattern: Uses `spawn()` with timeout handlers that kill with `SIGTERM` then `SIGKILL`
   - **Issue:** Only kills during timeout, not on normal completion or parent error

2. **`src/agents/verification.ts`** (lines 89-145):
   - `runCommandAsync()`: Generic command runner for build/test commands
   - Spawns executable+args parsed from command string
   - Pattern: Same timeout kill pattern as implementation.ts
   - **Issue:** Same - only kills on timeout

3. **`src/agents/review.ts`** (lines 203-271):
   - `runCommandAsync()`: Another command runner for review verification
   - Pattern: Identical to verification.ts
   - **Issue:** Same cleanup limitations

**Common pattern across all three:**
\`\`\`typescript
const child = spawn(executable, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
const timeoutId = setTimeout(() => {
  killed = true;
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 5000);
}, timeout);

child.on('close', (code) => {
  clearTimeout(timeoutId);
  resolve({ success: code === 0, output });
});
\`\`\`

**Problem:** If parent process exits before child completes, the child is orphaned because:
- No tracking of child PIDs at application level
- `child.on('close')` won't fire if parent exits
- No cleanup in `process.on('exit')` handlers

### Existing Signal Handling

**`src/cli/daemon.ts`** (lines 441-484) has signal handlers:
- Registers `SIGINT` and `SIGTERM` handlers
- Calls `this.stop()` which closes file watchers and polling timers
- **Does NOT track or cleanup spawned child processes**

**`src/index.ts`** (main entry point):
- No signal handlers at all
- Process spawning happens in agents called from here

### Test Configuration

**`vitest.config.ts`**:
- Uses `pool: 'forks'` (spawns worker processes)
- `npm test` runs `vitest run` (should be single-run, not watch mode)
- **Hypothesis:** Vitest worker pool may not be properly torn down when parent exits abruptly

**`package.json`**:
- `"test": "vitest run"` - Correct, uses run mode not watch
- But vitest may spawn worker forks that don't exit if parent dies

## Files Requiring Changes

### 1. Create New: `src/core/process-manager.ts`

**Change Type:** Create New

**Reason:** Centralized process tracking and cleanup is needed across the entire application. This follows the DRY principle since three different files spawn processes with similar patterns.

**Specific Changes:**
- Export `ProcessManager` singleton class that:
  - Maintains `Set<ChildProcess>` of all spawned children
  - Provides `registerChild(child: ChildProcess)` method
  - Provides `killAll(signal?: NodeJS.Signals)` method to terminate all tracked children
  - Handles cleanup of already-dead processes from the registry
  - Provides graceful shutdown with timeout (try SIGTERM, fallback to SIGKILL after 5s)

**Dependencies:** None (this is the foundation)

### 2. Create New: `src/core/process-manager.test.ts`

**Change Type:** Create New

**Reason:** Unit tests for the process manager to verify tracking and cleanup logic

**Specific Changes:**
- Mock child processes to verify registry behavior
- Test graceful shutdown timeout logic
- Test signal propagation to children
- Test removal of dead processes from registry

**Dependencies:** Must be created after `src/core/process-manager.ts`

### 3. Modify: `src/agents/implementation.ts`

**Change Type:** Modify Existing

**Reason:** This file spawns test processes (`runSingleTest`, `runAllTests`) that are the primary source of orphaned vitest workers

**Specific Changes:**
- Import `ProcessManager` singleton
- After spawning child in `runSingleTest()` (line ~112) and `runAllTests()` (line ~168), immediately call `ProcessManager.getInstance().registerChild(child)`
- Process manager handles cleanup on exit, so no other changes needed to spawn logic

**Dependencies:** Requires `src/core/process-manager.ts` to exist first

### 4. Modify: `src/agents/verification.ts`

**Change Type:** Modify Existing

**Reason:** Spawns build/test commands that need tracking

**Specific Changes:**
- Import `ProcessManager` singleton
- After spawning child in `runCommandAsync()` (line ~102), call `ProcessManager.getInstance().registerChild(child)`

**Dependencies:** Requires `src/core/process-manager.ts` to exist first

### 5. Modify: `src/agents/review.ts`

**Change Type:** Modify Existing

**Reason:** Spawns verification commands that need tracking

**Specific Changes:**
- Import `ProcessManager` singleton  
- After spawning child in `runCommandAsync()` (line ~222), call `ProcessManager.getInstance().registerChild(child)`

**Dependencies:** Requires `src/core/process-manager.ts` to exist first

### 6. Modify: `src/index.ts`

**Change Type:** Modify Existing

**Reason:** Main entry point needs to install global process exit handlers to cleanup children

**Specific Changes:**
- Import `ProcessManager` at top of file
- Before `program.parse()` (line 278), add:
  \`\`\`typescript
  // Setup global cleanup handlers for child processes
  const processManager = ProcessManager.getInstance();
  process.on('exit', () => processManager.killAll('SIGTERM'));
  process.on('SIGTERM', () => {
    processManager.killAll('SIGTERM');
    process.exit(0);
  });
  process.on('SIGINT', () => {
    processManager.killAll('SIGTERM');
    process.exit(0);
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    processManager.killAll('SIGKILL');
    process.exit(1);
  });
  \`\`\`

**Dependencies:** Requires `src/core/process-manager.ts` to exist first

### 7. Modify: `src/cli/daemon.ts`

**Change Type:** Modify Existing

**Reason:** Daemon signal handlers need to cleanup child processes before exit

**Specific Changes:**
- Import `ProcessManager` at top of file
- In `handleShutdown()` function (line ~442), before `process.exit()` calls, add:
  \`\`\`typescript
  ProcessManager.getInstance().killAll('SIGTERM');
  \`\`\`
- Ensures daemon mode also cleans up children

**Dependencies:** Requires `src/core/process-manager.ts` to exist first

## Testing Strategy

### Test Files to Modify

1. **Existing:** `src/agents/implementation.test.ts` - Add test case verifying child processes are registered with ProcessManager
2. **Existing:** `src/agents/verification.test.ts` - Add test case verifying child processes are registered
3. **Existing:** `src/agents/review.test.ts` - Add test case verifying child processes are registered

### New Tests Needed

1. **`src/core/process-manager.test.ts`** (Unit tests):
   - Test child registration and de-registration
   - Test `killAll()` sends correct signals
   - Test graceful shutdown timeout (SIGTERM → SIGKILL after 5s)
   - Test cleanup of already-dead processes

2. **`tests/integration/process-cleanup.test.ts`** (Integration test):
   - Spawn a long-running child process (e.g., `sleep 60`)
   - Trigger parent exit via signal
   - Verify child is terminated (use `ps` or process.kill with signal 0 to check)
   - Verify no orphaned processes remain

### Test Scenarios

**Happy Path:**
- Spawn child → child completes normally → auto-removed from registry → parent exits → no orphans

**Error Path:**
- Spawn child → parent crashes (uncaughtException) → cleanup handler kills child → verify child terminated

**Signal Path:**
- Spawn child → parent receives SIGTERM → cleanup handler kills child with SIGTERM → verify child terminated
- Spawn child → parent receives SIGINT (Ctrl+C) → cleanup handler kills child → verify child terminated

**Timeout Path:**
- Spawn child → cleanup handler sends SIGTERM → child doesn't exit in 5s → cleanup sends SIGKILL → verify child force-killed

**Stress Test:**
- Spawn 10 children → parent exits → verify all 10 children terminated → run 10 times sequentially → verify 0 orphans total

## Additional Context

### Relevant Patterns

**Existing timeout kill pattern (should be preserved):**
\`\`\`typescript
const timeoutId = setTimeout(() => {
  killed = true;
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 5000);
}, timeout);
\`\`\`

**This pattern is good and should be kept** - it's the *missing* cleanup on normal exit that's the problem.

### Potential Risks

1. **Race condition:** Child exits naturally before cleanup handler runs
   - **Mitigation:** ProcessManager should handle already-dead processes gracefully (ignore ESRCH errors from kill)

2. **SIGKILL may not be instant:** Process in uninterruptible I/O
   - **Mitigation:** Log warning if kill fails, but don't block indefinitely

3. **Windows compatibility:** SIGTERM not supported on Windows
   - **Mitigation:** Use `process.kill(pid, 'SIGTERM')` which Node.js

## Implementation Plan

# Implementation Plan: Orphaned Process Cleanup

## Overview

This plan implements a centralized process tracking and cleanup system to prevent orphaned vitest/node processes when ai-sdlc agents complete or fail. The solution uses a singleton `ProcessManager` to track all spawned child processes and ensures they are terminated on parent exit via signal handlers.

**Key Approach:**
- Create centralized `ProcessManager` singleton for process tracking
- Register all spawned children with the manager
- Install global signal handlers (`SIGTERM`, `SIGINT`, `exit`) to cleanup tracked processes
- Use graceful shutdown pattern: SIGTERM first, SIGKILL after 5s timeout
- Ensure cross-platform compatibility (macOS, Linux, Windows)

---

## Phase 1: Core Infrastructure

### Create ProcessManager Module

- [ ] **T1**: Create `src/core/process-manager.ts` with ProcessManager singleton class
  - Files: `src/core/process-manager.ts`
  - Dependencies: none
  - Implementation details:
    - Export `ProcessManager` class with private constructor (singleton pattern)
    - Maintain private `Set<ChildProcess>` to track active children
    - Implement `getInstance()` static method
    - Implement `registerChild(child: ChildProcess): void` method
    - Implement `killAll(signal?: NodeJS.Signals): void` method with:
      - Default signal: `SIGTERM`
      - Iterate tracked children and call `child.kill(signal)`
      - Handle `ESRCH` errors gracefully (process already dead)
      - Remove dead processes from registry
    - Implement `killAllWithTimeout(gracefulTimeout: number): Promise<void>` method:
      - Send `SIGTERM` to all children
      - Wait `gracefulTimeout` ms
      - Send `SIGKILL` to any remaining children
      - Clean up registry

- [ ] **T2**: Create unit tests for ProcessManager
  - Files: `src/core/process-manager.test.ts`
  - Dependencies: T1
  - Test cases:
    - `registerChild()` adds child to internal registry
    - `killAll()` calls `.kill()` on all tracked children with correct signal
    - `killAll()` handles already-dead processes (ESRCH) without throwing
    - `killAll()` removes dead processes from registry
    - `killAllWithTimeout()` escalates from SIGTERM to SIGKILL after timeout
    - Singleton pattern: `getInstance()` returns same instance
    - Multiple `registerChild()` calls track all children uniquely

---

## Phase 2: Integrate ProcessManager into Agents

### Update Implementation Agent

- [ ] **T3**: Register spawned test processes in `src/agents/implementation.ts`
  - Files: `src/agents/implementation.ts`
  - Dependencies: T1
  - Changes:
    - Import `ProcessManager` from `../core/process-manager`
    - In `runSingleTest()` after `spawn()` call (~line 112), add: `ProcessManager.getInstance().registerChild(child)`
    - In `runAllTests()` after `spawn()` call (~line 168), add: `ProcessManager.getInstance().registerChild(child)`

- [ ] **T4**: Add test verification for process registration in implementation agent
  - Files: `src/agents/implementation.test.ts`
  - Dependencies: T3
  - Changes:
    - Mock `ProcessManager.getInstance().registerChild()`
    - Test that `runSingleTest()` registers spawned child
    - Test that `runAllTests()` registers spawned child

### Update Verification Agent

- [ ] **T5**: Register spawned command processes in `src/agents/verification.ts`
  - Files: `src/agents/verification.ts`
  - Dependencies: T1
  - Changes:
    - Import `ProcessManager` from `../core/process-manager`
    - In `runCommandAsync()` after `spawn()` call (~line 102), add: `ProcessManager.getInstance().registerChild(child)`

- [ ] **T6**: Add test verification for process registration in verification agent
  - Files: `src/agents/verification.test.ts`
  - Dependencies: T5
  - Changes:
    - Mock `ProcessManager.getInstance().registerChild()`
    - Test that `runCommandAsync()` registers spawned child

### Update Review Agent

- [ ] **T7**: Register spawned command processes in `src/agents/review.ts`
  - Files: `src/agents/review.ts`
  - Dependencies: T1
  - Changes:
    - Import `ProcessManager` from `../core/process-manager`
    - In `runCommandAsync()` after `spawn()` call (~line 222), add: `ProcessManager.getInstance().registerChild(child)`

- [ ] **T8**: Add test verification for process registration in review agent
  - Files: `src/agents/review.test.ts`
  - Dependencies: T7
  - Changes:
    - Mock `ProcessManager.getInstance().registerChild()`
    - Test that `runCommandAsync()` registers spawned child

---

## Phase 3: Global Cleanup Handlers

### Install Signal Handlers in Main Entry Point

- [ ] **T9**: Add global process cleanup handlers in `src/index.ts`
  - Files: `src/index.ts`
  - Dependencies: T1
  - Changes (before `program.parse()` at line ~278):
    ```typescript
    // Setup global cleanup handlers for child processes
    const processManager = ProcessManager.getInstance();
    
    process.on('exit', () => {
      processManager.killAll('SIGKILL'); // Force kill on final exit
    });
    
    process.on('SIGTERM', () => {
      processManager.killAll('SIGTERM');
      setTimeout(() => {
        processManager.killAll('SIGKILL');
        process.exit(0);
      }, 5000);
    });
    
    process.on('SIGINT', () => {
      processManager.killAll('SIGTERM');
      setTimeout(() => {
        processManager.killAll('SIGKILL');
        process.exit(0);
      }, 5000);
    });
    
    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
      processManager.killAll('SIGKILL');
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      processManager.killAll('SIGKILL');
      process.exit(1);
    });
    ```

### Install Signal Handlers in Daemon Mode

- [ ] **T10**: Add process cleanup to daemon shutdown handler in `src/cli/daemon.ts`
  - Files: `src/cli/daemon.ts`
  - Dependencies: T1
  - Changes:
    - Import `ProcessManager` from `../core/process-manager`
    - In `handleShutdown()` method (~line 442), before `process.exit()` calls, add:
      ```typescript
      ProcessManager.getInstance().killAll('SIGTERM');
      // Give children 2 seconds to exit gracefully before daemon exits
      await new Promise(resolve => setTimeout(resolve, 2000));
      ProcessManager.getInstance().killAll('SIGKILL');
      ```

---

## Phase 4: Integration Testing

### Create Process Cleanup Integration Tests

- [ ] **T11**: Create integration test for process cleanup on normal exit
  - Files: `tests/integration/process-cleanup.test.ts`
  - Dependencies: T1, T3, T5, T7, T9
  - Test scenario:
    - Spawn long-running child process (e.g., `sleep 30`)
    - Register with ProcessManager
    - Trigger cleanup via `killAll()`
    - Verify child process terminated (use `process.kill(pid, 0)` to check existence)
    - Expect no error (process should be dead)

- [ ] **T12**: Create integration test for process cleanup on SIGTERM
  - Files: `tests/integration/process-cleanup.test.ts`
  - Dependencies: T11
  - Test scenario:
    - Spawn long-running child
    - Register with ProcessManager
    - Send SIGTERM to parent process (simulate via handler call)
    - Verify child receives SIGTERM and exits
    - Verify cleanup completes within timeout

- [ ] **T13**: Create integration test for process cleanup on SIGINT
  - Files: `tests/integration/process-cleanup.test.ts`
  - Dependencies: T11
  - Test scenario:
    - Spawn long-running child
    - Register with ProcessManager
    - Send SIGINT to parent (simulate Ctrl+C)
    - Verify child terminated
    - Verify cleanup completes

- [ ] **T14**: Create integration test for graceful → force kill timeout
  - Files: `tests/integration/process-cleanup.test.ts`
  - Dependencies: T11
  - Test scenario:
    - Spawn child that ignores SIGTERM (e.g., custom script with signal handler)
    - Call `killAllWithTimeout(1000)` with 1s timeout
    - Verify SIGTERM sent first
    - Verify SIGKILL sent after timeout
    - Verify child eventually terminated

---

## Phase 5: Stress Testing & Verification

### Stress Test for Orphaned Processes

- [ ] **T15**: Create stress test for 10 sequential agent runs
  - Files: `tests/integration/stress-orphaned-processes.test.ts`
  - Dependencies: T1, T9, T10
  - Test scenario:
    - Run 10 sequential test agent invocations (spawn → register → cleanup)
    - After each run, verify no orphaned processes (`pgrep -f vitest` returns empty)
    - Verify process count returns to baseline (1 node process: ai-sdlc itself)
    - Use `ps` or platform-specific process listing to count node/vitest processes
    - Assert: orphaned process count === 0 after all 10 runs

### Build and Test Verification

- [ ] **T16**: Run full test suite and verify all tests pass
  - Files: N/A (verification step)
  - Dependencies: T2, T4, T6, T8, T11, T12, T13, T14, T15
  - Command: `npm test`
  - Expected: All tests pass (0 failures)
  - If failures occur: debug and fix before proceeding

- [ ] **T17**: Run TypeScript build and verify compilation succeeds
  - Files: N/A (verification step)
  - Dependencies: T1, T3, T5, T7, T9, T10
  - Command: `npm run build`
  - Expected: Build succeeds with no TypeScript errors
  - If failures occur: fix type errors before proceeding

- [ ] **T18**: Run `make verify` and ensure all checks pass
  - Files: N/A (verification step)
  - Dependencies: T16, T17
  - Command: `make verify`
  - Expected: Linting, formatting, tests, and build all pass
  - If failures occur: fix issues before proceeding

---

## Phase 6: Manual Verification & Documentation

### Manual Orphaned Process Verification

- [ ] **T19**: Manual test - verify no orphaned processes after single agent run
  - Files: N/A (manual verification)
  - Dependencies: T18
  - Steps:
    1. Note baseline process count: `ps aux | grep -E 'node|vitest' | wc -l`
    2. Run `npm run ai-sdlc -- implement S-XXXX` (any story)
    3. Let agent complete or interrupt with Ctrl+C
    4. Check process count: `ps aux | grep -E 'node|vitest' | wc -l`
    5. Verify: process count returned to baseline (no vitest workers remain)
    6. Run `pgrep -f vitest` - should return empty

- [ ] **T20**: Manual test - verify cleanup on abnormal termination
  - Files: N/A (manual verification)
  - Dependencies: T19
  - Steps:
    1. Start agent run that spawns tests
    2. Kill parent process abruptly: `kill -9 <ai-sdlc-pid>`
    3. Check for orphaned vitest processes: `pgrep -f vitest`
    4. Expected: cleanup handler may not run on SIGKILL, but this is acceptable (SIGKILL is non-catchable)
    5. Verify: graceful signals (SIGTERM, SIGINT) DO trigger cleanup (tested in T12, T13)

- [ ] **T21**: Update story status with implementation results
  - Files: `.ai-sdlc/stories/S-0060-orphaned-vitest-processes-cleanup.md`
  - Dependencies: T19, T20
  - Changes:
    - Mark implementation as complete
    - Document test results (pass/fail counts)
    - Document manual verification results
    - List any known limitations or edge cases discovered

---

## Acceptance Criteria Verification Checklist

After completing all phases, verify these acceptance criteria are met:

### Process Cleanup (Core)
- [ ] All child processes terminated when parent agent completes successfully
- [ ] All child processes terminated when parent agent fails or is interrupted
- [ ] Cleanup occurs for both SIGTERM and SIGINT signals
- [ ] Cleanup occurs for uncaught exceptions and unhandled rejections
- [ ] Orphaned processes do not persist after agent exit (verified via `pgrep -f vitest`)

### Signal Handling
- [ ] SIGTERM/SIGINT signals propagate to all child processes
- [ ] Graceful shutdown attempted before force-kill (5 second timeout)
- [ ] Process tracking via ProcessManager singleton implemented

### Verification & Testing
- [ ] Unit tests verify process tracking and cleanup logic (T2)
- [ ] Integration tests spawn child process and verify cleanup on exit (T11-T14)
- [ ] Stress test: 10 sequential agent runs produce 0 orphaned processes (T15)
- [ ] Memory and CPU usage returns to baseline after agent completion (manual T19)
- [ ] `make verify` passes (T18)

### Code Quality
- [ ] Process spawning code follows DRY principle (centralized in ProcessManager)
- [ ] Signal handlers don't interfere with existing error handling
- [ ] Cleanup is idempotent (safe to call multiple times)

---

## Notes

**Implementation order:** Tasks must be completed in dependency order. The critical path is:
1. T1 (ProcessManager) must be completed first
2. T2-T8 can be done in parallel after T1
3. T9-T10 can be done in parallel after T1
4. T11-T14 depend on T1, T3, T5, T7, T9
5. T15 depends on all previous integration work
6. T16-T18 are verification steps
7. T19-T21 are final manual verification and documentation

**Time estimate:** Medium effort (~4-6 hours total)
- Phase 1: 2 hours (core ProcessManager + tests)
- Phase 2: 1.5 hours (integrate into 3 agents + update tests)
- Phase 3: 0.5 hours (signal handlers)
- Phase 4: 1.5 hours (integration tests)
- Phase 5: 0.5 hours (stress test + verification)
- Phase 6: 0.5 hours (manual verification + documentation)

**Risk mitigation:**
- Test early and often (unit tests in Phase 1 before integration)
- Integration tests (Phase 4) will catch issues with signal propagation
- Stress test (Phase 5) will catch edge cases and race conditions
- Manual verification (Phase 6) provides final confidence before marking complete


### Implementation Notes (2026-01-19)

I need permission to read these files. Let me wait for approval and then begin the implementation.
