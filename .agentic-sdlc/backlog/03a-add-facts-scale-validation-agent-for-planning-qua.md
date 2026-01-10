---
id: story-68074435-f961
title: Add FACTS scale validation agent for planning quality
priority: 2.5
status: backlog
type: feature
created: '2026-01-10'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Add FACTS scale validation agent for planning quality

## Summary

Add a separate validation agent that evaluates planning output using the FACTS scale (Feasibility/Atomicity/Clarity/Testability/Scope, scored 0-5). If validation fails (score < 4), planning is automatically retried up to 3 times. If validation continues to fail, the story is marked as blocked.

**Depends on**: Story 03 (TDD planning improvements) should be completed first.

**Reference**: See RPI plugin for the FACTS validation patterns.

## Acceptance Criteria

- [ ] New validation agent evaluates planning output using FACTS scale (Feasibility/Atomicity/Clarity/Testability/Scope scores 0-5)
- [ ] Validation runs automatically after planning completes
- [ ] If FACTS score is below 4/5, planning is retried automatically (max 3 retries)
- [ ] Validation feedback is provided to planning agent on retry to improve output
- [ ] If all 3 retries fail validation, story enters a "blocked" status with validation failure reason
- [ ] Existing tests pass and new tests cover the validation functionality

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
