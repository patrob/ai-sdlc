---
id: S-0044
title: Structured Task Format for Implementation Plans
priority: 80
status: backlog
type: feature
created: '2026-01-16'
labels:
  - implementation
  - orchestration
  - foundation
estimated_effort: small
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: structured-task-format-for-implementation-plans
---
# Structured Task Format for Implementation Plans

## User Story

**As a** developer using ai-sdlc,
**I want** implementation plans to use a machine-parseable task format,
**So that** tasks can be extracted programmatically for orchestration and progress tracking.

## Summary

Define and implement a structured format for tasks within implementation plans. This enables automated task extraction, which is foundational for the implementation orchestrator pattern where each task runs in a fresh agent context.

## Context

Currently, implementation plans may use free-form markdown (bullets, numbered lists, etc.). To support task-level orchestration, we need:
1. A consistent, parseable task format
2. A parser to extract tasks from plans
3. Validation that plans contain properly formatted tasks

This is the foundation for the implementation orchestrator feature set.

## Acceptance Criteria

- [ ] Define task format specification (markdown checkboxes with structured content)
- [ ] Create `parseImplementationTasks(planContent: string): Task[]` function
- [ ] Task structure includes: id, description, status, dependencies (optional)
- [ ] Parser handles malformed/missing task sections gracefully
- [ ] Update plan agent prompt to output tasks in the structured format
- [ ] Add unit tests for task parsing (valid plans, edge cases, malformed input)
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Proposed Task Format

Tasks in implementation plans should use this format:

```markdown
## Implementation Tasks

- [ ] **T1**: Create user authentication service
  - Files: `src/services/auth.ts`, `src/types/auth.ts`
  - Dependencies: none

- [ ] **T2**: Add JWT token validation middleware
  - Files: `src/middleware/auth.ts`
  - Dependencies: T1

- [ ] **T3**: Implement login endpoint
  - Files: `src/routes/auth.ts`
  - Dependencies: T1, T2
```

### Task Interface

```typescript
interface ImplementationTask {
  id: string;           // e.g., "T1"
  description: string;  // e.g., "Create user authentication service"
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  files?: string[];     // Files to create/modify
  dependencies?: string[]; // Task IDs this depends on
}
```

### Parser Location

Create in `src/core/task-parser.ts` with:
- `parseImplementationTasks(content: string): ImplementationTask[]`
- `formatImplementationTasks(tasks: ImplementationTask[]): string`
- `validateTaskFormat(content: string): ValidationResult`

### Plan Agent Prompt Update

Add to the planning agent's system prompt:
```
Output implementation tasks using this format:
- [ ] **T{n}**: {task description}
  - Files: {comma-separated file paths}
  - Dependencies: {comma-separated task IDs or "none"}
```

## Edge Cases

1. **No tasks section**: Return empty array, log warning
2. **Malformed task**: Skip with warning, continue parsing
3. **Circular dependencies**: Detect and report as validation error
4. **Missing dependency reference**: Report as validation warning

## Definition of Done

- [ ] Task format specification documented
- [ ] Parser implementation with full test coverage
- [ ] Plan agent prompt updated to use format
- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)

---

**Effort:** small
**Dependencies:** None
**Blocks:** S-0045, S-0046, S-0047
