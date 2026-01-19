---
id: S-0111
title: Fix order-dependent array assertions in unit tests
priority: 2
status: backlog
type: bug
created: '2026-01-19'
labels:
  - testing
  - flaky-test
  - test-patterns
dependencies: []
---
# Fix order-dependent array assertions in unit tests

## Bug Summary

Unit tests that use `.toEqual()` on arrays fail non-deterministically because the underlying functions return results in filesystem order, which is not guaranteed to be consistent across runs or environments.

## Root Cause

Tests assert exact array order using `.toEqual(['item-1', 'item-2'])` when the function being tested doesn't guarantee any particular ordering. File system directory reading order varies between:
- Operating systems (macOS vs Linux vs Windows)
- File system types (APFS vs ext4 vs NTFS)
- Timing of file creation
- inode allocation

## Example Failure

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

Error:
```
AssertionError: expected [ 'story-2', 'story-1' ] to deeply equal [ 'story-1', 'story-2' ]
```

## Affected Tests

4 tests in `tests/unit/groupings.test.ts`:
- `findStoriesByLabel > should return stories with exact label match`
- `findStoriesByLabels > mode: all > should return stories with all specified labels`
- `findStoriesByLabels > mode: any > should return stories with at least one specified label`
- `findStoriesByPattern > should match stories with wildcard patterns`

## Proposed Solutions

### Option A: Use order-independent assertions (Recommended)

```typescript
// Option A1: Use expect.arrayContaining + toHaveLength
expect(results).toHaveLength(2);
expect(results.map(s => s.frontmatter.id)).toEqual(
  expect.arrayContaining(['story-1', 'story-2'])
);

// Option A2: Sort before comparing
expect(results.map(s => s.frontmatter.id).sort()).toEqual(['story-1', 'story-2']);

// Option A3: Use individual contains assertions
expect(results.map(s => s.frontmatter.id)).toContain('story-1');
expect(results.map(s => s.frontmatter.id)).toContain('story-2');
```

### Option B: Guarantee function ordering

If ordering matters semantically, the function should explicitly sort results:

```typescript
// In src/core/groupings.ts
export function findStoriesByLabel(sdlcRoot: string, label: string): Story[] {
  const stories = findAllStories(sdlcRoot);
  return stories
    .filter(s => s.frontmatter.labels.includes(label))
    .sort((a, b) => a.frontmatter.id.localeCompare(b.frontmatter.id)); // Explicit sort
}
```

## Acceptance Criteria

- [ ] All 4 failing tests in S-0096 pass reliably (10 consecutive runs)
- [ ] Update `docs/testing.md` with guidance on order-independent array assertions
- [ ] Audit existing tests for similar patterns (grep for `.toEqual([` with array literals)
- [ ] `make verify` passes

## Guidance to Add to docs/testing.md

Add to the "Critical Rules" section:

```markdown
- **Use order-independent assertions for arrays**: When testing functions that return arrays without guaranteed order (e.g., file system queries), use order-independent assertions:
  - `expect(arr).toHaveLength(n)` + `expect(arr).toEqual(expect.arrayContaining([...]))`
  - Or sort both arrays before comparing: `expect(arr.sort()).toEqual(expected.sort())`
  - Avoid `expect(arr).toEqual([...])` unless order is explicitly guaranteed by the function
```

## Impact

This bug blocks S-0096 (Story Grouping Query Infrastructure) from completing implementation phase. The worktree has uncommitted work that cannot pass `make verify` due to these test failures.

## Definition of Done

- [ ] S-0096 tests pass reliably
- [ ] Testing documentation updated
- [ ] No regressions in other tests
- [ ] `make verify` passes
