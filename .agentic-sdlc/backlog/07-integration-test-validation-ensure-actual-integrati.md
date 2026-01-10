---
id: story-integ-valid-001
title: Integration test validation - ensure tests actually test integration
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
# Integration test validation - ensure tests actually test integration

## Summary

Add validation in the review agent to check that tests in `tests/integration/` actually test component integration, not just types or return values. Tests that only verify types exist should be unit tests.

**Problem**: Tests placed in `tests/integration/` sometimes only check that types exist or methods return strings, without testing actual execution flows or component interaction. This gives false confidence in integration coverage.

**Solution**: The code review should verify integration tests:
1. Actually call functions that execute real logic (not just type checks)
2. Mock external dependencies (ora, file system, etc.)
3. Verify interactions between components (e.g., function A calls function B)
4. Test execution flows, not just return types

## Acceptance Criteria

- [ ] Code review identifies integration tests that only do type checking
- [ ] Review flags tests that don't mock any dependencies
- [ ] Review flags tests that only use `typeof` or check string returns without verifying content
- [ ] Suggests moving type-only tests to unit test location
- [ ] Provides examples of what real integration tests look like

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
