---
id: S-0056
title: Enforce build-before-test in verification agent
priority: 2
status: backlog
type: bug
created: '2026-01-17'
labels:
  - p1-production
  - verification-agent
  - build
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: build-before-test-enforcement
---
# Enforce build-before-test in verification agent

## User Story

**As a** developer using the ai-sdlc verification workflow
**I want** tests to be skipped when the build fails
**So that** I get clear feedback on what to fix first (build errors) instead of confusing test failures

## Summary

Currently, the verification agent runs tests even when `npm run build` fails. This causes confusing error output where build errors are mixed with test failures, leading the implementation agent to attempt fixes on test failures that would have resolved with a successful build.

**Root Cause Analysis:** From `src/agents/verification.ts:164-236`, tests and build run independently:
```typescript
// Tests run first
if (config.testCommand) { testsRan = true; ... }
// Build runs after
if (config.buildCommand) { buildRan = true; ... }
```

When TypeScript compilation fails, tests may fail for unrelated reasons (modules not found, type errors at runtime). The agent then attempts to fix test failures that would have resolved with a successful build.

## Business Value

- **Clearer error messages**: Only build errors shown when build fails
- **Faster feedback loops**: Skip unnecessary test runs
- **Reduced cognitive load**: Developers and agents focus on one problem at a time

## Acceptance Criteria

- [ ] When `npm run build` fails, verification agent immediately returns failure without running tests
- [ ] Verification output clearly states "Build failed - skipping tests"
- [ ] When build succeeds, tests run as normal (no behavior change)
- [ ] Exit codes are preserved (build failure returns specific exit code)
- [ ] Integration test verifies short-circuit behavior

## Technical Notes

**Files to modify:**
- `src/agents/verification.ts` - Add build-first check with short-circuit

**Implementation Approach:**
```typescript
// Pseudocode for verification.ts
export async function verifyImplementation(...) {
  // Run build FIRST
  if (config.buildCommand) {
    buildRan = true;
    const buildResult = await runCommandAsync(config.buildCommand, ...);
    buildPassed = buildResult.success;
    buildOutput = buildResult.output;

    // Short-circuit: Don't run tests if build failed
    if (!buildPassed) {
      return {
        passed: false,
        failures: 0,
        timestamp,
        testsOutput: 'Build failed - skipping tests. Fix TypeScript errors first.',
        buildOutput,
      };
    }
  }

  // Only run tests after successful build
  if (config.testCommand) {
    testsRan = true;
    // ... existing test logic
  }
}
```

**Edge Cases:**
- Project with no build command (tests should still run)
- Build succeeds but tests fail (normal behavior, return test failures)
- Build times out (should still short-circuit, not run tests)

## Out of Scope

- Parallel test execution
- Build caching or incremental builds
- Test-only mode that skips build
- Custom error formatting for different test frameworks

## Testing Strategy

**Unit tests:**
- `verifyImplementation()` skips tests when build fails
- `verifyImplementation()` runs tests when build succeeds
- Verification result includes correct message when short-circuiting

**Integration tests:**
- End-to-end test with failing build shows "skipping tests" message
- End-to-end test with passing build shows test results

## Definition of Done

- [ ] Verification flow short-circuits on build failure
- [ ] Unit tests for short-circuit logic
- [ ] Integration test with failing/passing builds
- [ ] `make verify` passes
- [ ] Documentation updated if verification behavior changed

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
