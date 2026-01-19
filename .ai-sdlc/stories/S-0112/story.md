---
id: S-0112
title: Status command shows incorrect story state for worktree stories
priority: 2
status: backlog
type: bug
created: '2026-01-19'
labels:
  - status-command
  - worktrees
  - data-accuracy
dependencies: []
---
# Status command shows incorrect story state for worktree stories

## Bug Summary

The `ai-sdlc status` command shows incorrect story status when a story is being processed in a worktree. For example, story S-0096 shows as "Backlog" in the status output, but it's actually "In Progress" in its active worktree.

## Steps to Reproduce

1. Start processing a story with worktrees enabled: `ai-sdlc process S-0096 --worktrees`
2. Wait for the worktree to be created and story status updated to "in-progress"
3. In the main repository, run: `ai-sdlc status`
4. Observe that S-0096 shows as "Backlog" instead of "In Progress"

## Expected Behavior

The status command should show the accurate status from the active worktree, displaying S-0096 as "In Progress".

## Actual Behavior

The status command shows the stale status from the main repository's story file, displaying S-0096 as "Backlog".

## Technical Analysis

**Root Cause:** The `status` command only reads from the main repository's `.ai-sdlc/stories/` directory.

Data flow:
1. `status` command calls `assessState()` in `src/core/kanban.ts:164-168`
2. `assessState()` calls `findStoriesByStatus()` → `findAllStories()`
3. `findAllStories()` (kanban.ts:14-43) globs only `{sdlcRoot}/stories/*/story.md`
4. When a story is processed in a worktree at `.ai-sdlc/worktrees/{STORY_ID}-{slug}/`, the worktree has its own `.ai-sdlc/stories/{STORY_ID}/story.md` with the updated status
5. The main repo's story file remains unchanged until the PR is merged

**Key Insight:** The worktree copy is the source of truth during active development, but the status command doesn't read from it.

## Proposed Solution

Make `findAllStories()` worktree-aware:

1. **Add worktree detection** - Use existing `GitWorktreeService.list()` to discover active worktrees
2. **Build story map** - Create `Map<storyId, worktreePath>` for quick lookup
3. **Prioritize worktree** - When both main repo and worktree have the same story, use the worktree version
4. **Handle edge cases** - Gracefully fall back to main repo if worktree story is missing/corrupt

Files to modify:
- `src/core/kanban.ts` - Add worktree awareness to `findAllStories()`
- `src/core/worktree.ts` - May need helper function for story loading from worktrees
- `tests/integration/status-kanban.test.ts` - Add worktree-specific tests

## Acceptance Criteria

- [ ] When story has active worktree with "in-progress" status, `ai-sdlc status` shows "In Progress"
- [ ] When story has no worktree, status shows main repository value
- [ ] When worktree exists but story file is missing/corrupt, falls back to main repo with warning
- [ ] Status output visually indicates when status is from worktree (optional enhancement)
- [ ] All existing status tests continue to pass

## Edge Cases to Handle

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Worktree directory deleted externally | Fall back to main repo (check `exists` flag) |
| Malformed story file in worktree | Fall back to main repo, log warning |
| Multiple worktrees for same story | Use first found (document behavior) |
| `--worktrees=false` processing | No impact (main repo is already updated) |

## INVEST Analysis

- **Independent:** No dependencies on other work
- **Negotiable:** Can start with basic fix, enhance later
- **Valuable:** Fixes data accuracy in core feature
- **Estimable:** Small (S) - 1-2 hours including tests
- **Small:** Single focused change to `findAllStories()`
- **Testable:** Clear pass/fail criteria above
