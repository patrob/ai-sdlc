---
id: S-0032
title: Worktree lifecycle cleanup prompts
priority: 4
status: done
type: feature
created: '2026-01-15'
labels:
  - git
  - worktree
  - lifecycle
  - ux
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
slug: worktree-lifecycle-cleanup
depends_on:
  - S-0029
  - S-0031
---

# Worktree lifecycle cleanup prompts

## User Story

**As a** developer who uses worktrees for story work
**I want** to be prompted to clean up the worktree when a story is done
**So that** I don't accumulate stale worktrees consuming disk space

## Summary

When a story with a worktree moves to "done" status, prompt the user to optionally remove the worktree. This keeps the filesystem tidy without forcing cleanup.

## Acceptance Criteria

### Cleanup Prompt
- [x] When story moves to done and has `worktree_path` in frontmatter, prompt user
- [x] Prompt shows: worktree path and asks "Remove worktree? [y/N]"
- [x] Default is No (preserves worktree if user just presses Enter)
- [x] If user confirms (y/Y), remove worktree and clear `worktree_path` from frontmatter
- [x] If user declines, worktree remains and `worktree_path` stays in frontmatter

### Observability
- [x] Info log when creating worktree: "Creating worktree at: {path}"
- [x] Info log when entering worktree: "Executing in worktree: {path}"
- [x] Info log when returning: "Returning to main repository"
- [x] Warning if `worktree_path` in frontmatter doesn't exist on disk

### Error Handling
- [x] If worktree removal fails, log error but don't fail the move-to-done action
- [x] If worktree was already manually deleted, just clear frontmatter (no error)

### Integration Points
- [x] Hook into `move_to_done` case in `executeAction()`
- [x] Only prompt in interactive mode (not in daemon/auto mode)
- [x] In non-interactive mode, skip cleanup (worktree remains)

## Technical Approach

```typescript
// In kanban.ts or story-lifecycle.ts
async function handleMoveToDone(story: Story): Promise<void> {
  // ... existing move logic

  if (story.frontmatter.worktree_path) {
    const worktreeExists = worktreeService.exists(story.frontmatter.worktree_path);

    if (worktreeExists && isInteractive()) {
      const confirm = await promptUser(
        `Remove worktree at ${story.frontmatter.worktree_path}? [y/N]`
      );

      if (confirm) {
        try {
          worktreeService.remove(story.frontmatter.worktree_path);
          await clearWorktreePath(story);
          console.log('Worktree removed.');
        } catch (err) {
          console.warn(`Failed to remove worktree: ${err.message}`);
        }
      }
    } else if (!worktreeExists) {
      console.warn(`Worktree path not found: ${story.frontmatter.worktree_path}`);
      await clearWorktreePath(story);
    }
  }
}
```

## Testing Strategy

- Unit test prompt logic with mocked user input
- Unit test skip behavior in non-interactive mode
- Unit test error handling when removal fails
- Integration test full move-to-done flow

## Out of Scope

- Automatic cleanup after configurable time
- Bulk cleanup commands
- Disk space monitoring

## Definition of Done

- [x] Moving story to done prompts for worktree cleanup (interactive mode)
- [x] Worktree is removed if user confirms
- [x] Frontmatter is updated appropriately
- [x] All tests pass
- [x] `make verify` passes

---

**Effort:** small
**Labels:** git, worktree, lifecycle, ux
