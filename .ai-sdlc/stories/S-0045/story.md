---
id: S-0045
title: Single-Task Implementation Agent
priority: 75
status: backlog
type: feature
created: '2026-01-16'
labels:
  - implementation
  - orchestration
  - agent
estimated_effort: medium
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: single-task-implementation-agent
---
# Single-Task Implementation Agent

## User Story

**As a** developer using ai-sdlc,
**I want** an implementation agent that focuses on a single task with minimal context,
**So that** each task gets a fresh context window, preventing quality degradation from context exhaustion.

## Summary

Create a specialized agent function that implements ONE task from an implementation plan. This agent receives only the minimal context needed (task description, relevant acceptance criteria, affected files) rather than the entire story history. This is the core building block for the orchestrator pattern.

## Context

The current `runImplementationAgent()` handles the entire implementation phase in one agent session. As implementation progresses:
- Context window fills with code, errors, retries
- Quality degrades as the window approaches limits
- A failure in one area pollutes context for unrelated tasks

The single-task agent pattern:
- Fresh context for each task
- Focused prompt with only relevant information
- Structured result for orchestrator evaluation

This proves the hypothesis: **smaller, focused agents produce better results than one large agent session.**

## Acceptance Criteria

- [ ] Create `runSingleTaskAgent(task, context): AgentTaskResult` function
- [ ] Agent receives minimal context: task description, relevant AC, target files
- [ ] Agent does NOT receive: full story history, previous task results, unrelated code
- [ ] Result structure includes: success/failure, files changed, error message (if failed)
- [ ] Agent runs verification (build/lint/test) scoped to changed files
- [ ] Function can be called standalone (testable without orchestrator)
- [ ] Add unit tests mocking agent execution
- [ ] Add integration test executing a real single-task implementation
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Function Signature

```typescript
interface TaskContext {
  task: ImplementationTask;
  acceptanceCriteria: string[];  // Only AC relevant to this task
  existingFiles: FileContent[];  // Current content of files to modify
  projectPatterns: string;       // Brief summary of project conventions
}

interface AgentTaskResult {
  success: boolean;
  task: ImplementationTask;
  filesChanged: string[];
  verificationPassed: boolean;
  error?: string;
  agentOutput?: string;  // Full output for debugging
}

async function runSingleTaskAgent(
  context: TaskContext,
  options?: { dryRun?: boolean; timeout?: number }
): Promise<AgentTaskResult>
```

### Minimal Context Strategy

The prompt to the agent should include:
1. **Task**: The specific task description and ID
2. **Files**: Only the files listed in the task's `files` field
3. **AC**: Only acceptance criteria that mention files in this task
4. **Patterns**: A brief (500 token max) summary of project conventions

The prompt should NOT include:
- Full story content
- Previous task outputs
- Unrelated code files
- Research documents
- Planning rationale

### File Location

Create in `src/agents/single-task.ts`:
- `runSingleTaskAgent()` - main function
- `buildTaskPrompt()` - constructs minimal prompt
- `parseTaskResult()` - extracts result from agent output

### Verification Scope

After agent completes:
1. Run TypeScript check only on changed files
2. Run linter only on changed files
3. Run tests that import changed files (if detectable)
4. Report pass/fail with specific errors

### Integration with Existing Code

This function wraps `runAgentQuery()` from `src/core/client.ts` but:
- Constructs a focused, minimal prompt
- Parses output into structured result
- Handles verification inline

## Edge Cases

1. **Task requires file not in list**: Agent should report missing file, not create it arbitrarily
2. **Agent exceeds scope**: Result should flag if agent modified files outside task scope
3. **Verification fails**: Return failure with specific error, don't retry (orchestrator decides)
4. **Agent times out**: Return failure with timeout error

## Definition of Done

- [ ] `runSingleTaskAgent()` implemented and exported
- [ ] Minimal context strategy documented and followed
- [ ] Unit tests cover: success, failure, timeout, scope violation
- [ ] Integration test proves fresh context produces quality output
- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)

---

**Effort:** medium
**Dependencies:** S-0044 (Structured Task Format)
**Blocks:** S-0047 (Sequential Task Orchestrator)
