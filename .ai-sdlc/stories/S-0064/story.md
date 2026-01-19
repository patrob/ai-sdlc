---
id: S-0064
title: Clean and restart option for existing worktrees
priority: 20
status: backlog
type: feature
created: '2026-01-18'
labels:
  - worktree
  - cleanup
  - workflow
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: clean-restart-existing-worktree
depends_on:
  - S-0062
---
# Clean and restart option for existing worktrees

## User Story

**As a** developer using ai-sdlc
**I want** the option to clean up an existing worktree and start fresh
**So that** I can discard bad work and restart the workflow cleanly

## Summary

Sometimes resuming isn't appropriate - the previous work may be fundamentally broken or the user wants a clean slate. This story provides an escape hatch to clean up an existing worktree and start fresh.

## Acceptance Criteria

- [ ] Provide a `--clean` or `--restart` flag for workflow commands
- [ ] When flag is used and worktree exists:
  - Display summary of what will be deleted
  - Prompt for confirmation (unless `--force` also provided)
  - Remove the worktree directory
  - Delete the worktree branch
  - Reset story file to appropriate state (back to "ready" or previous status)
  - Proceed with workflow from the beginning
- [ ] If worktree has uncommitted changes, warn user before deletion
- [ ] If worktree has unpushed commits, warn user before deletion
- [ ] Preserve story file history/metadata (don't delete the entire story)
- [ ] Log the cleanup event for audit purposes

## Edge Cases

- Worktree has unpushed commits that contain valuable work
- User accidentally uses `--clean` when they meant `--resume`
- Worktree directory is locked/in-use by another process
- Branch exists on remote (pushed but not merged)
- Story file has been updated since worktree was created

## Safety Features

1. Always prompt for confirmation unless `--force` is provided
2. Show summary of what will be lost (uncommitted changes, unpushed commits)
3. Suggest pushing branch to remote as backup before deletion
4. Never auto-delete worktrees with uncommitted changes without explicit confirmation

## CLI Interface

```bash
# Clean and restart
ai-sdlc run --story S-0058 --clean

# Force clean without prompts (for automation)
ai-sdlc run --story S-0058 --clean --force

# List worktrees that can be cleaned
ai-sdlc worktree list --stale
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/cli/commands.ts` | Add --clean flag handling |
| `src/core/worktree.ts` | Add cleanup methods |
| `tests/` | Add tests for cleanup scenarios |

## Definition of Done

- [ ] Unit tests verify cleanup logic handles all edge cases
- [ ] Integration tests verify end-to-end clean and restart workflow
- [ ] Confirmation prompts prevent accidental data loss
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
