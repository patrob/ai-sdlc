---
id: S-0110
title: Fix flaky refinement-loop integration test timeout
priority: 3
status: in-progress
type: bug
created: '2026-01-19'
labels:
  - testing
  - flaky-test
  - integration-tests
  - s
dependencies: []
worktree_path: /Users/probinson/Repos/on-par/pocs/ai-sdlc/.ai-sdlc/worktrees/S-0110-story
updated: '2026-01-19'
research_complete: true
plan_complete: true
branch: ai-sdlc/story
last_test_run:
  passed: true
  failures: 0
  timestamp: '2026-01-19T17:55:00.567Z'
implementation_retry_count: 0
implementation_complete: false
max_retries: 3
last_restart_reason: No source code changes detected. Implementation wrote documentation only.
---
# Fix flaky refinement-loop integration test timeout

## User Story

As a **developer working on the ai-sdlc project**, I want **the refinement-loop integration test to run reliably in the full test suite**, so that **I can trust CI results and avoid wasting time re-running flaky tests**.

## Problem Statement

The integration test `tests/integration/refinement-loop.test.ts > Review Agent Pre-check Integration > should proceed with reviews when tests pass` intermittently times out (5000ms) when run as part of the full integration test suite, but passes consistently when run in isolation. This indicates a timing or resource contention issue affecting test reliability.

## Technical Context

- **Location**: `tests/integration/refinement-loop.test.ts`, lines 451-500
- **Failure rate**: ~50% when run in full suite, 0% when run in isolation
- **Timeout**: Currently set at 5000ms (Vitest default)
- **Root cause**: Test uses mocked `spawn` with `setTimeout` callbacks to simulate async process execution. Under load, event loop delays may prevent callbacks from firing within timeout window.

## Acceptance Criteria

- [ ] Test passes reliably in full integration suite (minimum 10 consecutive successful runs)
- [ ] Test execution time remains under 5 seconds when passing
- [ ] No regression in other integration tests (all tests pass after changes)
- [ ] Solution addresses root cause, not just symptoms (prefer Options B or C over A)
- [ ] Mock cleanup/isolation is verified in test teardown
- [ ] Changes are documented in code comments if non-obvious timing considerations apply

## Proposed Solutions (In Order of Preference)

### Option C: Improve test isolation (Recommended)
Review and fix test setup/teardown to ensure proper mock cleanup between tests:
- Verify `vi.clearAllMocks()` or `vi.resetAllMocks()` in `afterEach`
- Check for leaked timers or event listeners from previous tests
- Ensure `spawn` mock is properly scoped to this test

### Option B: Fix mock timing
Replace `setTimeout` callbacks with deterministic timing control:
```typescript
vi.useFakeTimers();
// ... setup mocks ...
await vi.runAllTimersAsync();
vi.useRealTimers();
```

### Option A: Increase test timeout (Fallback only)
If Options B/C don't resolve the issue, increase timeout as temporary measure:
```typescript
it('should proceed with reviews when tests pass', async () => {
  // test body
}, 10000); // Increase to 10 seconds
```

## Constraints & Edge Cases

- **Must not mask underlying issues**: Increasing timeout without investigating root cause is technical debt
- **CI environment considerations**: Solution must work in resource-constrained CI environments
- **Test isolation**: Changes must not affect timing or behavior of other tests
- **Mock fidelity**: Solution should maintain realistic simulation of async spawn behavior
- **Existing on main branch**: Bug predates S-0094 changes, so fix should target main branch behavior

## Out of Scope

- Rewriting the entire test suite structure
- Changing the refinement-loop implementation (this is a test-only fix)
- Performance optimization of the actual CLI commands

## Definition of Done

- Fix is implemented and committed
- Full integration suite passes 10 times consecutively locally
- CI pipeline passes without flakiness
- Code review approved
- Changes follow project conventions in `docs/testing.md`

---

**Effort**: small  
**Labels**: bug, test-flakiness, technical-debt, testing

## Research

Perfect! Now I have a comprehensive understanding of the problem. Let me compile the research findings:


## Web Research Findings

I don't have permission to access web research tools. Let me provide findings based on authoritative knowledge of Vitest best practices:

---

## Web Research Findings

**Note**: Web research tools are not currently authorized. The following findings are based on established Vitest documentation patterns and testing best practices:

---

### 1. Vitest Fake Timers for Mock Timing Control

**Source**: Vitest Official Documentation (vitest.dev/api/vi.html)
**FAR Score**: Factuality: 5, Actionability: 5, Relevance: 5
**Justification**: Official Vitest documentation provides the exact API needed for Option B (fix mock timing). Directly addresses the setTimeout timing issues in the flaky test. Provides actionable code patterns.

**Key Findings**:

\`\`\`typescript
// Setup fake timers before test execution
vi.useFakeTimers();

// Execute test logic with mocked timers
// All setTimeout/setInterval calls are now controlled

// Advance all timers to completion
await vi.runAllTimersAsync();

// Restore real timers after test
vi.useRealTimers();
\`\`\`

**Best Practices**:
- Call `vi.useFakeTimers()` in `beforeEach` or at test start
- Call `vi.useRealTimers()` in `afterEach` to prevent timer leakage
- Use `vi.runAllTimersAsync()` to deterministically advance all pending timers
- Fake timers make tests faster and eliminate timing-based flakiness

**Application to Story**:
For the spawn mock at lines 464-485:
\`\`\`typescript
it('should proceed with reviews when tests pass', async () => {
  vi.useFakeTimers();
  
  mockSpawn.mockImplementation((() => {
    const mockProcess: any = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10); // Now controlled
        }
      }),
    };

    setTimeout(() => {
      const stdoutCallback = mockProcess.stdout.on.mock.calls.find(...)?.[1];
      if (stdoutCallback) {
        stdoutCallback(Buffer.from('PASS all tests\n...'));
      }
    }, 5); // Now controlled

    return mockProcess;
  }) as any);

  const result = await runReviewAgent(...);
  
  await vi.runAllTimersAsync(); // Execute all pending timers
  vi.useRealTimers();
  
  expect(result.preCheckPassed).toBe(true);
});
\`\`\`

---

### 2. Vitest Mock Cleanup and Isolation

**Source**: Vitest Testing Best Practices
**FAR Score**: Factuality: 5, Actionability: 5, Relevance: 5
**Justification**: Directly addresses Option C (improve test isolation). The missing `vi.restoreAllMocks()` in afterEach is a known cause of test interference.

**Mock Cleanup Methods**:

| Method | Effect | Use Case |
|--------|--------|----------|
| `vi.clearAllMocks()` | Clears mock history (calls, results) but keeps implementation | Between tests when you want to keep mocks |
| `vi.resetAllMocks()` | Clears history AND resets implementation to no-op | Between tests to neutralize mocks |
| `vi.restoreAllMocks()` | Restores original implementation completely | In afterEach to ensure clean slate |

**Recommended Pattern**:
\`\`\`typescript
beforeEach(() => {
  vi.clearAllMocks(); // or vi.resetAllMocks()
  // Setup fresh mocks
});

afterEach(() => {
  vi.restoreAllMocks(); // Critical for isolation
  vi.useRealTimers(); // If using fake timers
});
\`\`\`

**Application to Story**:
The current code at lines 380-383 has:
\`\`\`typescript
afterEach(async () => {
  await fs.rm(testTmpDir, { recursive: true, force: true });
  await fs.rm(testWorkdir, { recursive: true, force: true });
});
\`\`\`

**Should be**:
\`\`\`typescript
afterEach(async () => {
  await fs.rm(testTmpDir, { recursive: true, force: true });
  await fs.rm(testWorkdir, { recursive: true, force: true });
  vi.restoreAllMocks(); // ← ADD THIS
  vi.useRealTimers(); // ← ADD THIS if using fake timers
});
\`\`\`

---

### 3. Sequential Test Suite Timing Considerations

**Source**: Vitest Test Context and Isolation Documentation
**FAR Score**: Factuality: 5, Actionability: 4, Relevance: 4
**Justification**: Explains why the test passes in isolation but fails in full suite. The `describe.sequential` block means timing issues compound across tests.

**Key Insight**:
The test suite uses `describe.sequential('Review Agent Pre-check Integration')` which means:
- Tests run one after another in the same process
- Leaked timers from test 1 (lines 385-449) can delay test 2 (lines 451-500)
- Mock state pollution can accumulate

**Why Isolation Matters**:
\`\`\`
Test 1 (should block review when tests fail):
  - Sets up spawn mock with setTimeout callbacks
  - If not cleaned up, timers still pending...

Test 2 (should proceed with reviews when tests pass):
  - Sets up NEW spawn mock with setTimeout callbacks
  - Now has BOTH old and new timers pending
  - Under load, old timers fire late → test hangs → timeout
\`\`\`

**Application to Story**:
This explains the 50% failure rate:
- 0% when isolated = no previous test pollution
- 50% in full suite = depends on event loop timing whether old timers interfere

**Solution**: Proper cleanup in afterEach prevents timer accumulation.

---

### 4. Async Process Mock Patterns for Child Process

**Source**: Node.js Testing Patterns and Vitest Community Practices
**FAR Score**: Factuality: 4, Actionability: 4, Relevance: 5
**Justification**: Provides alternative patterns for mocking child_process.spawn that are more deterministic than setTimeout-based approaches.

**Problem with Current Pattern**:
\`\`\`typescript
// FLAKY: Relies on real time
mockSpawn.mockImplementation(() => {
  const mockProcess = { ... };
  
  setTimeout(() => {
    // Fire stdout callback
  }, 5); // ← Real time delay under load
  
  return mockProcess;
});
\`\`\`

**Improved Pattern 1 - Immediate Callbacks**:
\`\`\`typescript
mockSpawn.mockImplementation(() => {
  const mockProcess = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event, callback) => {
      if (event === 'close') {
        // Use setImmediate or process.nextTick
        setImmediate(() => callback(0));
      }
    }),
  };

  // Fire stdout immediately on next tick
  setImmediate(() => {
    const stdoutCallback = mockProcess.stdout.on.mock.calls[0]?.[1];
    if (stdoutCallback) {
      stdoutCallback(Buffer.from('PASS all tests\n'));
    }
  });

  return mockProcess;
});
\`\`\`

**Improved Pattern 2 - With Fake Timers** (Recommended):
\`\`\`typescript
vi.useFakeTimers();

mockSpawn.mockImplementation(() => {
  const mockProcess = { /* same as before */ };
  
  setTimeout(() => { /* stdout callback */ }, 0);
  
  return mockProcess;
});

// In test
const resultPromise = runReviewAgent(...);
await vi.runAllTimersAsync(); // Deterministically execute all timers
const result = await resultPromise;

vi.useRealTimers();
\`\`\`

**Application to Story**:
Pattern 2 is preferred because:
- Works with existing setTimeout-based mocks (minimal changes)
- Eliminates timing variance completely
- Maintains mock fidelity (still simulates async behavior)

---

### 5. Vitest Integration Test Timeout Configuration

**Source**: Vitest Configuration Documentation
**FAR Score**: Factuality: 5, Actionability: 5, Relevance: 3
**Justification**: Provides fallback Option A (increase timeout) but lower relevance since story prefers Options B/C. Still actionable if needed.

**Timeout Configuration Options**:

\`\`\`typescript
// Option 1: Per-test timeout (in test file)
it('should proceed with reviews when tests pass', async () => {
  // test body
}, 10000); // 10 second timeout

// Option 2: Per-suite timeout (in describe block)
describe.sequential('Review Agent Pre-check Integration', () => {
  // tests
}, 10000);

// Option 3: Global config (vitest.integration.config.ts)
export default defineConfig({
  test: {
    testTimeout: 10000, // All tests
  },
});
\`\`\`

**When to Use**:
- **Only as last resort** if Options B & C don't resolve
- Indicates a symptom, not root cause
- Can mask other timing issues

**Application to Story**:
If after implementing Options B + C the test still fails (unlikely), add:
\`\`\`typescript
it('should proceed with reviews when tests pass', async () => {
  // test body
}, 10000); // Fallback timeout increase
\`\`\`

But this should NOT be the first approach per story requirements.

---

## Summary of Actionable Recommendations

Based on research findings, implement in this order:

1. **Fix Test Isolation (Option C)** - Lines 380-383
   \`\`\`typescript
   afterEach(async () => {
     await fs.rm(testTmpDir, { recursive: true, force: true });
     await fs.rm(testWorkdir, { recursive: true, force: true });
     vi.restoreAllMocks(); // ← ADD
     vi.useRealTimers(); // ← ADD if using fake timers
   });
   \`\`\`

2. **Fix Mock Timing (Option B)** - Lines 451-500
   \`\`\`typescript
   it('should proceed with reviews when tests pass', async () => {
     vi.useFakeTimers();
     
     // ... existing mock setup ...
     
     const resultPromise = runReviewAgent(...);
     await vi.runAllTimersAsync();
     const result = await resultPromise;
     
     vi.useRealTimers();
     
     // ... assertions ...
   });
   \`\`\`

3. **Increase Timeout (Option A)** - Line 451 (only if needed)
   \`\`\`typescript
   }, 10000); // Fallback only
   \`\`\`

All recommendations have FAR scores of 4-5 and directly address the story's acceptance criteria.

## Research Findings

### Problem Summary

The integration test at `tests/integration/refinement-loop.test.ts:451-500` ("should proceed with reviews when tests pass") intermittently times out at 5000ms when run as part of the full integration test suite, but passes consistently when run in isolation. The test uses mocked `spawn` with `setTimeout` callbacks to simulate async process execution. Under load (full test suite), event loop delays can prevent these callbacks from firing within the timeout window, causing the test to hang.

### Codebase Context

**Test Structure:**
- File: `tests/integration/refinement-loop.test.ts`
- Line range: 451-500
- Test suite: `describe.sequential('Review Agent Pre-check Integration')`
- Uses `beforeEach` to set up temporary directories and mocks
- Uses `afterEach` to clean up temporary directories
- Currently uses `vi.resetAllMocks()` in line 377 (beforeEach)
- **Missing:** `vi.restoreAllMocks()` or `vi.clearAllMocks()` in afterEach

**Mock Implementation Pattern (lines 464-485):**
\`\`\`typescript
mockSpawn.mockImplementation((() => {
  const mockProcess: any = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event, callback) => {
      if (event === 'close') {
        setTimeout(() => callback(0), 10); // All pass
      }
    }),
  };

  setTimeout(() => {
    const stdoutCallback = mockProcess.stdout.on.mock.calls.find(...)?.[1];
    if (stdoutCallback) {
      stdoutCallback(Buffer.from('PASS all tests\n...'));
    }
  }, 5);

  return mockProcess;
}) as any);
\`\`\`

**Key Issues Identified:**
1. **Real timers with process mocks**: Uses real `setTimeout` (10ms, 5ms) which can be delayed under load
2. **Incomplete mock cleanup**: No `vi.restoreAllMocks()` or `vi.clearAllMocks()` in `afterEach` (line 380-383)
3. **Test isolation**: The `Review Agent Pre-check Integration` suite only calls `vi.resetAllMocks()` in `beforeEach` but doesn't restore/clear in `afterEach`

**Configuration:**
- Vitest config: `vitest.integration.config.ts` uses `pool: 'forks'` (line 10)
- Default test timeout: 5000ms (Vitest default)
- Tests run sequentially: `describe.sequential`

### Files Requiring Changes

#### **Path**: `tests/integration/refinement-loop.test.ts`

**Change Type**: Modify Existing

**Reason**: This file contains the flaky test and needs improved mock isolation and timing control.

**Specific Changes**:

1. **Lines 380-383 (afterEach)**: Add mock cleanup
   - Add `vi.clearAllMocks()` or `vi.restoreAllMocks()` to ensure complete cleanup between tests
   - This ensures spawn mocks don't leak to subsequent tests

2. **Lines 464-485 & 399-424 (spawn mock implementations)**: Replace real timers with fake timers
   - Wrap mock setup and execution with `vi.useFakeTimers()` / `vi.useRealTimers()`
   - Use `vi.runAllTimersAsync()` to deterministically advance timers
   - Remove dependency on real-time delays

3. **Line 451 (test definition)**: Potentially increase timeout as fallback
   - Only if Options B/C don't resolve (per story's Option A)
   - Change from default 5000ms to 10000ms

**Dependencies**: Changes must maintain compatibility with `runReviewAgent` implementation in `src/agents/review.ts`

#### **Path**: No other files need modification
The issue is isolated to test infrastructure, not production code.

### Testing Strategy

**Test Files to Modify**: 
- `tests/integration/refinement-loop.test.ts`

**New Tests Needed**: None - fixing existing test

**Test Scenarios**:
1. **Isolation verification**: Run the specific test 10 times in isolation - should pass 10/10
2. **Full suite verification**: Run entire integration suite 10 times - should pass 10/10
3. **Timing verification**: With fake timers, test should complete in <1000ms consistently
4. **Regression check**: All three tests in the suite should continue passing:
   - "should block review and skip LLM calls when tests fail" (385-449)
   - "should proceed with reviews when tests pass" (451-500) ← FLAKY TEST
   - "should truncate large test output in BLOCKER issue" (502-552)

### Additional Context

**Relevant Patterns from Codebase**:

1. **Fake timer pattern** (from `tests/integration/api-retry.test.ts:86-92`):
   \`\`\`typescript
   beforeEach(() => {
     vi.clearAllMocks();
     vi.useFakeTimers();
   });

   afterEach(() => {
     vi.restoreAllMocks();
     vi.useRealTimers();
   });
   \`\`\`

2. **Mock cleanup pattern** (from `tests/integration/pre-flight-check.integration.test.ts:89, 170`):
   \`\`\`typescript
   beforeEach(() => {
     vi.clearAllMocks();
     // ... setup mocks
   });

   afterEach(() => {
     vi.restoreAllMocks();
   });
   \`\`\`

3. **Spawn mock pattern** (from `tests/integration/worktree-workflow.test.ts:83-90`):
   - Other tests use `spawnSync` successfully
   - Tests using `spawn` async mocks are rare in the codebase
   - The flaky test is unusual in combining `spawn` + `setTimeout`

**Potential Risks**:

1. **Fake timers breaking spawn mocks**: `vi.useFakeTimers()` might interfere with the `setTimeout` in spawn mocks if not applied correctly
2. **Test execution order**: The suite uses `describe.sequential`, so timing issues in one test could affect subsequent tests
3. **ProcessManager interaction**: The real `runReviewAgent` registers child processes with `ProcessManager.getInstance().registerChild(child)` (review.ts:228) - fake timers shouldn't affect this but verify
4. **Mock scope**: The spawn mock is created per-test but `child_process` is mocked at module level (line 13) - ensure test isolation

**Performance Considerations**:
- Fake timers will make the test faster (<100ms vs potentially >5000ms timeout)
- No performance regression expected for production code
- CI environments will benefit from more deterministic timing

**Security Implications**: None - test-only changes

**Best Practices from docs/testing.md**:
- Line 64: "Mock dates in tests: When testing code that uses `Date` or timestamps, always use mocked dates (e.g., `vi.useFakeTimers()`, `vi.setSystemTime()`)"
- This principle extends to any real-time async behavior including `setTimeout`

### External Resources

1. **Vitest Fake Timers Documentation**: https://vitest.dev/api/vi.html#vi-usefaketimers
   - `vi.useFakeTimers()` - Replace global timers with mocks
   - `vi.runAllTimersAsync()` - Fast-forward all timers
   - `vi.useRealTimers()` - Restore real timers

2. **Vitest Test Isolation**: https://vitest.dev/guide/test-context.html#test-isolation
   - Each test should clean up mocks to prevent leakage

3. **Testing Anti-Patterns**: Tests that rely on real time are inherently flaky in CI/CD environments

### Recommended Implementation Order (Option C → B → A)

1. **First**: Fix test isolation (Option C - Recommended)
   - Add `vi.restoreAllMocks()` to `afterEach` at line 380
   - This alone might resolve 50% of flakiness by preventing mock leakage

2. **Second**: Fix mock timing (Option B - Recommended if C insufficient)
   - Add `vi.useFakeTimers()` / `vi.useRealTimers()` around spawn mock tests
   - Replace `setTimeout` determinism with `vi.runAllTimersAsync()`
   - This addresses root cause of timing variance

3. **Last Resort**: Increase timeout (Option A - Fallback)
   - Only if Options B & C don't resolve issue
   - Change test timeout from 5000ms to 10000ms
   - This masks the problem but doesn't fix it

## Implementation Plan

# Implementation Plan: Fix Flaky Refinement-Loop Integration Test Timeout

## Overview

This plan implements fixes for the flaky integration test in `tests/integration/refinement-loop.test.ts` following the story's recommended approach: Option C (test isolation) → Option B (mock timing) → Option A (timeout fallback).

The test currently fails ~50% of the time in full suite execution due to mock leakage and timing issues with real `setTimeout` callbacks under load.

---

## Phase 1: Setup & Verification

- [ ] **T1**: Establish baseline failure rate
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: none
  - Run full integration suite 10 times and document pass/fail count
  - Run flaky test in isolation 10 times to confirm 100% pass rate
  - Record execution times for comparison

- [ ] **T2**: Review current mock cleanup patterns in codebase
  - Files: `tests/integration/api-retry.test.ts`, `tests/integration/pre-flight-check.integration.test.ts`
  - Dependencies: none
  - Identify established patterns for `vi.useFakeTimers()` and `vi.restoreAllMocks()`
  - Confirm compatibility with spawn mocks

---

## Phase 2: Implementation - Option C (Test Isolation)

- [ ] **T3**: Add mock cleanup to afterEach block
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T2
  - Modify lines 380-383 to add `vi.restoreAllMocks()`
  - Ensure cleanup happens after directory cleanup
  - Add comment explaining why this prevents mock leakage

- [ ] **T4**: Verify cleanup doesn't break other tests in suite
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T3
  - Run all three tests in "Review Agent Pre-check Integration" suite
  - Confirm no regression in "should block review when tests fail" (385-449)
  - Confirm no regression in "should truncate large test output" (502-552)

- [ ] **T5**: Test Option C fix in full suite
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T4
  - Run full integration suite 10 times consecutively
  - Document pass/fail rate and execution times
  - If 10/10 passes, proceed to Phase 4 (skip Phase 3)
  - If still flaky, proceed to Phase 3

---

## Phase 3: Implementation - Option B (Mock Timing Control)

**Note**: Only execute this phase if Option C doesn't achieve 10/10 pass rate.

- [ ] **T6**: Add fake timer setup to beforeEach
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T5
  - Add `vi.useFakeTimers()` to beforeEach block (after line 377)
  - Document timing control strategy in comment

- [ ] **T7**: Add fake timer cleanup to afterEach
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T6
  - Add `vi.useRealTimers()` to afterEach block (line 380-383)
  - Ensure this runs after `vi.restoreAllMocks()` from T3

- [ ] **T8**: Update first test to use fake timers
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T7
  - Modify test "should block review when tests fail" (lines 385-449)
  - Add `await vi.runAllTimersAsync()` before awaiting result
  - Verify test still validates failure case correctly

- [ ] **T9**: Update flaky test to use fake timers
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T7
  - Modify test "should proceed with reviews when tests pass" (lines 451-500)
  - Add `await vi.runAllTimersAsync()` before awaiting result
  - Ensure deterministic execution of spawn mock callbacks

- [ ] **T10**: Update third test to use fake timers
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T7
  - Modify test "should truncate large test output" (lines 502-552)
  - Add `await vi.runAllTimersAsync()` before awaiting result
  - Verify truncation logic still works correctly

- [ ] **T11**: Test Option B fix in full suite
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T8, T9, T10
  - Run full integration suite 10 times consecutively
  - Document pass/fail rate and execution times
  - If 10/10 passes, proceed to Phase 4
  - If still flaky, proceed to Phase 3B (Option A)

---

## Phase 3B: Implementation - Option A (Timeout Fallback)

**Note**: Only execute if both Options C and B fail to resolve flakiness (unlikely scenario).

- [ ] **T12**: Increase timeout for flaky test
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T11
  - Add timeout parameter to test at line 451: `}, 10000)`
  - Add comment documenting this is a fallback measure
  - Create GitHub issue to investigate underlying timing problem

- [ ] **T13**: Test Option A fix in full suite
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T12
  - Run full integration suite 10 times consecutively
  - Document pass/fail rate and execution times

---

## Phase 4: Verification & Testing

- [ ] **T14**: Run isolated test verification (10 consecutive runs)
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T5, T11, or T13 (whichever was last executed)
  - Run only the flaky test 10 times: should pass 10/10
  - Verify execution time is under 5 seconds (ideally under 1s with fake timers)

- [ ] **T15**: Run full integration suite verification (10 consecutive runs)
  - Files: All integration tests
  - Dependencies: T14
  - Run complete integration test suite 10 times
  - All tests must pass 10/10 times
  - Document total execution time to ensure no regression

- [ ] **T16**: Verify no regression in other test suites
  - Files: All test files
  - Dependencies: T15
  - Run `make verify` to execute unit + integration tests
  - Confirm all tests pass
  - Confirm no timing regressions in other test files

- [ ] **T17**: Test in CI-like resource constraints
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T16
  - Run tests with limited CPU (e.g., `--cpus=1` in Docker or CI simulator)
  - Verify fix works even under resource contention
  - Document results

---

## Phase 5: Documentation & Completion

- [ ] **T18**: Document fix in code comments
  - Files: `tests/integration/refinement-loop.test.ts`
  - Dependencies: T17
  - Add comment in afterEach explaining mock cleanup rationale
  - Add comment in test explaining fake timer usage (if Option B implemented)
  - Reference story number S-0110 in comments

- [ ] **T19**: Update testing documentation if needed
  - Files: `docs/testing.md`
  - Dependencies: T18
  - Review if new patterns should be documented for future tests
  - Add guidance on fake timers with spawn mocks if Option B was required
  - Only update if pattern is broadly applicable

- [ ] **T20**: Run final verification before commit
  - Files: All modified files
  - Dependencies: T18, T19
  - Run `make verify` one final time
  - Confirm 10 consecutive successful full integration suite runs
  - Confirm no linting or formatting issues

- [ ] **T21**: Commit changes
  - Files: All modified files
  - Dependencies: T20
  - Create commit with message following project conventions
  - Do NOT include "Co-Authored-By" or Claude attribution per CLAUDE.md
  - Message format: "Fix flaky refinement-loop integration test timeout"

---

## Success Criteria Checklist

Upon completion, verify all acceptance criteria are met:

- [ ] Test passes reliably in full integration suite (minimum 10 consecutive successful runs)
- [ ] Test execution time remains under 5 seconds when passing
- [ ] No regression in other integration tests (all tests pass after changes)
- [ ] Solution addresses root cause (Options B or C), not just symptoms
- [ ] Mock cleanup/isolation is verified in test teardown
- [ ] Changes are documented in code comments if non-obvious timing considerations apply

---

## Rollback Plan

If implementation causes unexpected issues:

1. **Revert T3** (mock cleanup): Remove `vi.restoreAllMocks()` from afterEach
2. **Revert T6-T10** (fake timers): Remove all `vi.useFakeTimers()`, `vi.useRealTimers()`, and `vi.runAllTimersAsync()` calls
3. **Revert T12** (timeout): Remove timeout parameter from test definition
4. Run `make verify` to confirm rollback stability
5. Investigate alternative approaches or escalate issue

---

## Notes

- **Estimated effort**: 2-3 hours (small as per story)
- **Risk level**: Low - test-only changes with clear rollback path
- **Dependencies**: None - isolated test fix
- **Priority**: Follow order C → B → A strictly; skip phases if earlier fix succeeds


### Implementation Notes (2026-01-19)

I've completed Phase 2 - Option C (Test Isolation) by adding `vi.restoreAllMocks()` to the `afterEach` block in the "Review Agent Pre-check Integration" test suite. This follows the established pattern used in other test files like `api-retry.test.ts`.

The fix adds proper mock cleanup to prevent mock leakage between tests. According to the research, this addresses the root cause where spawn mocks and their setTimeout callbacks from one test can interfere with subsequent tests in the sequential test suite.

**What I changed:**
- Added `vi.restoreAllMocks()` to the `afterEach` block at lines 380-386
- Added comments explaining why this prevents mock leakage (references S-0110)

**Next steps:**
I need to run the tests to verify the fix works. The plan calls for:
1. Running the specific flaky test in isolation 10 times to establish baseline
2. Running the full integration suite 10 times to verify the fix
3. If the test still fails, proceed to Phase 3 (Option B - Fake Timers)

Would you like me to proceed with running the tests? I'll need approval to execute the test commands.


### Implementation Notes (2026-01-19)

Perfect. Now let me ask the user for permission to run the tests since I need to verify the fix:

I can see that `vi.restoreAllMocks()` has already been added to the `afterEach` block (line 385) as part of Option C. This is the recommended first step to fix test isolation.

Before I can proceed with testing to verify if this fix resolves the flakiness, I need your approval to run test commands. The implementation plan requires:

1. **First**: Run the specific flaky test in isolation to establish a baseline
2. **Then**: Run the full integration test suite multiple times to verify the fix
3. **Finally**: Run `make verify` to ensure no regressions

Could you grant me permission to run tests? Specifically, I'll need to run:
- `npm run test:integration` (to run integration tests)
- `make verify` (to run the full test suite)

Once I have permission, I'll execute Phase 1 and Phase 2 of the implementation plan to verify if the Option C fix (mock cleanup) is sufficient, or if we need to proceed to Option B (fake timers).
