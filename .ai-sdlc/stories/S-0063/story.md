---
id: S-0063
title: Resume work in existing worktree
priority: 10
status: backlog
type: feature
created: '2026-01-18'
labels:
  - worktree
  - resume
  - workflow
  - p0-critical
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: resume-work-existing-worktree
depends_on:
  - S-0062
---
# Resume work in existing worktree

## User Story

**As a** developer using ai-sdlc
**I want** the system to automatically resume work in an existing worktree
**So that** I can continue from where a failed workflow left off without manual intervention

## Summary

Building on S-0062's detection capability, this story enables the system to automatically resume work in an existing worktree. When a worktree is detected, the agent should pick up where the previous agent left off instead of requiring manual intervention.

## Technical Context

**Current Flow** (from Tech Lead analysis):
```
determineWorktreeMode() checks:
  1. CLI --no-worktree flag (explicit disable)
  2. CLI --worktree flag (explicit enable)
  3. story.frontmatter.worktree_path exists
  4. config.worktree.enabled (default)
```

**Recommended Enhancement**:
After detecting an existing worktree (S-0062), automatically:
1. Switch to the existing worktree
2. Read the story file to determine last completed phase
3. Update story frontmatter with recovered worktree path
4. Continue workflow from the next incomplete phase

## Acceptance Criteria

- [ ] When worktree exists and is detected, automatically switch to it
- [ ] Read the story file to determine last completed phase
- [ ] Display what phase will be attempted next
- [ ] Continue workflow from the next incomplete phase
- [ ] Preserve any uncommitted changes in the worktree (don't reset/clean)
- [ ] Update story frontmatter `worktree_path` if it was missing/stale
- [ ] If story shows phase completed but worktree has issues, warn user
- [ ] Log resumption event with previous and current phase information

## Edge Cases

- Story file says "implementation complete" but tests are failing
- Uncommitted changes conflict with what the next phase would do
- Story file is missing or corrupted in worktree
- Worktree branch has diverged from main
- Previous phase left the worktree in a blocked state
- Story status is "done" but worktree still exists

## Validation Checks Before Resume

1. Branch still exists (`git rev-parse --verify <branch>`)
2. Branch has not diverged significantly from base
3. No uncommitted changes that would block work
4. `.workflow-state.json` matches worktree path (if exists)

## Files to Modify

| File | Changes |
|------|---------|
| `src/cli/commands.ts` | Add auto-resume after worktree detection |
| `src/core/worktree.ts` | Add `createOrResume()` method |
| `tests/` | Add integration tests for resume scenarios |

## Definition of Done

- [ ] Unit tests verify phase detection and resumption logic
- [ ] Integration tests verify end-to-end resume workflow
- [ ] Error cases properly handled with clear messaging
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
