---
id: S-0026
title: Implementation agent should retry on test failures
priority: 2
status: backlog
type: feature
created: '2026-01-13'
labels:
  - p0-critical
  - reliability
  - agent-improvement
  - auto-workflow
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: implementation-retry-on-test-failures
---

# Implementation agent should retry on test failures

## User Story

**As a** user running the auto workflow
**I want** the implementation agent to automatically retry when tests fail
**So that** minor issues are fixed automatically without requiring manual intervention or workflow restarts

## Problem Context

Currently, when the implementation agent produces code that fails tests, it immediately returns an error:

```typescript
// src/agents/implementation.ts:821-828
if (!verification.passed) {
  return {
    success: false,
    story: parseStory(currentStoryPath),
    changesMade,
    error: `Implementation blocked: ${verification.failures} test(s) failing. Fix tests before completing.`,
  };
}
```

This means a single test failure stops the entire workflow, even though the agent could likely fix the issue if given the test output and another attempt.

**Current flow:**
```
implement → verify → FAIL → stop (no retry)
```

**Desired flow:**
```
implement → verify → FAIL → feed errors to agent → retry → verify → repeat until pass or max retries
```

The existing `rework` mechanism only triggers after a **review rejection** (post-implementation). It doesn't help when tests fail *during* implementation.

## Acceptance Criteria

### Core Functionality (P0)
- [ ] When verification fails, implementation agent feeds test output back to the LLM with instructions to fix
- [ ] Agent retries implementation up to `max_implementation_retries` times (configurable, default 3)
- [ ] Each retry includes the full test failure output in the prompt context
- [ ] Retry prompt clearly instructs agent to analyze failures and make targeted fixes
- [ ] Only returns failure after exhausting all retry attempts
- [ ] `make verify` passes with all new code changes

### Observability (P1)
- [ ] Each retry attempt is logged with attempt number (e.g., "Implementation retry 2/3")
- [ ] Story frontmatter tracks `implementation_retry_count` for current attempt
- [ ] Final error message includes summary of all retry attempts if all fail
- [ ] Progress callback receives retry status updates

### Configuration (P1)
- [ ] `max_implementation_retries` configurable in `.ai-sdlc/config.yaml`
- [ ] Default value is 3 retries
- [ ] Can be overridden per-story via `frontmatter.max_implementation_retries`

### Edge Cases
- [ ] If first attempt passes, no retry logic is triggered (fast path)
- [ ] If agent makes no changes between retries, fail early (avoid infinite loop)
- [ ] Timeout per retry attempt is respected (use existing `testTimeout` config)
- [ ] TDD mode also gets retry capability (same pattern in TDD violation handlers)

## Technical Approach

### Location
`src/agents/implementation.ts` - modify `runImplementationAgent()` and potentially `runTDDImplementation()`

### Implementation Pattern

```typescript
// After running implementation and getting verification failure:
let retryCount = 0;
const maxRetries = story.frontmatter.max_implementation_retries ?? config.implementation?.maxRetries ?? 3;

while (!verification.passed && retryCount < maxRetries) {
  retryCount++;
  changesMade.push(`Implementation retry ${retryCount}/${maxRetries}`);

  const retryPrompt = `The implementation has test failures that need to be fixed.

Test output:
${verification.output}

${verification.failures} test(s) failing.

Please analyze the test failures and fix the implementation. Focus on:
1. Reading the actual vs expected values in assertions
2. Understanding what the test is checking
3. Making targeted fixes to the production code (not the tests)

Do NOT give up. Fix the issues now.`;

  await runAgentQuery({
    prompt: retryPrompt,
    systemPrompt: IMPLEMENTATION_SYSTEM_PROMPT,
    workingDirectory: workingDir,
    onProgress: options.onProgress,
  });

  // Re-run verification
  verification = await verifyImplementation(updatedStory, workingDir);
}
```

### Config Schema Update

```yaml
# .ai-sdlc/config.yaml
implementation:
  maxRetries: 3  # default
```

## Testing Strategy

### Unit Tests
- Mock `runAgentQuery` and `verifyImplementation`
- Test retry loop executes correct number of times
- Test retry prompt includes test output
- Test fast path when first attempt passes
- Test early exit when no changes detected

### Integration Tests
- Test with real agent that produces fixable test failures
- Verify retry count is tracked in story frontmatter

## Out of Scope
- Retry logic for review failures (already handled by rework agent)
- Automatic rollback of changes on final failure
- Different retry strategies (exponential backoff, etc.)

## Dependencies
- Requires `verifyImplementation` to return test output (currently only returns pass/fail and count)

## Risks
- **Token cost**: Each retry consumes additional API tokens
- **Mitigation**: Cap retries at reasonable default (3), make configurable
- **Infinite loops**: Agent might make same mistake repeatedly
- **Mitigation**: Detect no-change scenarios and fail early
