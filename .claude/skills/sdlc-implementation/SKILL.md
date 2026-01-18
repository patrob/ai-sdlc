---
name: sdlc-implementation
description: Use when implementing features, writing code, executing implementation plans, practicing TDD, or making code changes based on a plan.
---

# SDLC Implementation Skill

This skill provides guidance for executing implementation plans effectively during the SDLC implementation phase.

## Overview

Implementation transforms plans into working code. The goal is to execute systematically, write tests alongside code, and ensure all changes integrate cleanly with the existing codebase.

## Implementation Methodology

### Standard Implementation Flow

1. **Read the plan** - Understand what you're building before writing code
2. **Follow existing patterns** - Match the codebase style and conventions
3. **Write tests alongside code** - Tests are part of implementation, not separate
4. **Verify continuously** - Run tests frequently, don't batch verification
5. **Commit incrementally** - Small, focused commits for each completed task

### TDD Implementation Flow (When Enabled)

Follow the strict RED-GREEN-REFACTOR cycle:

#### 🔴 RED Phase
1. Write ONE failing test that expresses the next acceptance criterion
2. The test MUST fail because the functionality doesn't exist
3. Run the test and verify it fails
4. Explain why it fails and what it's testing

#### 🟢 GREEN Phase
1. Write the MINIMUM code to make this ONE test pass
2. Do NOT add extra features or optimizations
3. Run the test to verify it passes
4. Run ALL tests to ensure nothing broke

#### 🔵 REFACTOR Phase
1. Look for improvements (DRY, clarity, performance)
2. Make changes ONLY if tests stay green
3. Run ALL tests after each change

**Critical TDD Rules:**
- NEVER write implementation code before writing a test
- Each test should verify ONE specific behavior
- Tests must fail before implementation (verify the test is testing something)
- After GREEN phase, run ALL tests to check for regressions
- REFACTOR phase is optional but should not change behavior

## Quality Standards

### Code Quality Checklist

Before marking a task complete:

- [ ] Code follows existing codebase patterns
- [ ] Functions have clear, single responsibilities
- [ ] Error handling is implemented where appropriate
- [ ] No hardcoded secrets or sensitive data
- [ ] No debug logging or commented-out code left behind
- [ ] Imports are organized and unused imports removed

### Test Quality Checklist

- [ ] Tests cover happy path scenarios
- [ ] Tests cover error/edge cases
- [ ] Tests are colocated with source files (`src/foo.ts` → `src/foo.test.ts`)
- [ ] Tests use mocked dates when testing time-dependent code
- [ ] Tests don't recreate production logic (import from source)
- [ ] Tests are deterministic (no flaky behavior)

## Test Co-location Pattern

Follow the testing pyramid with colocated unit tests:

```
src/
  services/
    auth.ts              # Production code
    auth.test.ts         # Unit tests (colocated)
  utils/
    validation.ts        # Production code
    validation.test.ts   # Unit tests (colocated)

tests/
  integration/           # Integration tests only
    auth-flow.test.ts    # Cross-component tests
```

### Unit Test Guidelines

- **Colocate with source** - `src/foo.ts` tests in `src/foo.test.ts`
- **Fast and isolated** - No external dependencies, mock everything
- **Test one thing** - Each test verifies one behavior
- **Deterministic** - Same input always produces same output

### Integration Test Guidelines

- Place in `tests/integration/`
- Test component boundaries and real execution flows
- Mock external services but test internal integration
- More expensive - be selective about what needs integration testing

## Handling Test Failures

When tests fail during implementation, DO NOT give up or mark as blocked. Instead:

1. **Analyze the failure output** - Read the error messages carefully
2. **Identify root cause** - Is it a bug in production code, mock setup, or test logic?
3. **Fix the implementation** - Usually the production code needs fixing (tests caught a bug)
4. **Re-run tests** - Verify the fix works
5. **Repeat** - Continue until all tests pass

### Common Failure Patterns

| Error Pattern | Likely Cause | Fix |
|--------------|--------------|-----|
| "expected X to be Y" | Implementation logic error | Check the production code, not the test |
| "undefined is not a function" | Missing import or wrong signature | Verify imports and function signatures |
| Mock not called | Dependency injection not wired | Pass mocked deps through to inner functions |
| Timeout | Missing await or infinite loop | Check async code and loop conditions |

## Export Testable Functions

**Critical:** Never recreate production logic in tests. Export functions from production code and import them in tests.

```typescript
// ❌ BAD - Recreating logic in test
test('calculates total', () => {
  // Recreating the formula from production code
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  expect(result).toBe(total);
});

// ✅ GOOD - Import from production
import { calculateTotal } from './cart.js';

test('calculates total', () => {
  const result = calculateTotal(items);
  expect(result).toBe(150); // Known expected value
});
```

## Mock Dates in Tests

When testing time-dependent code, always use mocked dates:

```typescript
import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-01-15T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

test('creates timestamp', () => {
  const result = createRecord();
  expect(result.createdAt).toBe('2025-01-15T10:00:00.000Z');
});
```

## Anti-Patterns to Avoid

1. **Documentation-only implementation** - Writing plans/notes instead of actual code changes to `src/`. This is the most common failure mode.

2. **Test-last development** - Writing all implementation then all tests. Tests and code should be written together.

3. **Ignoring test failures** - Don't skip failing tests. Fix them or understand why they fail.

4. **Over-engineering** - Write the minimum code needed. Don't add features not in the plan.

5. **Batch verification** - Don't wait until the end to run tests. Run them after each task.

6. **Skipping the plan** - Don't improvise. Follow the implementation plan systematically.

## Implementation Verification

Before marking implementation complete, verify:

1. **Source code changed** - Actual `.ts`/`.js` files in `src/` were modified
2. **Tests written** - New tests exist for new functionality
3. **All tests pass** - `npm test` shows 0 failures
4. **Build succeeds** - `npm run build` completes without errors
5. **Plan tasks checked** - All plan checkboxes are marked complete

## Tips for Effective Implementation

- **Start with the simplest task** - Build momentum with quick wins
- **Read existing code first** - Understand patterns before writing new code
- **Write tests immediately** - Don't defer testing to "later"
- **Commit after each task** - Small commits are easier to review and revert
- **Ask when stuck** - Unclear requirements should be clarified, not guessed
- **Follow DRY** - If you write similar code 3+ times, extract to a utility
