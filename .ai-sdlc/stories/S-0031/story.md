---
id: S-0031
title: Worktree management commands
priority: 3
status: backlog
type: feature
created: '2026-01-15'
labels:
  - git
  - worktree
  - cli
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
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
- [ ] `ai-sdlc worktrees` lists all ai-sdlc managed worktrees
- [ ] Output shows: story ID, branch, path, status (exists/missing)
- [ ] Only shows worktrees in the configured basePath (filters out unrelated worktrees)
- [ ] Empty list shows helpful message

### Add Command
- [ ] `ai-sdlc worktrees add <story-id>` creates worktree for existing story
- [ ] Works for stories that have a branch but no worktree yet
- [ ] Updates story frontmatter with `worktree_path`
- [ ] Fails gracefully if story doesn't exist or already has worktree

### Remove Command
- [ ] `ai-sdlc worktrees remove <story-id>` removes worktree for a story
- [ ] Prompts for confirmation before removal
- [ ] `--force` flag skips confirmation
- [ ] Clears `worktree_path` from story frontmatter
- [ ] Handles case where worktree was already manually deleted

### Service Extensions
- [ ] Add `list(): WorktreeInfo[]` to `GitWorktreeService`
- [ ] Add `remove(worktreePath: string): void` to `GitWorktreeService`

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

- [ ] `ai-sdlc worktrees` shows list of managed worktrees
- [ ] `ai-sdlc worktrees add S-XXXX` creates worktree
- [ ] `ai-sdlc worktrees remove S-XXXX` removes worktree
- [ ] All tests pass
- [ ] `make verify` passes

---

**Effort:** small-medium
**Labels:** git, worktree, cli
