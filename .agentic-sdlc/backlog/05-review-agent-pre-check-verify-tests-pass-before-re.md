---
id: story-rev-precheck-001
title: Review agent pre-check - verify tests pass before reviewing
priority: 2
status: backlog
type: feature
created: '2026-01-10'
labels: [quality, review-agent]
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Review agent pre-check - verify tests pass before reviewing

## Summary

Add a pre-check to the review agent that verifies `npm test` passes before proceeding with code/security/PO reviews. This prevents wasted review cycles on implementations that have failing tests.

**Problem**: The review agent currently reviews code even when tests are failing, leading to repeated review cycles where the same "tests failing" issue is flagged multiple times.

**Solution**: Before running any reviews, the review agent should:
1. Run `npm test`
2. If tests fail, immediately return a BLOCKER issue without running other reviews
3. Include the test failure output in the response

## Acceptance Criteria

- [ ] Review agent runs `npm test` before starting code/security/PO reviews
- [ ] If tests fail, review returns immediately with BLOCKER status and test output
- [ ] No code/security/PO reviews run when tests are failing (saves time/tokens)
- [ ] Clear message indicates "Fix failing tests before review can proceed"
- [ ] Existing passing-test scenarios continue to work normally

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
