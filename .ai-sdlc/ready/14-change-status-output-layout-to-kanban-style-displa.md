---
id: story-mk755q8f-iyz3
title: >-
  Change status output layout to kanban-style: display columns left-to-right
  (Backlog | Ready | In-Progress | Done) instead of top-to-bottom
priority: 14
status: ready
type: feature
created: '2026-01-09'
labels:
  - |-
    ed and visually distinct
    -
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
updated: '2026-01-11'
---
# Change status output layout to kanban-style: display columns left-to-right (Backlog | Ready | In-Progress | Done) instead of top-to-bottom

## Summary

**As a** developer using the AI-SDLC CLI
**I want** to see the story status in a kanban-style board with columns displayed left-to-right
**So that** I can quickly scan the workflow state and get a more intuitive view of story distribution across stages

Currently, the status command displays stories in a top-to-bottom list grouped by status. This should be changed to a side-by-side columnar layout (Backlog | Ready | In-Progress | Done) that better mirrors physical kanban boards and provides a more visual representation of the workflow.

## Acceptance Criteria

- [ ] Status output displays four columns side-by-side: Backlog, Ready, In-Progress, Done
- [ ] Each column header is clearly labeled and visually distinct
- [ ] Stories within each column are displayed vertically (one per line)
- [ ] Column widths adapt to terminal width, with graceful truncation or wrapping for long story titles
- [ ] Empty columns display a message like "(empty)" or similar indicator
- [ ] Story IDs and titles are both displayed for each story entry
- [ ] Layout remains readable on narrow terminals (minimum 80 columns recommended)
- [ ] Color coding is preserved from the current implementation (if applicable)
- [ ] The new layout is the default behavior for the status command

## Edge Cases & Constraints

- **Terminal width constraints**: On very narrow terminals (<80 cols), consider falling back to the original top-to-bottom layout or providing a flag to toggle layout styles
- **Long story titles**: Titles exceeding column width should truncate with ellipsis rather than breaking the layout
- **Uneven column heights**: Columns may have different numbers of stories; shorter columns should not leave visual artifacts
- **Empty workflow states**: Some columns may frequently be empty (e.g., early in project); ensure they still appear with placeholder text
- **Column alignment**: Stories should align within their columns even if IDs have different lengths

## Technical Considerations

- Investigate existing terminal layout libraries (e.g., `cli-table3`, `columnify`, `ink` for React-based CLIs)
- Review current status output implementation in `src/cli/commands.ts`
- Consider extracting layout logic into a separate module for testability
- Ensure output still works when piped or redirected (non-TTY environments)

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->

---

**Effort**: medium

**Labels**: enhancement, cli, ui, status-command
