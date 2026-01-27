---
*Generated: 2026-01-27*

Perfect! Now I have enough context. Let me create a comprehensive implementation plan for the Multi-Process Orchestrator story.

# Implementation Plan: Multi-Process Orchestrator (S-0038)

## Overview

This plan breaks down the implementation of a multi-process orchestrator that enables concurrent story execution. The orchestrator spawns isolated child processes, enforces concurrency limits, manages IPC communication, and ensures graceful shutdown.

---

## Phase 1: Type Definitions & Setup

### Prerequisites
- [ ] **T1**: Verify p-queue dependency exists in package.json
  - Files: `package.json`
  - Dependencies: none
  - Action: Check current version, add if missing

### Type Definitions
- [ ] **T2**: Add IPC message types to `src/types/index.ts`
  - Files: `src/types/index.ts`
  - Dependencies: T1
  - Add: `IPCMessageType`, `IPCMessage`, `IPCStatusUpdate`, `IPCHealthCheck`, `IPCErrorReport`

- [ ] **T3**: Add orchestrator configuration types to `src/types/index.ts`
  - Files: `src/types/index.ts`
  - Dependencies: T2
  - Add: `OrchestratorOptions`, `ExecutionResult`, `ChildProcessInfo`

- [ ] **T4**: Add orchestrator types to `src/types/index.ts`
  - Files: `src/types/index.ts`
  - Dependencies: T3
  - Add: `OrchestratorState`, `ProcessStatus`

---

## Phase 2: Agent Executor (Child Process Entry Point)

### Child Process Implementation
- [ ] **T5**: Create `src/core/agent-executor.ts` skeleton
  - Files: `src/core/agent-executor.ts`
  - Dependencies: T4
  - Implement: Basic process entry point with IPC setup

- [ ] **T6**: Add story loading from process arguments in agent-executor
  - Files: `src/core/agent-executor.ts`
  - Dependencies: T5
  - Parse: `AI_SDLC_STORY_ID` env var and argv story ID

- [ ] **T7**: Add IPC communication handlers in agent-executor
  - Files: `src/core/agent-executor.ts`
  - Dependencies: T6
  - Handle: Health checks, status updates, error reporting

- [ ] **T8**: Integrate existing run logic into agent-executor
  - Files: `src/core/agent-executor.ts`, `src/cli/commands.ts`
  - Dependencies: T7
  - Reuse: Existing single-story execution from `commands.ts`

- [ ] **T9**: Add graceful shutdown handler in agent-executor
  - Files: `src/core/agent-executor.ts`
  - Dependencies: T8
  - Handle: SIGTERM signal, cleanup worktree state

---

## Phase 3: Orchestrator Core

### Orchestrator Class Implementation
- [ ] **T10**: Create `src/core/orchestrator.ts` with Orchestrator class skeleton
  - Files: `src/core/orchestrator.ts`
  - Dependencies: T9
  - Define: Class structure, constructor, private fields

- [ ] **T11**: Implement process spawning in Orchestrator
  - Files: `src/core/orchestrator.ts`
  - Dependencies: T10
  - Use: `child_process.fork()` with cwd set to worktree path

- [ ] **T12**: Add p-queue integration for concurrency limiting
  - Files: `src/core/orchestrator.ts`
  - Dependencies: T11
  - Implement: Queue with configurable concurrency limit

- [ ] **T13**: Implement IPC channel setup for child processes
  - Files: `src/core/orchestrator.ts`
  - Dependencies: T12
  - Setup: Bidirectional IPC, message handlers

- [ ] **T14**: Add child process tracking and monitoring
  - Files: `src/core/orchestrator.ts`
  - Dependencies: T13
  - Track: PIDs, status, exit codes, errors

- [ ] **T15**: Implement error isolation (child crash doesn't affect parent)
  - Files: `src/core/orchestrator.ts`
  - Dependencies: T14
  - Handle: Child exit events, log errors, continue with siblings

- [ ] **T16**: Add graceful shutdown logic to Orchestrator
  - Files: `src/core/orchestrator.ts`
  - Dependencies: T15
  - Implement: SIGTERM to children, 10s wait, SIGKILL fallback

- [ ] **T17**: Implement cleanup handlers (prevent zombie processes)
  - Files: `src/core/orchestrator.ts`
  - Dependencies: T16
  - Register: Process exit handlers, cleanup all children

- [ ] **T18**: Add worktree creation failure handling
  - Files: `src/core/orchestrator.ts`
  - Dependencies: T17
  - Handle: Skip story on worktree error, continue with queue

---

## Phase 4: CLI Integration

### CLI Flag & Query Logic
- [ ] **T19**: Add `--concurrent` flag to CLI parser in `src/index.ts`
  - Files: `src/index.ts`
  - Dependencies: T18
  - Add: Flag definition, validation, help text

- [ ] **T20**: Add input validation for `--concurrent` flag
  - Files: `src/index.ts`
  - Dependencies: T19
  - Validate: Positive integer, default to 1, warn on 0/negative

- [ ] **T21**: Implement ready story query in `src/cli/commands.ts`
  - Files: `src/cli/commands.ts`, `src/core/kanban.ts`
  - Dependencies: T20
  - Query: Database for stories with status='ready', sort by priority

- [ ] **T22**: Add concurrent mode detection in run command
  - Files: `src/cli/commands.ts`
  - Dependencies: T21
  - Branch: If `--concurrent > 1`, use orchestrator; else single-story mode

- [ ] **T23**: Wire orchestrator into run command
  - Files: `src/cli/commands.ts`
  - Dependencies: T22
  - Instantiate: Orchestrator with stories, call execute()

- [ ] **T24**: Preserve backward compatibility for single-story execution
  - Files: `src/cli/commands.ts`
  - Dependencies: T23
  - Ensure: Default behavior unchanged when flag not used

---

## Phase 5: Testing

### Unit Tests
- [ ] **T25**: Write unit tests for agent-executor IPC handlers
  - Files: `src/core/agent-executor.test.ts`
  - Dependencies: T24
  - Test: Message parsing, health checks, error reporting

- [ ] **T26**: Write unit tests for Orchestrator process spawning
  - Files: `src/core/orchestrator.test.ts`
  - Dependencies: T25
  - Test: Fork called with correct args, cwd set to worktree

- [ ] **T27**: Write unit tests for concurrency limiting
  - Files: `src/core/orchestrator.test.ts`
  - Dependencies: T26
  - Test: Queue enforces max concurrent, excess stories queued

- [ ] **T28**: Write unit tests for error isolation
  - Files: `src/core/orchestrator.test.ts`
  - Dependencies: T27
  - Test: Child crash doesn't crash parent, siblings continue

- [ ] **T29**: Write unit tests for graceful shutdown
  - Files: `src/core/orchestrator.test.ts`
  - Dependencies: T28
  - Test: SIGTERM sent, 10s timeout, SIGKILL fallback

### Integration Tests
- [ ] **T30**: Write integration test for 3 concurrent mock executions
  - Files: `tests/integration/orchestrator.test.ts`
  - Dependencies: T29
  - Test: Spawn 3 agents, verify all complete successfully

- [ ] **T31**: Write integration test for child crash scenario
  - Files: `tests/integration/orchestrator.test.ts`
  - Dependencies: T30
  - Test: Kill one child, verify parent continues, siblings unaffected

- [ ] **T32**: Write integration test for graceful shutdown
  - Files: `tests/integration/orchestrator.test.ts`
  - Dependencies: T31
  - Test: Send SIGINT mid-execution, verify children terminated

- [ ] **T33**: Write integration test for worktree creation failure
  - Files: `tests/integration/orchestrator.test.ts`
  - Dependencies: T32
  - Test: Mock worktree error, verify story skipped, queue continues

---

## Phase 6: Edge Case Handling

### Error Scenarios
- [ ] **T34**: Handle `--concurrent` exceeds available ready stories
  - Files: `src/core/orchestrator.ts`
  - Dependencies: T33
  - Behavior: Only spawn processes for available stories

- [ ] **T35**: Handle all children crash simultaneously
  - Files: `src/core/orchestrator.ts`
  - Dependencies: T34
  - Behavior: Report aggregate failure, cleanup, exit with error code

- [ ] **T36**: Handle parent receives SIGINT during execution
  - Files: `src/core/orchestrator.ts`
  - Dependencies: T35
  - Behavior: Cancel queued stories, SIGTERM running children

- [ ] **T37**: Add logging for orchestrator lifecycle events
  - Files: `src/core/orchestrator.ts`
  - Dependencies: T36
  - Log: Process spawn, exit, errors, shutdown

---

## Phase 7: Verification & Documentation

### Build & Test Verification
- [ ] **T38**: Run full test suite (`npm test`)
  - Files: none
  - Dependencies: T37
  - Verify: All tests pass, no regressions

- [ ] **T39**: Run TypeScript compilation (`npm run build`)
  - Files: none
  - Dependencies: T38
  - Verify: No type errors, clean build

- [ ] **T40**: Run `make verify`
  - Files: none
  - Dependencies: T39
  - Verify: Linting, type checking, tests, build all pass

### Manual Testing
- [ ] **T41**: Manual test: Run 3 concurrent stories with `--concurrent 3`
  - Files: none
  - Dependencies: T40
  - Verify: Isolation, correct worktrees, all complete

- [ ] **T42**: Manual test: Send SIGINT mid-execution
  - Files: none
  - Dependencies: T41
  - Verify: Graceful shutdown, no zombie processes

- [ ] **T43**: Manual test: Verify backward compatibility (no `--concurrent`)
  - Files: none
  - Dependencies: T42
  - Verify: Single-story mode works as before

### Documentation
- [ ] **T44**: Update CLI help text for `--concurrent` flag
  - Files: `src/index.ts`
  - Dependencies: T43
  - Add: Flag description, default value, examples

- [ ] **T45**: Update story document status to `done`
  - Files: `.ai-sdlc/worktrees/S-0038-multi-process-orchestrator/.ai-sdlc/stories/S-0038/story.md`
  - Dependencies: T44
  - Update: Frontmatter status, completion checkboxes

---

## Summary

**Total Tasks**: 45
**Estimated Effort**: Large
**Key Dependencies**: 
- S-0035 (CLI Enhancements) ✓
- S-0036 (Worktree Service) ✓
- S-0037 (Git Worktree Safety) ✓

**Critical Path**:
1. Type definitions (T1-T4)
2. Agent executor (T5-T9)
3. Orchestrator core (T10-T18)
4. CLI integration (T19-T24)
5. Testing (T25-T33)
6. Edge cases (T34-T37)
7. Verification (T38-T45)

**Risk Mitigation**:
- Start with types and agent executor (can be tested in isolation)
- Implement orchestrator with mock children before full integration
- Extensive testing for error isolation and shutdown scenarios
- Preserve backward compatibility at every step