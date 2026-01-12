---
id: story-integ-valid-001
title: Integration test validation - ensure tests actually test integration
priority: 11
status: ready
type: feature
created: '2026-01-10'
labels:
  - quality
  - testing
  - s
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
updated: '2026-01-11'
---
# Integration test validation - ensure tests actually test integration

## User Story

**As a** developer working on the ai-sdlc project,  
**I want** the review agent to validate that integration tests actually test component integration,  
**So that** I can have confidence that tests in `tests/integration/` provide real integration coverage rather than just type checking.

## Problem Statement

Tests placed in `tests/integration/` sometimes only check that types exist or methods return strings, without testing actual execution flows or component interaction. This creates false confidence in integration test coverage and violates the project's testing philosophy that integration tests should verify interactions between components with mocked dependencies.

## Acceptance Criteria

### Core Validation Rules
- [ ] Review agent identifies integration tests that only perform type checking (e.g., `typeof === 'string'`)
- [ ] Review agent flags tests that don't mock any external dependencies (ora spinners, file system, network calls)
- [ ] Review agent flags tests that check return types without verifying actual content or behavior
- [ ] Review agent verifies integration tests demonstrate interactions between multiple components

### Detection Patterns
- [ ] Detects tests using only `typeof` checks without execution verification
- [ ] Detects tests that import functions but never call them with realistic scenarios
- [ ] Detects missing mocks for known external dependencies (ora, fs, execa, etc.)
- [ ] Detects tests that don't use test doubles (mocks, spies, stubs) to verify interactions

### Feedback Quality
- [ ] Provides clear explanation of why a test is considered unit-level rather than integration-level
- [ ] Suggests specific file location for unit tests (colocated with source, e.g., `src/cli/commands.test.ts`)
- [ ] Includes concrete examples of proper integration test patterns from the codebase
- [ ] Links to project testing philosophy in CLAUDE.md

### Examples in Feedback
- [ ] Shows before/after comparison of type-only test vs. proper integration test
- [ ] Demonstrates proper use of mocks to verify component interactions
- [ ] Illustrates testing execution flows (e.g., "verify spinner.start() called, then executeAction(), then spinner.succeed()")

## Constraints & Edge Cases

### Scope Limitations
- Only applies to tests in `tests/integration/` directory
- Unit tests (colocated with source) can perform simple type checks - that's their purpose
- Should not flag integration tests that DO test execution flows even if they include some type assertions

### Edge Cases to Consider
1. **Hybrid tests**: Tests that do both type checking AND integration testing should pass validation
2. **Setup/teardown type checks**: Simple type assertions in test setup are acceptable if the test body does real integration work
3. **Factory functions**: Tests of test utilities/factories may legitimately only check types
4. **False positives**: Sophisticated mocking might not be obvious from static analysis alone

### Technical Constraints
- Review agent has access to file contents but limited runtime analysis capability
- Must rely on pattern matching and heuristics rather than executing tests
- Should not require specific testing library patterns (allow flexibility in test authoring)

## Implementation Guidance

### Detection Strategy
1. Parse test files in `tests/integration/` directory
2. Look for anti-patterns:
   - Only `typeof` checks or `.toBe('string')` type assertions
   - No `vi.mock()`, `vi.spyOn()`, or similar mocking constructs
   - No verification of method calls (`.toHaveBeenCalled()`, `.toHaveBeenCalledWith()`)
   - Importing functions but not exercising their logic paths
3. Score test quality based on presence of integration indicators

### Integration Test Indicators (should be present)
- Mocking of external dependencies
- Verification of interactions between components
- Testing of execution flows/control flow
- Assertions on behavior, not just types
- Use of spies to verify side effects

### Review Output Format
```markdown
## Integration Test Quality

⚠️ Potential unit-level test in integration directory:
- File: tests/integration/example.test.ts
- Issue: Only uses typeof checks, no mocked dependencies
- Suggestion: Move to src/example/example.test.ts or add mocks and verify interactions
- Example: [link to good integration test pattern]
```

## Related Context

- Project testing philosophy: CLAUDE.md specifies unit tests should be colocated, integration tests verify component interaction
- Existing patterns: Review code in `tests/integration/` for positive examples
- Testing framework: Uses vitest with vi.mock() and vi.spyOn() for test doubles

---

**Effort**: medium  
**Labels**: code-review, testing, quality-assurance, integration-tests, technical-debt
