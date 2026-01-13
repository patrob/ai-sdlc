---
id: S-0020
title: Enforce passing tests before marking implementation complete
priority: 29
status: done
type: feature
created: '2026-01-13'
labels:
  - p0-foundation
  - reliability
  - agent-improvement
  - quality-gate
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
slug: enforce-passing-tests-before-implementation-complete
---
# Enforce passing tests before marking implementation complete

## Summary

**As a** developer using ai-sdlc
**I want** the implementation agent to be blocked from completing until all tests pass
**So that** incomplete implementations (with failing tests) don't reach review and waste cycles

Currently, the implementation agent can mark `implementation_complete: true` even when tests are failing. This leads to:
- Failed reviews that could have been caught earlier
- Wasted review cycles on obviously incomplete work
- Recurring pattern of "tests not updated to match new behavior"

## Acceptance Criteria

### Hard Gate Implementation
- [ ] Before setting `implementation_complete: true`, run `npm test` (or configured test command)
- [ ] If any tests fail, DO NOT set `implementation_complete: true`
- [ ] Log clear message: "Implementation blocked: X tests failing. Fix tests before completing."
- [ ] Agent should attempt to fix failing tests (up to 2 retry cycles)
- [ ] If tests still fail after retries, leave story in `in-progress` with clear status

### Prompt Enhancement
- [ ] Update implementation agent system prompt to emphasize: "Test updates are PART of implementation, not a separate phase"
- [ ] Add explicit instruction: "If you change ANY function's behavior, update its tests IMMEDIATELY"
- [ ] Add rule: "NEVER mark implementation_complete if `npm test` shows failures"

### Configuration
- [ ] Add config option: `tdd.requirePassingTestsForComplete: boolean` (default: true)
- [ ] When enabled, hard-block completion on test failures
- [ ] When disabled, warn but allow completion (for edge cases)

### Verification
- [ ] Run `npm run build` as secondary gate (TypeScript must compile)
- [ ] Store test results in story frontmatter: `last_test_run: { passed: boolean, failures: number, timestamp: string }`

## Technical Notes

**Files to modify:**
- `src/agents/implementation.ts` - Add test gate before marking complete
- `src/agents/prompts/` - Update implementation prompts
- `src/types/index.ts` - Add `last_test_run` to StoryFrontmatter
- `src/core/config.ts` - Add `requirePassingTestsForComplete` option

**Implementation hints:**
- Reuse `runVerificationAsync` from `review.ts` for test execution
- Consider adding a `verifyImplementation()` function that runs tests + build
- The gate should run automatically, not require agent to remember

**Complexity:** Small-Medium (1-2 days)

## Out of Scope

- Test coverage thresholds (just pass/fail for now)
- Parallel test execution optimization
- Per-file test targeting (run all tests)
