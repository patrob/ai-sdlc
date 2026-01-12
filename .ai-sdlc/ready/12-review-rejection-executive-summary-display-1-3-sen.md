---
id: story-mk8ro046-pr6z
title: >-
  Review rejection executive summary - Display 1-3 sentence summary of why
  review was rejected in terminal UI
priority: 12
status: ready
type: feature
created: '2026-01-10'
labels:
  - s
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
updated: '2026-01-11'
---
# Review rejection executive summary - Display 1-3 sentence summary of why review was rejected in terminal UI

## User Story

As a developer using the agentic-sdlc CLI, I want to see a brief executive summary (1-3 sentences) explaining why a review was rejected, so that I can quickly understand what needs to be fixed without reading through verbose output or checking separate files.

## Context

**Current behavior:** The terminal shows "Review rejected (X issues)" but doesn't provide insight into what the actual problems are, forcing developers to read through detailed review output or open files to understand what went wrong.

**Desired behavior:** After showing the rejection status, display a concise summary that highlights the most critical issues:
```
✗ Review rejected (3 issues)
  Summary: Tests are failing due to undefined variable errors in auth.test.ts. 
  Also found a potential SQL injection vulnerability in the user query handler.
```

## Acceptance Criteria

- [ ] When review is rejected, generate a 1-3 sentence executive summary from the review issues
- [ ] Display the summary immediately after the rejection status in the terminal UI (not hidden in logs)
- [ ] Summary prioritizes issues by severity: blockers/critical first, then high, then medium/low
- [ ] Summary is human-readable and actionable (describes actual problems, not just categories like "security issue found")
- [ ] Summary limits to 1-3 sentences total (not per issue), truncating gracefully if many issues exist
- [ ] Works for both automated (`--auto`) and interactive modes
- [ ] If review has no issues but still rejected (edge case), show generic message
- [ ] Summary text wraps appropriately for terminal width (doesn't break formatting)

## Edge Cases & Constraints

**Edge Cases:**
- Review rejected with 0 specific issues (system error, timeout, etc.) - should show fallback message
- Review with 10+ issues - summary should mention top 2-3 and indicate "...and X more issues"
- Very long issue descriptions - truncate individual issue text while keeping summary under 3 sentences
- Issues without severity levels - treat as medium priority
- All issues are same severity - pick first 2-3 by order

**Constraints:**
- Must not break existing terminal formatting (spinner, colors, indentation)
- Summary generation should be fast (<100ms) - avoid complex NLP or LLM calls
- Should integrate with existing review result types (don't require new data structures if avoidable)
- Must respect terminal width for proper wrapping (use existing terminal utility if available)

**Technical Considerations:**
- Review result structure may contain issues in various formats - need consistent parsing
- May need to add summary generation utility function (e.g., `generateReviewSummary()`)
- Should reuse existing severity/priority logic if implemented elsewhere
- Consider updating `ReviewResult` type if it needs to carry the summary

## Related Code Areas

- `src/cli/commands.ts` - `executeAction()` for 'review' action
- `src/types/index.ts` - `ReviewResult` and related types
- Review agent prompt/implementation - where issues are collected
- Terminal formatting utilities - for consistent display

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->

---

**Effort:** medium

**Labels:** enhancement, cli-ux, review-workflow, developer-experience
