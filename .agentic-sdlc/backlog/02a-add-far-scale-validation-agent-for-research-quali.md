---
id: story-68074184-15b1
title: Add FAR scale validation agent for research quality
priority: 1.5
status: backlog
type: feature
created: '2026-01-10'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Add FAR scale validation agent for research quality

## Summary

Add a separate validation agent that evaluates research output using the FAR scale (Factual/Actionable/Relevant, scored 0-5). If validation fails (score < 4), research is automatically retried up to 3 times. If validation continues to fail, the story is marked as blocked.

**Depends on**: Story 02 (codebase-first research) should be completed first.

**Reference**: See `/Users/probinson/.claude/plugins/cache/on-par/rpi/0.6.0/commands/validate-research.md` for the validation patterns.

## Acceptance Criteria

- [ ] New validation agent evaluates research output using FAR scale (Factual/Actionable/Relevant scores 0-5)
- [ ] Validation runs automatically after research completes
- [ ] If FAR score is below 4/5, research is retried automatically (max 3 retries)
- [ ] Validation feedback is provided to research agent on retry to improve output
- [ ] If all 3 retries fail validation, story enters a "blocked" status with validation failure reason
- [ ] Existing tests pass and new tests cover the validation functionality

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
