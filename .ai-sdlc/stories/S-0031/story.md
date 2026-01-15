---
id: S-0031
title: Worktree management commands
priority: 3
status: done
type: feature
created: '2026-01-15'
labels:
  - git
  - worktree
  - cli
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
slug: worktree-management-commands
depends_on:
  - S-0029
---

# Worktree management commands

## User Story

**As a** developer using worktrees for ai-sdlc stories
**I want** commands to list and manage my worktrees
**So that** I can see what worktrees exist and clean them up when needed

## Summary

Add CLI commands to list, add, and remove worktrees. This gives users visibility into their worktrees and manual control over cleanup.

## Acceptance Criteria

### List Command
- [x] `ai-sdlc worktrees` lists all ai-sdlc managed worktrees
- [x] Output shows: story ID, branch, path, status (exists/missing)
- [x] Only shows worktrees in the configured basePath (filters out unrelated worktrees)
- [x] Empty list shows helpful message

### Add Command
- [x] `ai-sdlc worktrees:add <story-id>` creates worktree for existing story
- [x] Works for stories that have a branch but no worktree yet
- [x] Updates story frontmatter with `worktree_path`
- [x] Fails gracefully if story doesn't exist or already has worktree

### Remove Command
- [x] `ai-sdlc worktrees:remove <story-id>` removes worktree for a story
- [x] Prompts for confirmation before removal
- [x] `--force` flag skips confirmation
- [x] Clears `worktree_path` from story frontmatter
- [x] Handles case where worktree was already manually deleted

### Service Extensions
- [x] Add `list(): WorktreeInfo[]` to `GitWorktreeService`
- [x] Add `remove(worktreePath: string): void` to `GitWorktreeService`

## Technical Approach

```typescript
// List worktrees managed by ai-sdlc
list(): WorktreeInfo[] {
  const output = execSync('git worktree list --porcelain', { cwd: this.projectRoot });
  // Parse output, filter to worktrees in basePath
  return worktrees.filter(wt => wt.path.startsWith(this.basePath));
}

// Remove a worktree
remove(worktreePath: string): void {
  execSync(`git worktree remove ${worktreePath}`, { cwd: this.projectRoot });
}
```

### CLI Integration

```typescript
// src/index.ts
program
  .command('worktrees')
  .description('Manage git worktrees')
  .action(() => listWorktrees());

program
  .command('worktrees add <story-id>')
  .description('Create worktree for a story')
  .action((storyId) => addWorktree(storyId));

program
  .command('worktrees remove <story-id>')
  .option('--force', 'Skip confirmation')
  .action((storyId, options) => removeWorktree(storyId, options));
```

## Testing Strategy

- Unit tests for `list()` parsing git output
- Unit tests for `remove()` with mocked execSync
- Integration tests for CLI command routing

## Out of Scope

- Automatic cleanup (S-0032 handles prompts on done)
- Worktree health monitoring
- Disk space reporting

## Definition of Done

- [x] `ai-sdlc worktrees` shows list of managed worktrees
- [x] `ai-sdlc worktrees:add S-XXXX` creates worktree
- [x] `ai-sdlc worktrees:remove S-XXXX` removes worktree
- [x] All tests pass
- [x] `make verify` passes

---

**Effort:** small-medium
**Labels:** git, worktree, cli
