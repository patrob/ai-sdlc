---
id: story-mkb3z7uu-vphu
title: Fix daemon watch mode - stories immediately complete without executing actions
priority: 1
status: backlog
type: feature
created: '2026-01-12'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Fix daemon watch mode - stories immediately complete without executing actions

## Summary

When running `ai-sdlc run --auto --watch`, stories are detected but immediately marked as "Workflow completed" without executing any actions (research, plan, implement, etc.). The daemon shows:

```
New story detected: 13-reset-rpiv-cycle-on-review-rejection-fresh-researc.md
  Starting workflow for: 13-reset-rpiv-cycle-on-review-rejection-fresh-researc
  Workflow completed: 13-reset-rpiv-cycle-on-review-rejection-fresh-researc
Queue empty, waiting for new stories...
```

No actual agent actions are executed between "Starting workflow" and "Workflow completed".

## Investigation Notes

### Attempted Fixes (alpha.5-alpha.7)
1. **storyId mismatch fix** - Changed `processStory()` to use `frontmatter.id` instead of filename for action matching. Verified locally that action matching works correctly.
2. **Error handling** - Added try-catch around `parseStory()` to catch file read errors.

### Verified Working
- `assessState()` returns correct recommended actions with correct storyIds
- `parseStory()` correctly extracts `frontmatter.id`
- Action matching logic (`action.storyId === storyId`) works in isolation
- Local daemon test shows stories being detected and workflow starting

### Still Unknown
- Why published npm package behaves differently than local
- Whether npx caching is involved despite using `--yes` and explicit version
- Whether there's a timing issue with chokidar file detection

## Acceptance Criteria

- [ ] `ai-sdlc run --auto --watch` processes stories through complete workflow
- [ ] Stories progress: backlog → ready → in-progress → done
- [ ] Agent actions (research, plan, implement, review) execute with visible output
- [ ] "Starting workflow for:" shows frontmatter.id (e.g., `story-xxxx`), not filename

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
