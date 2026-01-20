---
id: S-0111
title: Fix order-dependent array assertions in unit tests
priority: 2
status: done
type: bug
created: '2026-01-19'
labels:
  - testing
  - flaky-test
  - test-patterns
dependencies: []
updated: '2026-01-20'
---
# Fix order-dependent array assertions in unit tests

## User Story

As a **developer running unit tests**, I want **array assertions to be order-independent when the implementation doesn't guarantee ordering**, so that **tests pass reliably across different environments and filesystem implementations**.

## Context

Unit tests using `.toEqual()` on arrays fail non-deterministically because underlying functions return results in filesystem order, which varies between operating systems (macOS, Linux, Windows), filesystem types (APFS, ext4, NTFS), and timing conditions.

### Example Failure

From S-0096 worktree (`tests/unit/groupings.test.ts`):

```typescript
// FAILING TEST - order-dependent assertion
it('should return stories with exact label match', () => {
  createStory('story-1', ['epic-test', 'sprint-2024-q1']);
  createStory('story-2', ['epic-test', 'team-backend']);

  const results = findStoriesByLabel(sdlcRoot, 'epic-test');
  expect(results).toHaveLength(2);
  expect(results.map(s => s.frontmatter.id)).toEqual(['story-1', 'story-2']); // FAILS
});
```

Error: `expected [ 'story-2', 'story-1' ] to deeply equal [ 'story-1', 'story-2' ]`

## Acceptance Criteria

- [x] All 4 failing tests in `tests/unit/groupings.test.ts` use order-independent assertions:
  - `findStoriesByLabel > should return stories with exact label match`
  - `findStoriesByLabels > mode: all > should return stories with all specified labels`
  - `findStoriesByLabels > mode: any > should return stories with at least one specified label`
  - `findStoriesByPattern > should match stories with wildcard patterns`
- [x] Tests pass reliably in 10 consecutive runs on the same machine
- [x] Tests pass reliably in 3 consecutive runs after deleting and recreating test fixtures (to simulate different filesystem states)
- [x] Add guidance to `docs/testing.md` in "Critical Rules" section about order-independent array assertions
- [x] Audit existing tests for similar patterns: `grep -r "\.toEqual(\[" tests/` and verify each case
- [x] `make verify` passes
- [x] No regressions in other test suites

## Implementation Approach

Use **Option A** (order-independent assertions) - recommended approach:

```typescript
// Option A1: Use expect.arrayContaining + toHaveLength
expect(results).toHaveLength(2);
expect(results.map(s => s.frontmatter.id)).toEqual(
  expect.arrayContaining(['story-1', 'story-2'])
);

// Option A2: Sort before comparing (if order doesn't matter semantically)
expect(results.map(s => s.frontmatter.id).sort()).toEqual(['story-1', 'story-2']);
```

**Option B** (guarantee function ordering) should only be used if ordering has semantic meaning for the API.

## Constraints & Edge Cases

- **Filesystem variability**: Different filesystems and OS environments have different directory reading orders
- **Test isolation**: Test fixtures must be created/destroyed in a way that doesn't accidentally create ordering guarantees
- **Semantic ordering**: If a function *should* guarantee ordering (e.g., sorted by date), implement explicit sorting in the function rather than relying on filesystem order
- **Nested arrays**: Watch for nested array structures where order might matter at one level but not another
- **Audit scope**: Limit audit to test files - don't change production code assertions unless they're actually flaky

## Definition of Done

- All acceptance criteria met
- S-0096 tests pass reliably across multiple runs
- Testing documentation updated with clear guidance
- No regressions in other tests
- `make verify` passes

---

## Implementation Summary

### Changes Made

1. **tests/unit/groupings.test.ts:499**: Fixed redundant double-sort
   - Changed: `expect(labels.sort()).toEqual(['epic-test', 'sprint-2024-q1', 'team-backend', 'team-frontend'].sort())`
   - To: `expect(labels).toEqual(['epic-test', 'sprint-2024-q1', 'team-backend', 'team-frontend'])`
   - Rationale: `getUniqueLabels()` explicitly returns alphabetically sorted labels, so sorting expected array was redundant

2. **docs/testing.md**: Added comprehensive guidance (+68 lines)
   - Critical rule about order-independent array assertions
   - Detailed examples showing good and bad patterns:
     - ✅ Good: `.sort()` for simple arrays
     - ✅ Good: `expect.arrayContaining()` for complex matchers
     - ✅ Good: Direct `.toEqual()` for guaranteed ordering (with comments)
     - ❌ Bad: Assuming filesystem order
     - ❌ Bad: Redundant double-sort

### Audit Results

All existing tests were found to already use correct patterns:
- Lines 182, 291, 313, 402: Already use `.sort()` for order-independent assertions
- Line 233: Correctly tests guaranteed priority ordering (5 < 10 < 20)
- Line 519: Correctly tests alphabetically sorted labels from `getUniqueLabels()`
- Lines 649-650: Correctly test guaranteed storyCount descending order

### Verification

- `make verify` passes (lint, build, unit tests, integration tests)
- All 394 tests pass
