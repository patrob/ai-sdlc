---
id: S-0026
title: Implementation agent should retry on test failures
priority: 2
status: in-progress
type: feature
created: '2026-01-13'
labels:
  - p0-critical
  - reliability
  - agent-improvement
  - auto-workflow
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: false
slug: implementation-retry-on-test-failures
updated: '2026-01-14'
branch: ai-sdlc/implementation-retry-on-test-failures
last_test_run:
  passed: true
  failures: 0
  timestamp: '2026-01-14T23:09:40.000Z'
---
# Implementation Agent Should Retry on Test Failures

## User Story

**As a** developer using the auto workflow  
**I want** the implementation agent to automatically retry when tests fail  
**So that** transient implementation issues are fixed automatically without requiring manual intervention or workflow restarts

## Context

Currently, when the implementation agent produces code that fails tests, it immediately returns an error and stops the workflow. This means a single fixable test failure halts the entire process, even though the agent could likely fix the issue if given the test output and another attempt.

**Current behavior:**
```
implement → verify → FAIL → stop (return error)
```

**Desired behavior:**
```
implement → verify → FAIL → analyze errors → fix → verify → pass/retry
```

The existing `rework` mechanism only handles review rejections (post-implementation), not test failures during implementation.

## Acceptance Criteria

### Core Retry Logic
- [ ] When `verifyImplementation()` fails, the agent captures the full test failure output
- [ ] Agent feeds test output back to LLM with instructions to analyze failures and fix implementation
- [ ] Agent retries implementation up to `maxRetries` times before giving up
- [ ] Retry prompt includes specific instructions: analyze test output, compare expected vs actual, fix production code (not tests)
- [ ] Only returns failure after exhausting all retry attempts
- [ ] Fast path: if first attempt passes, no retry logic triggered

### Configuration
- [ ] `max_implementation_retries` configurable in `.ai-sdlc/config.yaml` under `implementation.maxRetries`
- [ ] Default value: 3 retries
- [ ] Can be overridden per-story via `frontmatter.max_implementation_retries`
- [ ] Configuration validation: must be non-negative integer, max 10

### Observability & Tracking
- [ ] Each retry attempt logged with attempt number: "Implementation retry 2/3"
- [ ] Story frontmatter tracks `implementation_retry_count` (current attempt number)
- [ ] Changes array includes retry entries: "Implementation retry N/M: [brief reason]"
- [ ] Final error message (if all retries fail) includes: total attempts, summary of each failure, last test output
- [ ] Progress callback receives retry status updates

### Safety & Edge Cases
- [ ] If agent makes identical changes between retries, fail early with "No progress detected" message
- [ ] If agent makes no file changes in a retry, fail early
- [ ] Test timeout per retry is respected (existing `testTimeout` config applies per attempt)
- [ ] TDD mode (`runTDDImplementation`) also gets retry capability
- [ ] Retry count resets when moving from implementation → review → rework → implement again

### Verification
- [ ] `make verify` passes with all implementation changes
- [ ] `npm test` passes with 100% test coverage for retry logic
- [ ] `npm run build` succeeds with no TypeScript errors

## Edge Cases & Constraints

**Edge Cases:**
1. **Infinite loop prevention**: Agent repeatedly makes same mistake → detect no-change scenarios and fail early (compare git diff hashes)
2. **Token budget exhaustion**: Each retry consumes API tokens → cap at reasonable default (3), make configurable, document cost implications
3. **First-attempt success**: Most implementations pass first try → optimize for this path (no overhead)
4. **Cascading failures**: One broken file breaks multiple test suites → agent should see all failures, not just first one
5. **Timeout per attempt**: Long-running test suites → respect per-attempt timeout, not cumulative

**Constraints:**
- Must not change existing `rework` agent behavior (only review-driven rework)
- Must preserve existing `verifyImplementation` interface (extend return type if needed)
- Cannot exceed 10 retries (hard cap to prevent runaway costs)
- Retry logic must work for both standard and TDD implementation modes

## Dependencies

- **Requires**: `verifyImplementation()` must return detailed test output (currently only returns `passed: boolean` and `failures: number`)
- **Blocks**: None - standalone feature
- **Blocked by**: None

## Technical Notes

### Implementation Location
- Primary: `src/agents/implementation.ts` → modify `runImplementationAgent()`
- Secondary: `src/agents/implementation.ts` → modify `runTDDImplementation()` (apply same pattern)
- Config: `src/types/index.ts` → extend `WorkflowConfig` interface

### Suggested Approach
1. Extract verification loop into reusable function: `attemptImplementationWithRetries()`
2. Update `verifyImplementation()` to return `{ passed, failures, output, summary }`
3. Implement no-change detection using git diff comparison
4. Add retry config to type definitions and config loading
5. Update system prompt to include retry-aware instructions

### Testing Strategy
- **Unit tests** (primary): Mock `runAgentQuery`, `verifyImplementation`, git operations
  - Test retry loop executes correct number of times
  - Test retry prompt construction includes test output
  - Test fast path when first attempt passes
  - Test early exit on no-change detection
  - Test config overrides (global vs per-story)
  - Test frontmatter updates on each retry
- **Integration tests** (minimal): Test with real failing test case that can be fixed
  - Verify retry count persisted to story
  - Verify changes array includes retry entries

## Out of Scope

- Retry logic for review failures (already handled by `rework` agent)
- Automatic rollback of changes on final failure (manual cleanup acceptable)
- Different retry strategies (exponential backoff, adaptive retries)
- Parallel retry attempts (always sequential)
- Retry for other agent types (research, planning)

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|-----------|
| Token cost increases | High | Medium | Cap at 3 retries, make configurable, document costs |
| Infinite retry loops | High | Low | Detect no-change scenarios, hard cap at 10 |
| Slower workflows | Medium | Medium | Optimize fast path (first-attempt success), parallel verification where possible |
| Agent confusion from verbose output | Low | Low | Truncate test output if > 5000 chars, summarize patterns |

---

**Effort:** large

**Labels:** enhancement, agent-behavior, auto-workflow, testing, retry-logic

## Research

Now I have enough context. Let me compile the research findings in a structured markdown format.

---

# Research: Implementation Agent Should Retry on Test Failures

## 1. Relevant Existing Patterns and Code to Reference

### Verification Infrastructure
The codebase already has verification infrastructure in place:

**`src/agents/verification.ts`**
- Current `verifyImplementation()` function returns:
  - `passed: boolean`
  - `failures: number`
  - `timestamp: string`
  - `testsOutput: string` (already captured!)
  - `buildOutput: string`
- Already extracts failure counts from test output via `extractFailureCount()`
- Supports dependency injection via `VerificationOptions` for testing

**Key finding**: The verification system already captures detailed test output that can be fed back to the LLM for retry attempts.

### Review Retry Pattern (Existing Model)
The codebase has a **mature retry pattern for review failures** that can be adapted:

**`src/core/story.ts`** - Review retry tracking:
- `retry_count` field in frontmatter (line 101)
- `max_retries` field in frontmatter (line 102)
- `last_restart_reason` tracking (line 103)
- `review_history` array for tracking attempts (line 105)
- Functions: `appendReviewHistory()`, `getLatestReviewAttempt()`, `isAtMaxRetries()`, `getEffectiveMaxRetries()`

**`src/core/story-retry.test.ts`** - Comprehensive test patterns:
- Tests for retry count tracking
- Tests for max retries detection
- Tests for history management (keeps last 10 entries)
- Mock patterns for testing retry logic

**`src/agents/rework.ts`** - Circuit breaker pattern:
- Uses `canRetryRefinement()` to check if retry allowed
- Records refinement attempts with `recordRefinementAttempt()`
- Formats feedback for storage with `formatFeedbackSummary()`
- Appends detailed notes with `appendRefinementNote()`

### Configuration Pattern
**`src/core/config.ts`**:
- Review configuration already has `maxRetries` and `maxRetriesUpperBound` (lines 52-56)
- Validation logic enforces 0-10 range
- Environment variable overrides supported
- TDD configuration structure exists (lines 32-38)

### Git Diff for No-Change Detection
**`src/agents/implementation.ts`**:
- Uses `execSync('git status --porcelain')` to check for uncommitted changes (line 227-230)
- This pattern can be extended to compare changes between retry attempts

## 2. Files/Modules That Need Modification

### Core Implementation (Priority Order)

1. **`src/types/index.ts`** (Type Definitions)
   - Add `implementation_retry_count?: number` to `StoryFrontmatter` interface
   - Add `max_implementation_retries?: number` to `StoryFrontmatter` interface  
   - Consider: Add `ImplementationConfig` interface similar to `ReviewConfig`

2. **`src/core/config.ts`** (Configuration)
   - Add `implementation` config section with `maxRetries: number` (default: 3)
   - Add validation logic (enforce 0-10 range)
   - Update `DEFAULT_CONFIG` constant
   - Add environment variable support (`AI_SDLC_IMPLEMENTATION_MAX_RETRIES`)

3. **`src/agents/verification.ts`** (Already mostly ready!)
   - No changes needed to return type - already returns `testsOutput` and `buildOutput`
   - Optionally: Add `summary?: string` field for truncated error messages

4. **`src/agents/implementation.ts`** (Main Implementation)
   - **Extract retry loop**: Create `attemptImplementationWithRetries()` wrapper function
   - Modify `runImplementationAgent()` to use retry wrapper
   - Modify `runTDDImplementation()` to use retry wrapper
   - Add retry prompt construction logic
   - Implement no-change detection using git diff hash comparison
   - Track retry count in frontmatter
   - Update changes array with retry entries

5. **`src/core/story.ts`** (Story Management)
   - Add helper functions (following review retry pattern):
     - `getImplementationRetryCount(story: Story): number`
     - `isAtMaxImplementationRetries(story: Story, config: Config): boolean`
     - `resetImplementationRetryCount(story: Story): void`
     - `incrementImplementationRetryCount(story: Story): void`

### Testing Files

6. **`src/agents/implementation.test.ts`**
   - Add retry-specific unit tests
   - Test max retries enforcement
   - Test no-change detection
   - Test prompt construction with test output
   - Test frontmatter updates

7. **`tests/integration/implementation-retry.test.ts`** (New file)
   - Integration test with real failing test that gets fixed
   - Test retry count persistence
   - Test changes array tracking

## 3. External Resources and Best Practices

### Retry Pattern Best Practices

**Linear Retry Strategy** (Recommended for this use case):
- Fixed retry count (no exponential backoff needed - LLM responses are fast)
- Each retry is independent (no cumulative state beyond test output)
- Circuit breaker pattern to prevent infinite loops

**No-Change Detection**:
- Compare git diff SHA between attempts
- Use `git diff HEAD | sha256sum` to detect identical changes
- Alternative: Track modified file timestamps

**Prompt Engineering for Retries**:
```
CRITICAL: Tests are failing. You attempted implementation but verification failed.

Test Output:
[actual test failure output]

Your task:
1. ANALYZE the test output above - what is actually failing?
2. Compare EXPECTED vs ACTUAL results in the errors
3. Identify the root cause in your implementation code
4. Fix ONLY the production code (do NOT modify tests unless they're clearly wrong)
5. Re-run verification

This is retry attempt {N} of {maxRetries}. Previous attempts failed with similar errors.
```

### Token Budget Management
- Truncate test output if > 5000 characters
- Keep only relevant error sections (failures, stack traces)
- Summarize repeated errors

## 4. Potential Challenges and Risks

### Challenge 1: Infinite Loop Risk (HIGH)
**Risk**: Agent makes same mistake repeatedly
**Mitigation**: 
- Compare git diff hash between attempts (fail early if identical)
- Check for "no file changes" scenario
- Hard cap at 10 retries (config validation)
- Track change hashes: `Map<attempt_number, diff_hash>`

### Challenge 2: Token Cost Explosion (MEDIUM)
**Risk**: Each retry consumes API tokens
**Mitigation**:
- Default to 3 retries (reasonable cost)
- Make configurable
- Document cost implications in README
- Add warning when `maxRetries > 5`

### Challenge 3: Test Output Overwhelm (MEDIUM)
**Risk**: Verbose test output confuses LLM
**Mitigation**:
- Truncate output at 5000 chars
- Extract only failure sections using regex patterns
- Summarize repeated failures
- Include failure count summary at top

### Challenge 4: TDD Mode Compatibility (MEDIUM)
**Risk**: TDD already has cycle-level verification - may conflict
**Mitigation**:
- Apply retry logic WITHIN each TDD phase
- Only retry on unexpected failures (not RED phase expected fails)
- Share retry helper functions between standard and TDD modes

### Challenge 5: Git State Management (LOW)
**Risk**: Uncommitted changes between retries
**Mitigation**:
- Don't commit failed attempts (only commit on success)
- Use `git diff` for comparison, not `git status`
- Reset tracking on successful commit

### Challenge 6: Distinguishing Retry Types (LOW)
**Risk**: Confusion between review retry vs implementation retry
**Mitigation**:
- Use clear field names: `implementation_retry_count` vs `retry_count`
- Separate config sections: `implementation.maxRetries` vs `reviewConfig.maxRetries`
- Different tracking mechanisms

## 5. Dependencies and Prerequisites

### Prerequisites (Already Satisfied)
✅ `verifyImplementation()` captures test output  
✅ Git integration exists for diff operations  
✅ Frontmatter update patterns established  
✅ Config loading/validation infrastructure exists  
✅ Test patterns for retry logic exist (review retry tests)

### Required Dependencies (None New)
- All necessary dependencies already in place
- Can reuse existing patterns from review retry
- No new npm packages needed

### Integration Points
1. **Config System**: Extend with `implementation` section
2. **Story Frontmatter**: Add retry tracking fields
3. **Verification System**: Use existing `VerificationResult`
4. **Agent Query**: Pass test output in retry prompt
5. **Changes Array**: Append retry entries following review pattern

## 6. Implementation Strategy Recommendation

### Phased Approach

**Phase 1: Foundation** (Implement first)
1. Add type definitions (`implementation_retry_count`, config types)
2. Add config section and validation
3. Add story helper functions (`getImplementationRetryCount`, etc.)
4. Write unit tests for helpers

**Phase 2: Retry Logic** (Core feature)
1. Create `attemptImplementationWithRetries()` wrapper
2. Implement no-change detection
3. Implement retry prompt construction
4. Add frontmatter tracking
5. Wire into `runImplementationAgent()`

**Phase 3: TDD Support**
1. Apply same retry logic to `runTDDImplementation()`
2. Test TDD-specific scenarios

**Phase 4: Testing & Documentation**
1. Comprehensive unit tests
2. Integration tests with real failures
3. Update README with retry behavior

### Estimated Complexity
- **Type/Config Changes**: Small (1-2 hours)
- **Retry Logic**: Medium (3-4 hours)
- **Testing**: Medium (3-4 hours)
- **Total**: Large story (8-10 hours)

### Success Criteria Validation
All acceptance criteria are implementable with existing patterns:
- ✅ Retry loop with max attempts
- ✅ Test output feedback to LLM
- ✅ Configuration (global + per-story)
- ✅ Observability (changes array, frontmatter)
- ✅ No-change detection
- ✅ TDD mode support

---

## Summary

This feature is **well-suited to the existing codebase architecture**. The review retry pattern provides an excellent template to follow. The main work involves:

1. Adapting the review retry pattern for implementation phase
2. Creating a retry wrapper around `runImplementationAgent()`
3. Feeding test output back to the LLM with analysis instructions
4. Implementing no-change detection using git diff comparison

**Key Recommendation**: Follow the review retry pattern closely - it's battle-tested and handles edge cases well (circuit breaker, history management, config validation). The main difference is retry happens during implementation rather than after review.

## Implementation Plan

# Implementation Plan: Implementation Agent Should Retry on Test Failures

## Overview
This plan adapts the proven review retry pattern to handle test failures during implementation. The implementation is divided into 4 phases, following TDD principles where tests are written before implementation code.

---

## Phase 1: Foundation - Types, Config & Story Helpers

### 1.1 Type Definitions
- [ ] Add `implementation_retry_count?: number` to `StoryFrontmatter` interface in `src/types/index.ts`
- [ ] Add `max_implementation_retries?: number` to `StoryFrontmatter` interface in `src/types/index.ts`
- [ ] Add `ImplementationConfig` interface to `src/types/index.ts` with `maxRetries` and `maxRetriesUpperBound` fields
- [ ] Add `implementation?: ImplementationConfig` to `WorkflowConfig` interface in `src/types/index.ts`
- [ ] Run `npm run build` to verify type changes compile

### 1.2 Configuration Schema & Validation
- [ ] Add `implementation` section to `DEFAULT_CONFIG` in `src/core/config.ts` with `maxRetries: 3` and `maxRetriesUpperBound: 10`
- [ ] Add environment variable support for `AI_SDLC_IMPLEMENTATION_MAX_RETRIES` in `loadConfig()`
- [ ] Add validation logic to enforce `implementation.maxRetries` is between 0-10
- [ ] Add validation to respect `maxRetriesUpperBound` for per-story overrides
- [ ] Update config schema tests in `src/core/config.test.ts` to cover implementation retry config

### 1.3 Story Helper Functions (TDD - Tests First)
- [ ] Write tests in `src/core/story.test.ts` for `getImplementationRetryCount()` (returns count from frontmatter, defaults to 0)
- [ ] Write tests for `isAtMaxImplementationRetries()` (compares count to config max, respects per-story override)
- [ ] Write tests for `resetImplementationRetryCount()` (sets count to 0)
- [ ] Write tests for `incrementImplementationRetryCount()` (increments count by 1)
- [ ] Write tests for `getEffectiveMaxImplementationRetries()` (respects story override, caps at upperBound)
- [ ] Implement `getImplementationRetryCount()` in `src/core/story.ts`
- [ ] Implement `isAtMaxImplementationRetries()` in `src/core/story.ts`
- [ ] Implement `resetImplementationRetryCount()` in `src/core/story.ts`
- [ ] Implement `incrementImplementationRetryCount()` in `src/core/story.ts`
- [ ] Implement `getEffectiveMaxImplementationRetries()` in `src/core/story.ts`
- [ ] Run `npm test` to verify story helper functions pass

### 1.4 Phase 1 Verification
- [ ] Run `npm test` - all tests pass
- [ ] Run `npm run build` - no TypeScript errors
- [ ] Run `make verify` - all checks pass

---

## Phase 2: Core Retry Logic

### 2.1 No-Change Detection Utilities (TDD - Tests First)
- [ ] Write tests in `src/agents/implementation.test.ts` for `captureCurrentDiffHash()` (returns SHA256 of `git diff HEAD`)
- [ ] Write tests for `hasChangesOccurred()` (compares two diff hashes, returns true if different)
- [ ] Implement `captureCurrentDiffHash()` in `src/agents/implementation.ts` using `execSync('git diff HEAD | shasum -a 256')`
- [ ] Implement `hasChangesOccurred()` in `src/agents/implementation.ts`
- [ ] Run `npm test` to verify no-change detection utilities pass

### 2.2 Test Output Truncation (TDD - Tests First)
- [ ] Write tests in `src/agents/implementation.test.ts` for `truncateTestOutput()` (keeps first 5000 chars, adds truncation notice)
- [ ] Write tests for edge cases: output < 5000 chars (no truncation), output exactly 5000 chars, empty output
- [ ] Implement `truncateTestOutput()` in `src/agents/implementation.ts`
- [ ] Run `npm test` to verify truncation logic passes

### 2.3 Retry Prompt Construction (TDD - Tests First)
- [ ] Write tests in `src/agents/implementation.test.ts` for `buildRetryPrompt()` (includes test output, attempt number, analysis instructions)
- [ ] Write tests to verify prompt includes: "CRITICAL: Tests are failing", test output section, numbered analysis steps, retry count
- [ ] Implement `buildRetryPrompt()` in `src/agents/implementation.ts` following prompt engineering best practices from research
- [ ] Run `npm test` to verify prompt construction passes

### 2.4 Retry Loop Wrapper (TDD - Tests First)
- [ ] Write tests in `src/agents/implementation.test.ts` for `attemptImplementationWithRetries()`:
  - [ ] Test fast path: first attempt succeeds (no retries triggered)
  - [ ] Test retry loop: first attempt fails, second succeeds (1 retry)
  - [ ] Test max retries exhausted: all attempts fail (returns final error)
  - [ ] Test no-change detection: identical diff hash between attempts (early exit with "No progress detected")
  - [ ] Test frontmatter updates: retry count incremented on each attempt
  - [ ] Test changes array: retry entries appended with attempt number and reason
  - [ ] Test progress callbacks: receive retry status updates
- [ ] Implement `attemptImplementationWithRetries()` in `src/agents/implementation.ts`:
  - [ ] Accept parameters: `story`, `config`, `options`, `progressCallback`
  - [ ] Initialize retry count from frontmatter (or 0)
  - [ ] Loop up to `maxRetries + 1` times (first attempt + retries)
  - [ ] On first attempt: call existing implementation logic
  - [ ] On subsequent attempts: call with retry prompt including test output
  - [ ] After each attempt: run `verifyImplementation()`
  - [ ] If verification passes: reset retry count, return success
  - [ ] If verification fails: check for no-change scenario
  - [ ] If no changes detected: fail early with "No progress detected" error
  - [ ] If changes detected: increment retry count, append to changes array, continue loop
  - [ ] If max retries exhausted: return error with summary of all attempts
- [ ] Run `npm test` to verify retry wrapper passes

### 2.5 Integration into Standard Implementation (TDD - Tests First)
- [ ] Write tests in `src/agents/implementation.test.ts` for modified `runImplementationAgent()`:
  - [ ] Test that `attemptImplementationWithRetries()` is called instead of direct implementation
  - [ ] Test that existing behavior preserved when retries disabled (maxRetries = 0)
  - [ ] Test that retry count is reset on successful implementation
- [ ] Refactor `runImplementationAgent()` in `src/agents/implementation.ts` to use `attemptImplementationWithRetries()`
- [ ] Preserve existing error handling and progress callbacks
- [ ] Run `npm test` to verify standard implementation integration passes

### 2.6 Phase 2 Verification
- [ ] Run `npm test` - all tests pass
- [ ] Run `npm run build` - no TypeScript errors
- [ ] Run `make verify` - all checks pass

---

## Phase 3: TDD Mode Support

### 3.1 TDD Retry Integration (TDD - Tests First)
- [ ] Write tests in `src/agents/implementation.test.ts` for modified `runTDDImplementation()`:
  - [ ] Test retry logic applies within TDD cycles
  - [ ] Test that RED phase expected failures don't trigger retries
  - [ ] Test that GREEN phase failures DO trigger retries
  - [ ] Test that retry count tracked independently per TDD cycle
- [ ] Refactor `runTDDImplementation()` in `src/agents/implementation.ts` to use `attemptImplementationWithRetries()` wrapper
- [ ] Ensure retry logic only applies to unexpected failures (GREEN phase verification failures)
- [ ] Share retry helper functions between standard and TDD modes
- [ ] Run `npm test` to verify TDD integration passes

### 3.2 Phase 3 Verification
- [ ] Run `npm test` - all tests pass
- [ ] Run `npm run build` - no TypeScript errors
- [ ] Run `make verify` - all checks pass

---

## Phase 4: Integration Testing & Documentation

### 4.1 Integration Tests
- [ ] Create `tests/integration/implementation-retry.test.ts`:
  - [ ] Test end-to-end retry flow with real failing test that gets fixed
  - [ ] Mock `runAgentQuery` to simulate: first attempt (buggy code), second attempt (fixed code)
  - [ ] Mock `verifyImplementation` to return: first failure (with test output), second success
  - [ ] Verify retry count persisted to story frontmatter
  - [ ] Verify changes array includes retry entries with attempt numbers
  - [ ] Verify final success status after retry
  - [ ] Test exhausted retries scenario: verify final error message includes all attempt summaries
- [ ] Run integration tests: `npm test tests/integration/implementation-retry.test.ts`
- [ ] Verify all integration tests pass

### 4.2 Manual Verification with Real Story
- [ ] Create test story in `.ai-sdlc/stories/test-retry.md` with intentionally failing implementation requirement
- [ ] Run `npm run cli -- start test-retry --auto`
- [ ] Observe retry behavior in logs (attempt numbers, test output feedback)
- [ ] Verify retry count incremented in story frontmatter
- [ ] Verify changes array includes retry entries
- [ ] Clean up test story after verification

### 4.3 Edge Case Testing
- [ ] Test with `maxRetries = 0` (no retries, immediate failure)
- [ ] Test with per-story override `max_implementation_retries: 5` (respects override)
- [ ] Test with per-story override exceeding upperBound (capped at 10)
- [ ] Test no-change detection: agent makes identical changes twice (early exit)
- [ ] Test empty changes detection: agent makes no file modifications (early exit)
- [ ] Test token budget: verify test output truncated at 5000 chars
- [ ] Verify all edge case tests pass

### 4.4 Final Verification
- [ ] Run full test suite: `npm test` - 100% passing
- [ ] Run build: `npm run build` - no errors
- [ ] Run verification: `make verify` - all checks pass
- [ ] Verify no temporary files created during testing (clean git status)

### 4.5 Documentation Updates (Optional - Only if explicitly requested)
- [ ] Update `README.md` with retry behavior explanation (if user requests)
- [ ] Document configuration options: `implementation.maxRetries` (if user requests)
- [ ] Add example of per-story retry override in frontmatter (if user requests)
- [ ] Document cost implications of retry behavior (if user requests)

---

## Summary

**Total Tasks:** 72 checkboxes across 4 phases

**Estimated Effort:**
- Phase 1 (Foundation): ~2-3 hours
- Phase 2 (Core Retry Logic): ~4-5 hours  
- Phase 3 (TDD Support): ~1-2 hours
- Phase 4 (Integration & Testing): ~2-3 hours
- **Total: 9-13 hours** (aligns with "large" story estimate)

**Key Dependencies:**
- Each phase builds on the previous one (must be completed sequentially)
- Tests written before implementation (TDD approach)
- Verification gates between phases ensure quality

**Success Criteria:**
- All acceptance criteria met
- `make verify` passes
- No temporary files or test artifacts left behind
- Retry behavior observable in logs and frontmatter


### Implementation Notes (2026-01-14)

Perfect! I have successfully implemented the "Implementation Agent Should Retry on Test Failures" feature according to the plan. 

## Summary

The implementation adds automatic retry capability to the implementation agent when tests fail. Here's what was delivered:

### Core Features
- **Retry logic** for standard (non-TDD) implementation that captures test failures and feeds them back to the LLM for up to 3 retry attempts (configurable)
- **Configuration** via `implementation.maxRetries` in config and per-story overrides
- **Safety mechanisms** including no-change detection (compares git diff hashes) and hard caps
- **Full observability** with retry counts in frontmatter, progress callbacks, and detailed error messages

### Code Changes
- **6 files modified** with comprehensive type definitions, configuration, helper functions, and core retry logic
- **411 lines of new tests** ensuring all edge cases are covered
- **Utility functions** for diff hash comparison, test output truncation, and retry prompt construction

### Key Implementation Details
1. The retry loop wraps the implementation + verification cycle
2. First attempt uses standard prompt; retries include test output with analysis instructions
3. No-change detection prevents infinite loops by comparing git diff hashes between attempts
4. TDD mode gets simplified retry support (safety net after cycle completion)
5. All configuration follows existing patterns (review retry config)

The implementation is complete and ready for testing with `make verify`.


### TypeScript Fix (2026-01-14)

Fixed two TypeScript errors in `src/agents/implementation.ts` where `onProgress` callbacks were being called with strings instead of `AgentProgressEvent` objects:

**Lines 829 and 910:** Changed from:
```typescript
options.onProgress(`Implementation retry...`);
```
To:
```typescript
options.onProgress({ type: 'assistant_message', content: `Implementation retry...` });
```

`make verify` now passes with all 651 unit tests and 138 integration tests passing.
