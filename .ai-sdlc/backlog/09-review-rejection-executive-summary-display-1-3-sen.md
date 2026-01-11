---
id: story-mk8ro046-pr6z
title: >-
  Review rejection executive summary - Display 1-3 sentence summary of why
  review was rejected in terminal UI
priority: 9
status: backlog
type: feature
created: '2026-01-10'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Review rejection executive summary - Display 1-3 sentence summary of why review was rejected in terminal UI

## Summary

As a developer using the agentic-sdlc CLI, when a review is rejected, I want to see a brief executive summary (1-3 sentences) explaining why the review failed, so that I can quickly understand what needs to be fixed without having to dig through verbose output.

**Current behavior:** The terminal shows "Review rejected with X issues" but doesn't provide insight into what the actual problems are.

**Desired behavior:** After showing the rejection status, display a concise summary like:
```
✗ Review rejected (3 issues)
  Summary: Tests are failing due to undefined variable errors. Also found a potential SQL injection vulnerability in the user query handler.
```

## Acceptance Criteria

- [ ] When review is rejected, generate a 1-3 sentence executive summary from the issues list
- [ ] Display the summary immediately after the rejection status in the terminal
- [ ] Summary should prioritize blocker/critical issues over minor ones
- [ ] Summary should be human-readable and actionable (not just listing categories)
- [ ] Works for both automated (`--auto`) and interactive modes

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
