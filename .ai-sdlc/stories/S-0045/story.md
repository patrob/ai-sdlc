---
id: S-0045
title: Single-Task Implementation Agent
priority: 75
status: in-progress
type: feature
created: '2026-01-16'
labels:
  - implementation
  - orchestration
  - agent
  - s
estimated_effort: medium
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
slug: single-task-implementation-agent
worktree_path: >-
  /Users/probinson/Repos/on-par/pocs/ai-sdlc/.ai-sdlc/worktrees/S-0045-single-task-implementation-agent
updated: '2026-01-16'
branch: ai-sdlc/single-task-implementation-agent
last_test_run:
  passed: true
  failures: 0
  timestamp: '2026-01-16T20:55:24.755Z'
implementation_retry_count: 0
---
# Single-Task Implementation Agent

## User Story

**As a** developer using ai-sdlc,
**I want** an agent that executes a single implementation task with minimal, focused context,
**So that** each task benefits from a fresh context window and avoids quality degradation from context pollution.

## Summary

Implement a specialized agent function that executes ONE task from an implementation plan. This agent receives only the essential context (task description, relevant acceptance criteria, target files) without the full story history, research notes, or unrelated code. This is the foundational building block for the orchestrator pattern that will manage multi-task implementations.

## Problem Context

The current `runImplementationAgent()` handles entire implementations in a single agent session, leading to:
- **Context exhaustion**: Window fills with code diffs, error logs, retry attempts
- **Quality degradation**: Agent performance drops as token limit approaches
- **Error propagation**: Failures in one task pollute the context for subsequent unrelated tasks
- **No recovery**: Single failure can derail the entire implementation

## Solution Approach

The single-task agent pattern provides:
- **Fresh context per task**: Each task starts with a clean slate
- **Focused attention**: Agent sees only what's relevant to the current task
- **Structured results**: Orchestrator can evaluate success/failure and decide next steps
- **Isolation**: Failures don't contaminate other tasks

This validates the hypothesis: **focused agents with minimal context produce higher quality results than monolithic sessions.**

## Acceptance Criteria

### Core Functionality
- [ ] Implement `runSingleTaskAgent(context, options): AgentTaskResult` in `src/agents/single-task.ts`
- [ ] Agent prompt includes ONLY: task description, task ID, relevant AC, target file contents, project conventions summary (<500 tokens)
- [ ] Agent prompt excludes: full story content, research documents, planning rationale, previous task results, unrelated files
- [ ] Function returns structured result: `{ success, task, filesChanged, verificationPassed, error?, agentOutput? }`
- [ ] Implement `buildTaskPrompt()` helper that constructs minimal context prompt
- [ ] Implement `parseTaskResult()` helper that extracts structured output from agent response

### Verification
- [ ] Run TypeScript type checking scoped to changed files only
- [ ] Run ESLint scoped to changed files only
- [ ] Run tests for files that import changed modules (if detectable via static analysis)
- [ ] Capture and return specific verification errors in result structure

### Scope Control
- [ ] Detect if agent modified files outside the task's declared `files` array
- [ ] Return scope violation warning in result if extra files modified
- [ ] If task requires undeclared file, agent should report missing dependency (not create arbitrary files)

### Integration
- [ ] Function can be invoked standalone (testable without orchestrator)
- [ ] Wraps existing `runAgentQuery()` from `src/core/client.ts`
- [ ] Supports `dryRun` option (logs prompt, skips execution)
- [ ] Supports `timeout` option (defaults to reasonable limit, e.g., 5 minutes)

### Testing
- [ ] Unit tests (mock `runAgentQuery`):
  - Successful task execution
  - Task failure with error message
  - Agent timeout handling
  - Scope violation detection
  - Verification failure handling
- [ ] Integration test (real agent execution):
  - Execute simple task (e.g., add new function to existing file)
  - Verify fresh context produces quality output
  - Verify structured result parsing
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Specification

### Type Definitions

```typescript
interface TaskContext {
  task: ImplementationTask;           // Task to execute
  acceptanceCriteria: string[];       // Only AC mentioning task files
  existingFiles: FileContent[];       // Current content of target files
  projectPatterns: string;            // Brief conventions summary (max 500 tokens)
}

interface FileContent {
  path: string;
  content: string;
}

interface AgentTaskResult {
  success: boolean;                   // Overall success/failure
  task: ImplementationTask;           // Task that was executed
  filesChanged: string[];             // Files modified by agent
  verificationPassed: boolean;        // Build/lint/test results
  error?: string;                     // Error message if failed
  agentOutput?: string;               // Raw agent output for debugging
  scopeViolation?: string[];          // Files modified outside declared scope
}

interface SingleTaskAgentOptions {
  dryRun?: boolean;                   // Log prompt without execution
  timeout?: number;                   // Max execution time (ms)
}
```

### Implementation Structure

**File:** `src/agents/single-task.ts`

```typescript
export async function runSingleTaskAgent(
  context: TaskContext,
  options?: SingleTaskAgentOptions
): Promise<AgentTaskResult>

export function buildTaskPrompt(context: TaskContext): string
export function parseTaskResult(
  output: string,
  task: ImplementationTask
): AgentTaskResult
```

### Prompt Construction Strategy

The `buildTaskPrompt()` function should generate a focused prompt:

```
# Implementation Task

Task ID: {task.id}
Description: {task.description}

## Target Files
{existingFiles.map(f => `### ${f.path}\n${f.content}`)}

## Acceptance Criteria
{acceptanceCriteria.map(ac => `- ${ac}`)}

## Project Conventions
{projectPatterns}

## Instructions
1. Implement the task by modifying ONLY the files listed above
2. Follow the project conventions strictly
3. Ensure your changes satisfy the relevant acceptance criteria
4. Do not create new files unless explicitly listed in the task
5. Report if you need additional files not provided

## Output Format
Provide a summary of changes made and list all files modified.
```

### Verification Logic

```typescript
async function verifyChanges(filesChanged: string[]): Promise<{
  passed: boolean;
  errors: string[];
}> {
  // 1. Run tsc on changed files + their importers
  // 2. Run eslint on changed files
  // 3. Run tests for changed files (if detectable)
  // 4. Return aggregate result
}
```

### Scope Violation Detection

```typescript
function detectScopeViolation(
  declaredFiles: string[],
  actualFiles: string[]
): string[] | undefined {
  const violations = actualFiles.filter(f => !declaredFiles.includes(f));
  return violations.length > 0 ? violations : undefined;
}
```

## Edge Cases and Constraints

### Edge Case: Missing Required File
- **Scenario**: Task requires a file not in `context.existingFiles`
- **Behavior**: Agent should report "Missing file: X" in output, return `success: false`
- **Orchestrator action**: Can add file to context and retry

### Edge Case: Scope Violation
- **Scenario**: Agent modifies files outside task's declared `files` array
- **Behavior**: Return `success: true` but include `scopeViolation: [...]` in result
- **Orchestrator action**: Can warn, accept, or reject based on policy

### Edge Case: Verification Failure
- **Scenario**: Changes break build/lint/tests
- **Behavior**: Return `verificationPassed: false`, include specific errors
- **Orchestrator action**: Decide whether to retry, revert, or escalate

### Edge Case: Agent Timeout
- **Scenario**: Agent exceeds timeout limit
- **Behavior**: Return `success: false, error: "Agent execution timeout"`
- **Orchestrator action**: Can retry with extended timeout or skip task

### Constraint: No Orchestrator Logic
This function executes ONE task. It does NOT:
- Decide which task to run next
- Retry on failure
- Coordinate multiple tasks
- Handle dependencies between tasks

### Constraint: No Side Effects on Failure
If verification fails, this function does NOT:
- Revert changes automatically
- Modify the task or story state
- Attempt recovery

The orchestrator (S-0047) handles all multi-task coordination logic.

## Dependencies

- **S-0044**: Structured Task Format (provides `ImplementationTask` type)

## Implementation Checklist

- [ ] Create `src/agents/single-task.ts`
- [ ] Define types: `TaskContext`, `AgentTaskResult`, `SingleTaskAgentOptions`, `FileContent`
- [ ] Implement `buildTaskPrompt(context)` - minimal context construction
- [ ] Implement `parseTaskResult(output, task)` - structured result parsing
- [ ] Implement `verifyChanges(files)` - scoped verification
- [ ] Implement `detectScopeViolation(declared, actual)` - scope checking
- [ ] Implement `runSingleTaskAgent(context, options)` - main function
- [ ] Write unit tests in `src/agents/single-task.test.ts`
- [ ] Write integration test in `tests/integration/single-task-agent.test.ts`
- [ ] Run `npm test` - verify all tests pass
- [ ] Run `npm run build` - verify TypeScript compilation
- [ ] Run `make verify` - verify all checks pass
- [ ] Update exports in `src/agents/index.ts` (if needed)

## Definition of Done

- All acceptance criteria checkboxes are checked
- All implementation checklist items are completed
- Unit tests cover: success, failure, timeout, scope violation, verification failure
- Integration test demonstrates real agent execution with fresh context
- `npm test` shows 0 test failures
- `npm run build` succeeds with no errors
- `make verify` succeeds
- Code follows DRY and SOLID principles
- No temporary files created in project root

---

**effort**: medium

**labels**: agent, implementation, orchestration, core-feature, context-management

## Research

Perfect! Now I have enough context to provide comprehensive research findings. Let me compile the research.

---

## Research Findings

### Problem Summary

The task is to create a **single-task implementation agent** that executes one implementation task in isolation with minimal context. This is a foundational component for the larger orchestration pattern (S-0047) that will enable:
- Fresh context per task (prevents context pollution)
- Quality preservation (avoids degradation from token limit approach)
- Structured verification per task
- Intelligent retry/recovery capabilities

The agent receives only essential inputs (task description, relevant AC, target files, conventions) and returns a structured result indicating success/failure, files changed, and verification status.

---

### Codebase Context

#### 1. **Existing Agent Architecture** (`src/agents/`)
The codebase has well-established agent patterns:
- **`src/agents/implementation.ts`**: Current monolithic implementation agent that runs entire plans in one session (lines 935-1144). This is what we're improving upon.
- **`src/agents/research.ts`**: Research agent with structured prompt and system message pattern (lines 1-80). Shows how to use `RESEARCH_SYSTEM_PROMPT` constant.
- **`src/core/client.ts`**: Core `runAgentQuery()` function (lines 86-254) that wraps the Claude Agent SDK with timeout, progress callbacks, and error handling.

**Pattern to Follow:**
\`\`\`typescript
// Define system prompt constant
export const TASK_AGENT_SYSTEM_PROMPT = `...instructions...`;

// Main agent function signature
export async function runSingleTaskAgent(
  context: TaskContext,
  options?: SingleTaskAgentOptions
): Promise<AgentTaskResult> {
  // Call runAgentQuery with structured prompt
  const result = await runAgentQuery({
    prompt: buildTaskPrompt(context),
    systemPrompt: TASK_AGENT_SYSTEM_PROMPT,
    workingDirectory: context.workingDirectory,
    timeout: options?.timeout,
    onProgress: options?.onProgress,
  });
  
  return parseTaskResult(result, context.task);
}
\`\`\`

#### 2. **Task Data Structures** (`src/types/index.ts`, `src/core/task-parser.ts`)
- **`ImplementationTask`** interface (lines 157-168 in types/index.ts): Already defines task structure with `id`, `description`, `status`, `files`, `dependencies`.
- **Task parsing** (`src/core/task-parser.ts`): Functions `parseImplementationTasks()` (lines 24-115) and `formatImplementationTasks()` (lines 133-160) handle conversion between markdown and structured format.

These are the building blocks we'll use for the task context.

#### 3. **Verification Infrastructure** (`src/agents/verification.ts`)
- **`verifyImplementation()`** function (lines 164-236): Runs tests and build commands with configurable options.
- Returns `VerificationResult` with `passed`, `failures`, `timestamp`, test/build output.
- Already has dependency installation logic (`ensureDependenciesInstalled()`, lines 37-87).

**Pattern to Reuse:** We'll call `verifyImplementation()` scoped to changed files for task-level verification.

#### 4. **Configuration & Timeouts** (`src/core/config.ts`)
- Default timeout: `agentTimeout: 600000` (10 minutes) in `DEFAULT_TIMEOUTS` (lines 10-14)
- Test timeout: `testTimeout: 300000` (5 minutes)
- Build timeout: `buildTimeout: 120000` (2 minutes)
- Config loaded via `loadConfig(workingDir)` which respects `.ai-sdlc.json` overrides

**Pattern to Reuse:** Use `options.timeout ?? config.timeouts.agentTimeout` for default timeout handling.

#### 5. **Retry & Error Handling Patterns** (`src/agents/implementation.ts`)
- **`attemptImplementationWithRetries()`** (lines 722-928): Complex retry loop with no-change detection using git diff hashing.
- **`captureCurrentDiffHash()`** (lines 1181-1204): Uses `spawnSync('git', ['diff', 'HEAD'])` + SHA256 hash for no-change detection.
- **`buildRetryPrompt()`** (lines 1312-1374): Builds context-aware prompts for retries including test failures.
- **Missing dependency detection** (lines 1265-1302): Extracts package names from error messages.

**Patterns to Adapt:** The single-task agent should use simpler verification (no retry loop - that's the orchestrator's job), but can reuse the diff hash pattern for detecting scope violations.

---

### Files Requiring Changes

#### **Primary Implementation File**

**Path:** `src/agents/single-task.ts` (CREATE NEW)
- **Change Type:** Create New
- **Reason:** Main implementation of single-task agent
- **Specific Changes:**
  - Define `TaskContext`, `AgentTaskResult`, `SingleTaskAgentOptions`, `FileContent` interfaces
  - Implement `buildTaskPrompt(context): string` - constructs minimal prompt
  - Implement `parseTaskResult(output, task): AgentTaskResult` - extracts structured result
  - Implement `verifyChanges(files): { passed: boolean; errors: string[] }` - scoped verification
  - Implement `detectScopeViolation(declared, actual): string[] | undefined` - checks file modifications
  - Implement main `runSingleTaskAgent(context, options): Promise<AgentTaskResult>`
  - Export `TASK_AGENT_SYSTEM_PROMPT` constant with focused instructions
- **Dependencies:** None (foundational)

#### **Type Definitions**

**Path:** `src/types/index.ts` (MODIFY EXISTING)
- **Change Type:** Modify Existing (add new exports)
- **Reason:** Add new interfaces for single-task agent
- **Specific Changes:**
  - Add `TaskContext` interface (not currently defined, needed for agent input)
  - Add `FileContent` interface (simple `{ path: string; content: string }`)
  - Add `AgentTaskResult` interface (agent output structure)
  - Add `SingleTaskAgentOptions` interface (options like dryRun, timeout)
  - Keep existing `ImplementationTask` (already defined at lines 157-168)
- **Dependencies:** None

#### **Agent Index/Exports**

**Path:** `src/agents/index.ts` (MODIFY EXISTING)
- **Change Type:** Modify Existing
- **Reason:** Export new single-task agent functions
- **Specific Changes:**
  - Add: `export { runSingleTaskAgent, buildTaskPrompt, parseTaskResult } from './single-task.js';`
- **Dependencies:** Requires `src/agents/single-task.ts` to exist

#### **Unit Tests**

**Path:** `src/agents/single-task.test.ts` (CREATE NEW)
- **Change Type:** Create New
- **Reason:** Unit tests for single-task agent logic
- **Specific Changes:**
  - Mock `runAgentQuery` from `src/core/client.js`
  - Test `buildTaskPrompt()`: verify minimal context (excludes irrelevant data)
  - Test `parseTaskResult()`: verify structured output parsing
  - Test `detectScopeViolation()`: verify file scope checking
  - Test `runSingleTaskAgent()`: successful execution, failure handling, timeout
  - Test verification failure scenarios
  - Use `vi.mock()` pattern as seen in `src/agents/implementation.test.ts` (lines 26-42)
- **Dependencies:** Requires `src/agents/single-task.ts` to exist

#### **Integration Tests**

**Path:** `tests/integration/single-task-agent.test.ts` (CREATE NEW)
- **Change Type:** Create New
- **Reason:** Integration test with real agent execution
- **Specific Changes:**
  - Test end-to-end execution with a simple task (e.g., "add console.log to existing function")
  - Verify fresh context produces quality output
  - Verify structured result parsing
  - Use temporary directory setup pattern from `tests/integration/implementation-retry.test.ts` (lines 40-97)
  - Mock git operations using `spawnSync` mock pattern (lines 23-54)
- **Dependencies:** Requires `src/agents/single-task.ts` to exist

---

### Testing Strategy

#### **Test Files to Modify**
None - all existing tests should remain unmodified and passing.

#### **New Tests Needed**

**Unit Tests** (`src/agents/single-task.test.ts`):
1. **`buildTaskPrompt()` Tests:**
   - Includes task ID, description, target files content
   - Includes only relevant acceptance criteria (filtering by file mention)
   - Includes project conventions summary
   - Excludes full story content, research notes, unrelated files
   - Prompt length stays under reasonable limit (~2000 tokens)

2. **`parseTaskResult()` Tests:**
   - Extracts success/failure from agent output
   - Extracts files changed list
   - Handles malformed output gracefully
   - Returns appropriate error messages

3. **`detectScopeViolation()` Tests:**
   - Returns undefined when all files in scope
   - Returns violation list when extra files modified
   - Handles empty arrays

4. **`verifyChanges()` Tests:**
   - Runs TypeScript check on changed files
   - Runs ESLint on changed files
   - Detects test failures
   - Aggregates errors correctly

5. **`runSingleTaskAgent()` Tests:**
   - Successful task execution returns `success: true`
   - Failed verification returns `success: false` with error
   - Timeout handling returns appropriate error
   - Scope violation detected and included in result
   - DryRun mode logs prompt without execution

**Integration Tests** (`tests/integration/single-task-agent.test.ts`):
1. **End-to-End Execution:**
   - Create temp project with simple TypeScript file
   - Define task: "Add a new exported function `greet(name: string): string`"
   - Run single-task agent with real `runAgentQuery` (or mocked for speed)
   - Verify: function added, file modified, verification passed
   - Assert: `AgentTaskResult.success === true`

2. **Fresh Context Validation:**
   - Verify prompt does not include unrelated story sections
   - Check prompt token count is minimal (<2000 tokens for typical task)

#### **Test Scenarios**

**Happy Path:**
- Task with 1 file, no dependencies
- Task with multiple files
- Task with explicit dependency list

**Edge Cases:**
- Task requires file not in `existingFiles` → agent reports missing file → `success: false`
- Agent modifies extra files → `scopeViolation` populated, `success: true` (orchestrator decides policy)
- Verification fails (tests break) → `verificationPassed: false`, specific errors included
- Agent times out → `success: false, error: "Agent execution timeout"`

**Error Handling:**
- Invalid working directory → erro

## Implementation Plan

# Implementation Plan: Single-Task Implementation Agent (S-0045)

## Overview

This plan implements a focused, single-task execution agent that operates with minimal context. The agent executes one implementation task in isolation, returns structured results, and serves as the foundation for the orchestrator pattern (S-0047).

---

## Phase 1: Type Definitions and Interfaces

**Goal:** Establish type-safe contracts for the single-task agent

- [ ] **T1**: Define core interfaces in `src/types/index.ts`
  - Files: `src/types/index.ts`
  - Dependencies: none
  - Add `FileContent` interface (`{ path: string; content: string }`)
  - Add `TaskContext` interface (task, acceptanceCriteria, existingFiles, projectPatterns, workingDirectory)
  - Add `AgentTaskResult` interface (success, task, filesChanged, verificationPassed, error?, agentOutput?, scopeViolation?)
  - Add `SingleTaskAgentOptions` interface (dryRun?, timeout?, onProgress?)

- [ ] **T2**: Verify type definitions compile
  - Files: `src/types/index.ts`
  - Dependencies: T1
  - Run `npm run build` to ensure no TypeScript errors
  - Verify all new interfaces are properly exported

---

## Phase 2: Core Agent Implementation

**Goal:** Implement the main agent function and helper utilities

- [ ] **T3**: Create agent module skeleton
  - Files: `src/agents/single-task.ts`
  - Dependencies: T1, T2
  - Create file with imports for required types and utilities
  - Define `TASK_AGENT_SYSTEM_PROMPT` constant with focused instructions
  - Add function stubs for `buildTaskPrompt`, `parseTaskResult`, `verifyChanges`, `detectScopeViolation`, `runSingleTaskAgent`

- [ ] **T4**: Implement `buildTaskPrompt()` helper
  - Files: `src/agents/single-task.ts`
  - Dependencies: T3
  - Construct minimal prompt with: task ID, description, target files, relevant AC, conventions
  - Exclude: full story, research notes, unrelated files
  - Keep prompt under ~2000 tokens for typical tasks
  - Export function for testing

- [ ] **T5**: Implement `detectScopeViolation()` helper
  - Files: `src/agents/single-task.ts`
  - Dependencies: T3
  - Compare declared files vs. actually modified files (using git diff)
  - Return `string[]` of violations or `undefined` if clean
  - Handle empty arrays gracefully

- [ ] **T6**: Implement `verifyChanges()` helper
  - Files: `src/agents/single-task.ts`
  - Dependencies: T3
  - Run TypeScript type checking on changed files (use `tsc --noEmit`)
  - Run ESLint on changed files (use `npx eslint <files>`)
  - Aggregate results into `{ passed: boolean; errors: string[] }`
  - Return specific error messages for debugging

- [ ] **T7**: Implement `parseTaskResult()` helper
  - Files: `src/agents/single-task.ts`
  - Dependencies: T3, T5, T6
  - Extract structured result from agent output string
  - Detect files changed using git diff
  - Call `detectScopeViolation()` to check for violations
  - Call `verifyChanges()` to run checks
  - Build and return `AgentTaskResult` object

- [ ] **T8**: Implement main `runSingleTaskAgent()` function
  - Files: `src/agents/single-task.ts`
  - Dependencies: T4, T7
  - Handle `dryRun` option (log prompt, skip execution)
  - Handle `timeout` option (default to config value or 5 minutes)
  - Call `runAgentQuery()` with constructed prompt
  - Parse result using `parseTaskResult()`
  - Handle errors and timeouts gracefully

- [ ] **T9**: Update agent exports
  - Files: `src/agents/index.ts`
  - Dependencies: T8
  - Export `runSingleTaskAgent`, `buildTaskPrompt`, `parseTaskResult` from `./single-task.js`

---

## Phase 3: Unit Tests

**Goal:** Test all helper functions and main agent logic in isolation

- [ ] **T10**: Create unit test file skeleton
  - Files: `src/agents/single-task.test.ts`
  - Dependencies: T9
  - Set up vitest imports and mocks
  - Mock `runAgentQuery` from `src/core/client.js`
  - Mock `spawnSync` for git operations
  - Create test fixtures (sample tasks, file contents, AC)

- [ ] **T11**: Write tests for `buildTaskPrompt()`
  - Files: `src/agents/single-task.test.ts`
  - Dependencies: T10
  - Test: Includes task ID and description
  - Test: Includes target files content
  - Test: Includes only relevant acceptance criteria
  - Test: Includes project conventions
  - Test: Excludes full story content and research notes
  - Test: Prompt length is reasonable (<2000 tokens for typical task)

- [ ] **T12**: Write tests for `detectScopeViolation()`
  - Files: `src/agents/single-task.test.ts`
  - Dependencies: T10
  - Test: Returns `undefined` when all files in scope
  - Test: Returns violation list when extra files modified
  - Test: Handles empty arrays correctly

- [ ] **T13**: Write tests for `verifyChanges()`
  - Files: `src/agents/single-task.test.ts`
  - Dependencies: T10
  - Test: Runs TypeScript check and captures errors
  - Test: Runs ESLint and captures errors
  - Test: Returns `passed: true` when all checks pass
  - Test: Returns `passed: false` with errors when checks fail
  - Test: Aggregates multiple errors correctly

- [ ] **T14**: Write tests for `parseTaskResult()`
  - Files: `src/agents/single-task.test.ts`
  - Dependencies: T10
  - Test: Extracts success/failure from agent output
  - Test: Extracts files changed list
  - Test: Detects scope violations
  - Test: Includes verification results
  - Test: Handles malformed output gracefully

- [ ] **T15**: Write tests for `runSingleTaskAgent()`
  - Files: `src/agents/single-task.test.ts`
  - Dependencies: T10
  - Test: Successful task execution returns `success: true`
  - Test: Failed verification returns `success: false` with error
  - Test: Timeout handling returns appropriate error
  - Test: Scope violation detected and included in result
  - Test: DryRun mode logs prompt without execution
  - Test: Custom timeout option is respected

- [ ] **T16**: Run unit tests and fix failures
  - Files: `src/agents/single-task.test.ts`, `src/agents/single-task.ts`
  - Dependencies: T11, T12, T13, T14, T15
  - Run `npm test -- single-task.test.ts`
  - Analyze failures and fix implementation bugs
  - Iterate until all unit tests pass

---

## Phase 4: Integration Tests

**Goal:** Test end-to-end agent execution with realistic scenarios

- [ ] **T17**: Create integration test file skeleton
  - Files: `tests/integration/single-task-agent.test.ts`
  - Dependencies: T9
  - Set up temporary directory with sample TypeScript project
  - Create fixtures: simple TS file, task definition, acceptance criteria
  - Mock git operations using `spawnSync` pattern

- [ ] **T18**: Write end-to-end execution test
  - Files: `tests/integration/single-task-agent.test.ts`
  - Dependencies: T17
  - Test: Create temp project with simple TypeScript file
  - Test: Define task "Add exported function `greet(name: string): string`"
  - Test: Run `runSingleTaskAgent()` with real or mocked agent
  - Test: Verify function added, file modified, verification passed
  - Test: Assert `AgentTaskResult.success === true`

- [ ] **T19**: Write fresh context validation test
  - Files: `tests/integration/single-task-agent.test.ts`
  - Dependencies: T17
  - Test: Verify prompt excludes unrelated story sections
  - Test: Check prompt token count is minimal (<2000 tokens)
  - Test: Confirm only declared files included in context

- [ ] **T20**: Write edge case tests
  - Files: `tests/integration/single-task-agent.test.ts`
  - Dependencies: T17
  - Test: Task requires missing file → agent reports error → `success: false`
  - Test: Agent modifies extra files → `scopeViolation` populated
  - Test: Verification fails → `verificationPassed: false` with errors
  - Test: Agent timeout → `success: false` with timeout error

- [ ] **T21**: Run integration tests and fix failures
  - Files: `tests/integration/single-task-agent.test.ts`, `src/agents/single-task.ts`
  - Dependencies: T18, T19, T20
  - Run `npm test -- integration/single-task-agent.test.ts`
  - Analyze failures and fix implementation or test setup
  - Iterate until all integration tests pass

---

## Phase 5: Verification and Cleanup

**Goal:** Ensure all tests pass, code quality standards met, no regressions

- [ ] **T22**: Run full test suite
  - Files: all test files
  - Dependencies: T16, T21
  - Run `npm test` (all tests, not just new ones)
  - Verify 0 test failures
  - Confirm no regressions in existing tests

- [ ] **T23**: Run TypeScript compilation
  - Files: all TypeScript files
  - Dependencies: T22
  - Run `npm run build`
  - Verify no compilation errors
  - Check for type safety violations

- [ ] **T24**: Run linting and formatting
  - Files: all modified/new files
  - Dependencies: T23
  - Run `npm run lint`
  - Fix any linting errors
  - Run `npm run format` if available

- [ ] **T25**: Run `make verify`
  - Files: entire project
  - Dependencies: T24
  - Execute `make verify` command
  - Ensure all checks pass (tests, build, lint)
  - Fix any failures immediately

- [ ] **T26**: Verify file hygiene
  - Files: project root and all directories
  - Dependencies: T25
  - Confirm no temporary files created (`verify-*.md`, `IMPLEMENTATION_SUMMARY.md`, test scripts)
  - Ensure only expected new files exist: `src/agents/single-task.ts`, `src/agents/single-task.test.ts`, `tests/integration/single-task-agent.test.ts`
  - Verify exports in `src/agents/index.ts` are correct

- [ ] **T27**: Manual smoke test (optional)
  - Files: none (manual verification)
  - Dependencies: T26
  - Optionally run single-task agent with `dryRun: true` to inspect prompt
  - Verify prompt structure matches specification
  - Confirm minimal context approach

---

## Phase 6: Documentation and Definition of Done

**Goal:** Complete all acceptance criteria and finalize implementation

- [ ] **T28**: Verify all acceptance criteria met
  - Files: story file
  - Dependencies: T27
  - Review each AC checkbox in story
  - Confirm implementation satisfies each requirement
  - Update story status to reflect completion

- [ ] **T29**: Final verification checklist
  - Files: none (verification step)
  - Dependencies: T28
  - ✓ `npm test` passes with 0 failures
  - ✓ `npm run build` succeeds
  - ✓ `make verify` succeeds
  - ✓ All acceptance criteria checked
  - ✓ No temporary files in project root
  - ✓ Code follows DRY and SOLID principles
  - ✓ Unit and integration tests written
  - ✓ New exports added to `src/agents/index.ts`

---

## Success Metrics

- **Test Coverage:** All new functions have unit tests (buildTaskPrompt, parseTaskResult, verifyChanges, detectScopeViolation, runSingleTaskAgent)
- **Integration Validation:** At least one end-to-end test demonstrates real agent execution with minimal context
- **Zero Regressions:** All existing tests continue to pass
- **Build Success:** TypeScript compilation succeeds without errors
- **Verification Pass:** `make verify` completes successfully

---

## Dependencies and Blockers

- **S-0044 (Structured Task Format):** Required for `ImplementationTask` type - **RESOLVED** (already implemented in codebase)
- **Claude Agent SDK:** Required for `runAgentQuery()` - **AVAILABLE** (already in use)
- **Git:** Required for scope violation detection - **AVAILABLE** (project uses git)

No blockers identified. All dependencies are satisfied.

---

## Estimated Effort

**Medium** - approximately 4-6 focused hours:
- Type definitions: 30 minutes
- Core implementation: 2 hours
- Unit tests: 1.5 hours
- Integration tests: 1 hour
- Verification and cleanup: 1 hour

---

## Notes

- This is a foundational component for S-0047 (orchestrator pattern)
- The agent deliberately does NOT handle retries, multi-task coordination, or dependency resolution - those are orchestrator responsibilities
- Focus on clean interfaces and structured results to enable intelligent orchestration
- The "fresh context per task" hypothesis will be validated through integration tests


### Implementation Notes (2026-01-16)

The code looks good. Now let me try to understand what permission I need. Let me just try a direct request to the user:

I've completed the implementation of the Single-Task Implementation Agent! Here's what was done:

## Implementation Summary

### Phase 1: Type Definitions ✅
- Added `FileContent`, `TaskContext`, `SingleTaskAgentOptions`, and `AgentTaskResult` interfaces to `src/types/index.ts`

### Phase 2: Core Implementation ✅
- Created `src/agents/single-task.ts` with:
  - `TASK_AGENT_SYSTEM_PROMPT` - focused instructions without full story context
  - `buildTaskPrompt()` - constructs minimal context prompt
  - `detectScopeViolation()` - checks if agent modified files outside scope
  - `verifyChanges()` - runs TypeScript and ESLint on changed files
  - `parseTaskResult()` - extracts structured result from agent output
  - `runSingleTaskAgent()` - main agent execution function
- Updated `src/agents/index.ts` to export new functions

### Phase 3: Unit Tests ✅
- Created `src/agents/single-task.test.ts` with comprehensive tests:
  - Tests for `buildTaskPrompt()` - verifies minimal context, exclusion of unrelated info
  - Tests for `detectScopeViolation()` - various file scope scenarios
  - Tests for `verifyChanges()` - TypeScript/ESLint error handling
  - Tests for `parseTaskResult()` - git diff parsing, scope violations, verification
  - Tests for `runSingleTaskAgent()` - success, failure, timeout, dryRun, options

### Phase 4: Integration Tests ✅
- Created `tests/integration/single-task-agent.test.ts` with:
  - End-to-end task execution tests
  - Scope violation detection
  - Verification failure handling
  - Prompt construction validation
  - Error handling scenarios
  - Options handling (dryRun, timeout)

## Ready for Verification

Now I need to run the verification suite. Could you please approve running these commands:

1. `npm run lint` - Check TypeScript compilation
2. `npm test` - Run all unit tests
3. `make verify` - Full verification (lint + build + test + integration tests)

This will ensure all tests pass and the implementation is complete!
