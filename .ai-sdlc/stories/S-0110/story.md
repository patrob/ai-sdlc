---
id: S-0110
title: Fix flaky refinement-loop integration test timeout
priority: 3
status: backlog
type: bug
created: '2026-01-19'
labels:
  - testing
  - flaky-test
  - integration-tests
dependencies: []
---
# Fix flaky refinement-loop integration test timeout

## Bug Summary

The integration test `tests/integration/refinement-loop.test.ts > Review Agent Pre-check Integration > should proceed with reviews when tests pass` intermittently times out (5000ms) when run as part of the full integration test suite, but passes consistently when run in isolation.

## Steps to Reproduce

1. Run full integration test suite: `npm run test:integration`
2. Observe that the test times out approximately 50% of the time
3. Run the test in isolation: `npm run test:integration -- --run tests/integration/refinement-loop.test.ts`
4. Observe that the test passes consistently

## Expected Behavior

The test should pass reliably when run as part of the full test suite.

## Actual Behavior

The test times out with error:
```
FAIL  tests/integration/refinement-loop.test.ts > Review Agent Pre-check Integration > should proceed with reviews when tests pass
Error: Test timed out in 5000ms.
```

## Technical Analysis

The test at line 451-500 uses mocked `spawn` with `setTimeout` callbacks to simulate async process execution. Potential causes:

1. **Resource contention**: When run with other integration tests, there may be insufficient CPU/event loop time for the setTimeout callbacks to fire within the 5000ms window
2. **Mock isolation**: The `vi.mocked(spawn)` may not be properly isolated between tests, causing interference from other test files
3. **Insufficient timeout**: The 5000ms default timeout may be too aggressive for CI/integration environments under load

## Proposed Solutions

### Option A: Increase test timeout (Quick fix)
Add explicit timeout to the test:
```typescript
it('should proceed with reviews when tests pass', async () => {
  // test body
}, 15000); // Increase to 15 seconds
```

### Option B: Fix mock timing (Better fix)
Replace `setTimeout` callbacks with immediate resolution or use `vi.useFakeTimers()` to control time:
```typescript
vi.useFakeTimers();
// ... setup mocks ...
vi.runAllTimers();
```

### Option C: Improve test isolation (Best fix)
Review the test setup/teardown to ensure proper mock cleanup and isolation from other tests.

## Acceptance Criteria

- [ ] Test passes reliably in full integration suite (10 consecutive runs without timeout)
- [ ] Test execution time remains reasonable (< 5 seconds when passing)
- [ ] No regression in other integration tests

## Context

Discovered during S-0094 implementation investigation. The test was not modified by S-0094 changes and the issue exists on main branch as well.
