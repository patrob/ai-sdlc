---
id: story-review-test-align
title: Add test-alignment pre-check to review agent
priority: 30
status: backlog
type: feature
created: '2026-01-13'
labels:
  - p1-production
  - reliability
  - agent-improvement
  - review
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Add test-alignment pre-check to review agent

## Summary

**As a** developer using ai-sdlc
**I want** the review agent to automatically check test-implementation alignment before reviewing code
**So that** misaligned tests are caught as blockers before wasting review cycles on code quality

Even with implementation gates, tests can become misaligned with code. The review agent should explicitly verify:
1. Tests exist for changed code
2. Tests verify NEW behavior (not old)
3. All tests pass

## Acceptance Criteria

### Pre-Review Test Check
- [ ] Before starting code review, run `npm test`
- [ ] If tests fail, immediately return `REJECTED` with severity `BLOCKER`
- [ ] Rejection message includes: failure count, failed test names, suggestion to update tests
- [ ] Category for this rejection: `test_alignment`

### Test-Implementation Alignment Analysis
- [ ] Review agent prompt includes explicit checklist:
  - "Are there test files that reference the changed production code?"
  - "Do those tests verify the NEW behavior (not the old)?"
  - "If behavior changed, were corresponding tests updated?"
- [ ] If agent detects tests verifying OLD behavior, flag as `BLOCKER`

### Review Prompt Updates
- [ ] Add "Test-Implementation Alignment" section to review prompts
- [ ] Make test alignment a BLOCKER category (not just a suggestion)
- [ ] Include example of what misaligned tests look like

### Feedback Quality
- [ ] When rejecting for test alignment, provide specific guidance:
  - Which test files need updating
  - What the old vs new expected behavior is
  - Example of correct test assertion

## Technical Notes

**Files to modify:**
- `src/agents/review.ts` - Add pre-check before `runCodeReview()`
- `src/agents/prompts/review.ts` - Add test alignment checklist
- `src/types/index.ts` - Add `test_alignment` to rejection categories if not present

**Implementation hints:**
- Run test check FIRST, before any LLM calls (save tokens on obvious failures)
- Parse test output to extract failed test names for better feedback
- Consider caching test results if review is retried quickly

**Review prompt addition:**
```markdown
## Test-Implementation Alignment (BLOCKER if failed)

Before reviewing code quality, verify:
1. Run `npm test` - all tests must pass
2. For each changed function, verify its tests check NEW behavior
3. If tests still verify OLD behavior that was intentionally changed:
   - This is a BLOCKER
   - Tests must be updated before code review proceeds
   - Return rejection with category: 'test_alignment'
```

**Complexity:** Small (1-2 days)

## Out of Scope

- Automatic test generation
- Test coverage analysis
- Identifying which specific tests cover which functions (just run all)
