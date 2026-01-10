---
id: story-test-pattern-001
title: Test pattern detection - warn when tests duplicate production logic
priority: 3
status: backlog
type: feature
created: '2026-01-10'
labels: [quality, testing]
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Test pattern detection - warn when tests duplicate production logic

## Summary

Add detection in the review agent to identify when test files recreate production logic instead of importing and testing actual functions. This is an anti-pattern that causes tests to pass while production code may be broken.

**Problem**: Test files sometimes contain local helper functions that re-implement production logic (e.g., `getPhaseInfoTest()` instead of importing `getPhaseInfo()`). These tests can pass even when production code is broken.

**Solution**: The code review should check for:
1. Test files with functions that mirror production function names (e.g., `*Test` suffix)
2. Production functions that should be exported but aren't (making testing require duplication)
3. Test files that don't import from the file they're testing

## Acceptance Criteria

- [ ] Code review detects test helper functions that duplicate production logic
- [ ] Review flags functions with naming patterns like `functionNameTest` or `testFunctionName`
- [ ] Review suggests exporting production functions when tests can't import them
- [ ] Clear guidance provided: "Export this function and import it in tests instead of duplicating"
- [ ] Low false-positive rate (doesn't flag legitimate test utilities)

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
