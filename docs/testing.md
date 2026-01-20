# Testing Patterns

## Commands

- `npm test` — Run before completing implementation
- `npm run build` — Verify TypeScript compilation succeeds

## What NOT to Test

- Do NOT create shell scripts for manual testing—use vitest instead
- Do NOT test frameworks or SDKs—trust they work as documented (e.g., don't test that the Claude Agent SDK discovers CLAUDE.md)
- Do NOT test system capabilities (i.e., the file system)

## Test Pyramid

Follow the Testing Pyramid: **many unit tests, fewer integration tests, fewest E2E tests**.

```
        /\
       /  \      E2E Tests (fewest)
      /----\     - Full system workflows
     /      \
    /--------\   Integration Tests (some)
   /          \  - Component boundaries
  /------------\
 /              \ Unit Tests (many)
/________________\ - Individual functions/modules
```

## Unit Tests (the foundation)

- Test individual functions, classes, and modules in isolation
- Fast, deterministic, no external dependencies
- Colocate with the files they test (e.g., `src/core/story.ts` → `src/core/story.test.ts`)
- Mock external dependencies (file system, network, etc.)
- Should cover edge cases, error conditions, and happy paths

## Integration Tests (the middle layer)

- Place in `tests/integration/` when testing multiple components together
- The `tests/` directory is for integration tests, test utilities, helpers, and fixtures
- Test that components work together correctly at boundaries
- More expensive to run, so be selective

### When to Write an Integration Test

- Testing CLI command execution flow (mocking ora, verifying spinner behavior)
- Testing file system operations across multiple services
- Testing that configuration loading integrates with dependent components
- Testing error propagation across module boundaries
- Verifying that mocked dependencies are called with correct arguments during real execution flows

### When NOT to Write an Integration Test

- Testing pure logic that can be unit tested
- Testing return values or types (that's a unit test)
- Testing third-party libraries or frameworks
- Testing individual function behavior in isolation

## Critical Rules

- **Export testable functions**: Never recreate production logic in tests. Export functions from production code and import them in tests
- **Integration tests must test integration**: Tests in `tests/integration/` must mock dependencies and verify actual execution flows (e.g., mock `ora`, call `executeAction()`, verify spinner methods called). Tests that only check types/return values are unit tests—name them accordingly
- **Mock dates in tests**: When testing code that uses `Date` or timestamps, always use mocked dates (e.g., `vi.useFakeTimers()`, `vi.setSystemTime()`). Each test should have its own isolated mocked date to prevent timing-related flakiness and ensure deterministic results
- **Prefer `process.nextTick` over `setTimeout`**: When testing async code that needs to yield to the event loop, use `await new Promise(resolve => process.nextTick(resolve))` instead of `setTimeout`. `process.nextTick` runs at the end of the current event loop phase (before I/O), making tests faster and more deterministic than `setTimeout` which schedules for the next event loop iteration
- **Use order-independent assertions for arrays**: When testing functions that return arrays without guaranteed order (e.g., filesystem queries via `glob.sync()`), use order-independent assertions to prevent flaky tests across different operating systems and filesystem implementations:
  - **Preferred for simple arrays**: Sort before comparing: `expect(arr.sort()).toEqual(expected.sort())` or `expect(arr.sort()).toEqual(['a', 'b'])` if expected is already sorted
  - **For complex matchers**: Use `expect.arrayContaining()` with a length check: `expect(arr).toHaveLength(n)` + `expect(arr).toEqual(expect.arrayContaining([...]))`
  - **For guaranteed ordering**: Only use direct `expect(arr).toEqual([...])` when the function explicitly guarantees order (e.g., sorted by priority, alphabetically sorted). Add a comment explaining why order is expected
  - **Anti-pattern**: Never sort both sides of the comparison when one side is already a literal array: `expect(arr.sort()).toEqual(['a', 'b'].sort())` — the right side is redundant

## Array Assertion Examples

### When Order Doesn't Matter

**✅ Good - Sort before comparing (simple arrays):**
```typescript
// Testing filesystem query results
const results = findStoriesByLabel(sdlcRoot, 'epic-test');
expect(results.map(s => s.frontmatter.id).sort()).toEqual(['story-1', 'story-2']);
```

**✅ Good - expect.arrayContaining (complex matchers):**
```typescript
// Testing array with complex objects, allowing extra elements
expect(results).toHaveLength(2);
expect(results).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ id: 'story-1' }),
    expect.objectContaining({ id: 'story-2' })
  ])
);
```

**❌ Bad - Assumes filesystem order:**
```typescript
// FLAKY: Fails when filesystem returns stories in different order
const results = findStoriesByLabel(sdlcRoot, 'epic-test');
expect(results.map(s => s.frontmatter.id)).toEqual(['story-1', 'story-2']);
```

**❌ Bad - Redundant double-sort:**
```typescript
// Pointless: why sort a literal array?
expect(labels.sort()).toEqual(['alpha', 'beta'].sort());

// Better:
expect(labels.sort()).toEqual(['alpha', 'beta']);
```

### When Order DOES Matter

**✅ Good - Guaranteed ordering with comment:**
```typescript
// findStoriesByLabel() explicitly sorts by priority ascending
const results = findStoriesByLabel(sdlcRoot, 'epic-test');
expect(results.map(s => s.frontmatter.id)).toEqual(['high-priority', 'low-priority']);
```

**✅ Good - Testing explicit sorting behavior:**
```typescript
// getUniqueLabels() returns alphabetically sorted labels
const labels = getUniqueLabels(sdlcRoot);
expect(labels).toEqual(['alpha', 'beta', 'gamma']);
```

**✅ Good - Testing sort order descending:**
```typescript
// getGroupings() sorts by storyCount descending
const groupings = getGroupings(sdlcRoot, 'thematic');
expect(groupings.map(g => g.id)).toEqual(['c', 'b', 'a']);
expect(groupings.map(g => g.storyCount)).toEqual([3, 2, 1]);
```
