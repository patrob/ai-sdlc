---
id: S-0061
title: Implementation agent fails to recognize incorrect test expectations
priority: 30
status: backlog
type: bug
created: '2026-01-18'
labels:
  - agent-behavior
  - test-writing
  - retry-logic
  - implementation-phase
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: agent-incorrect-test-expectations
---
# Implementation agent fails to recognize incorrect test expectations

## User Story

**As a** developer using ai-sdlc automation
**I want** the implementation agent to recognize when test expectations are wrong
**So that** the agent doesn't waste retries trying to "fix" correct implementations

## Summary

When the implementation agent writes tests with incorrect expected values, subsequent test failures cause the agent to repeatedly try to "fix" the implementation code rather than recognizing that the test expectation itself is wrong. This leads to:

1. Wasted retry attempts (observed: 4 retries before giving up)
2. Implementation phase failures despite correct code
3. Manual intervention required to fix trivial test assertion issues

## Bug Evidence

**Discovered in S-0058** (Auto-complete missing PR creation):

The agent wrote a test for `escapeShellArg` with an incorrect expected value:

```typescript
// Agent wrote (incorrect):
expect(result).toBe("''\\'' rm -rf /; echo '\\'''");
// Missing semicolon after escaped quote

// Correct expectation:
expect(result).toBe("''\\'';" + " rm -rf /; echo " + "'\\'''");
```

The implementation was correct, but the agent:
1. Saw "expected X to be Y" assertion error
2. Assumed the implementation was wrong (per CLAUDE.md guidance)
3. Tried to fix the implementation 4 times
4. Never considered the test expectation might be wrong
5. Eventually gave up, marking implementation as blocked

## Root Cause Analysis

The CLAUDE.md instructions include:
> "expected X to be Y" -> Check the implementation logic, not the test expectation

This is good general guidance, but it doesn't account for cases where:
1. The agent just wrote the test (so the expectation is more likely wrong)
2. The same assertion error repeats across multiple retries
3. Complex string transformations make expectations error-prone

## Acceptance Criteria

- [ ] Agent verifies test expected values before writing (e.g., console.log actual output)
- [ ] Agent detects "same assertion error repeatedly" pattern
- [ ] Agent considers whether test expectation might be wrong after 2+ identical failures
- [ ] CLAUDE.md guidance updated to handle self-written test expectations
- [ ] For complex string transformations, agent uses snapshot testing or computed expectations

## Proposed Solutions

### Option A: Pre-verify Expected Values
Before writing test assertions for complex transformations, the agent should:
1. Run the function with the input
2. Log the actual output
3. Use that output as the expected value

### Option B: Pattern Detection in Retry Logic
The implementation retry logic should detect:
- Same test failing with same assertion error
- Suggest: "Test expectation may be incorrect" after 2 failures
- Allow agent to fix test expectation instead of implementation

### Option C: Computed Expectations
For shell escaping and similar transformations:
```typescript
it('should escape command injection attempts', () => {
  const malicious = "'; rm -rf /; echo '";
  const result = escapeShellArg(malicious);
  // Compute expected value programmatically
  const expected = "'" + malicious.replace(/'/g, "'\\''") + "'";
  expect(result).toBe(expected);
});
```

## Technical Notes

- The `escapeShellArg` function was working correctly
- Test failure was purely a typo in the expected value string
- Manual fix took ~30 seconds; agent spent 4 retries over several minutes
