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
