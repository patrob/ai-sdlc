---
id: S-0062
title: Detect and report existing worktree state
priority: 10
status: backlog
type: feature
created: '2026-01-18'
labels:
  - worktree
  - resume
  - ux
  - p0-critical
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: detect-existing-worktree-state
---
# Detect and report existing worktree state

## User Story

**As a** developer using ai-sdlc
**I want** the system to detect when a worktree already exists for my story
**So that** I receive clear information about the existing work instead of a cryptic failure

## Summary

Currently when a story workflow fails mid-execution, the worktree remains. When users attempt to restart the workflow, it fails with a cryptic git error because the worktree already exists. This story adds detection and clear reporting of existing worktree state.

## Technical Context

**Root Cause** (from Tech Lead analysis):
The workflow fails when:
1. A worktree was created for a story
2. The workflow was interrupted
3. The story frontmatter does NOT have `worktree_path` set (stale state)
4. But the worktree EXISTS on disk at `.ai-sdlc/worktrees/S-XXXX-*`

The current code at `src/core/worktree.ts:150-152` throws when path exists, without checking if it's a resumable worktree for the same story.

**Recommended Implementation** (from Tech Lead):
Before attempting `worktreeService.create()`, use `worktreeService.list()` to check if a worktree already exists for this story. If found, report its state instead of failing.

## Acceptance Criteria

- [ ] When starting a workflow, check if worktree exists for the story ID before attempting creation
- [ ] If worktree exists, display its current state:
  - Branch name
  - Last commit message and timestamp
  - Working directory status (clean, modified, untracked files)
  - Story phase/status from the story file
- [ ] Display a clear message explaining the worktree already exists (not a generic git error)
- [ ] Exit gracefully without attempting to create duplicate worktree
- [ ] Log the detection event for debugging purposes

## Edge Cases

- Worktree exists but branch was deleted (orphaned worktree)
- Worktree directory exists but is not registered in git worktree list
- Worktree path is not accessible (permissions, deleted filesystem)
- Story file exists but worktree doesn't (or vice versa)

## Files to Modify

| File | Changes |
|------|---------|
| `src/cli/commands.ts` | Add worktree detection before creation (lines 1008-1071) |
| `src/core/worktree.ts` | Add `findByStoryId()` method |
| `tests/` | Add tests for detection logic |

## Definition of Done

- [ ] Unit tests verify worktree detection logic
- [ ] Integration tests verify error messaging and graceful exit
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual testing confirms clear, helpful messages
