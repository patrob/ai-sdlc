# Implementation Plan: S-0031 Worktree Management Commands

## Overview

This plan implements CLI commands to list, add, and remove git worktrees for ai-sdlc story management. The implementation adds a `WorktreeInfo` interface, extends `GitWorktreeService` with `list()` and `remove()` methods, and registers three CLI commands: `worktrees`, `worktrees add <id>`, and `worktrees remove <id>`.

## Prerequisites

- S-0029 complete (GitWorktreeService exists in `src/core/worktree.ts`)
- S-0030 complete (WorktreeConfig exists in `src/types/index.ts`)
- Working git repository with main or master branch

---

## Phase 1: Service Layer Extensions

**Goal**: Add `WorktreeInfo` type and extend `GitWorktreeService` with `list()` and `remove()` methods.

**Committable State**: Service layer can list and remove worktrees; existing functionality unchanged.

- [x] Add `WorktreeInfo` interface to `src/types/index.ts` (after `WorktreeConfig` interface)
- [x] Add `WORKTREE_NOT_FOUND` and `WORKTREE_HAS_CHANGES` to `ERROR_MESSAGES` constant in `src/core/worktree.ts`
- [x] Implement `list(): WorktreeInfo[]` method in `GitWorktreeService` class
- [x] Implement `remove(worktreePath: string): void` method in `GitWorktreeService` class
- [x] Run `npm run build` to verify TypeScript compilation succeeds

**Phase 1 Acceptance Criteria**:
- `npm run build` succeeds
- `list()` returns empty array for repo with no worktrees
- `remove()` throws descriptive error for non-existent worktree

---

## Phase 2: CLI Command Implementation

**Goal**: Add CLI command handlers and register them with Commander.js.

**Committable State**: All three worktree commands functional from CLI.

- [x] Add `confirmRemoval()` helper function to `src/cli/commands.ts` using readline
- [x] Implement `listWorktrees()` command handler in `src/cli/commands.ts`
- [x] Implement `addWorktree(storyId: string)` command handler in `src/cli/commands.ts`
- [x] Implement `removeWorktree(storyId: string, options: { force?: boolean })` command handler
- [x] Export command handlers from `src/cli/commands.ts`
- [x] Register `worktrees` command (list) in `src/index.ts`
- [x] Register `worktrees:add <story-id>` command in `src/index.ts`
- [x] Register `worktrees:remove <story-id>` command with --force option in `src/index.ts`
- [x] Add imports for command handlers in `src/index.ts`

**Phase 2 Acceptance Criteria**:
- `npm run build` succeeds
- `ai-sdlc worktrees --help` displays list command help
- `ai-sdlc worktrees add --help` displays add command help
- `ai-sdlc worktrees remove --help` displays remove command help

---

## Phase 3: Testing

**Goal**: Add comprehensive unit and integration tests.

**Committable State**: All tests pass, `make verify` succeeds.

- [x] Add `list()` unit tests to `src/core/worktree.test.ts`
- [x] Add `remove()` unit tests to `src/core/worktree.test.ts`
- [x] Create `tests/integration/worktree-commands.test.ts` with integration tests
- [x] Run `npm test` and fix any failures
- [x] Run `make verify` and fix any issues

**Phase 3 Acceptance Criteria**:
- All unit tests pass
- All integration tests pass
- `make verify` passes (lint, build, test)

---

## Validation Checklist

- [x] `ai-sdlc worktrees` lists managed worktrees with story ID, branch, path, status
- [x] `ai-sdlc worktrees:add S-XXXX` creates worktree, updates frontmatter
- [x] `ai-sdlc worktrees:remove S-XXXX` prompts confirmation, removes worktree, clears frontmatter
- [x] `ai-sdlc worktrees:remove S-XXXX --force` skips confirmation
- [x] Empty worktree list shows helpful message
- [x] All error cases show descriptive messages
- [x] `npm test` passes with 0 failures
- [x] `npm run build` succeeds
- [x] `make verify` passes

---

## Key File Paths

| File | Purpose |
|------|---------|
| `src/types/index.ts` | Add `WorktreeInfo` interface |
| `src/core/worktree.ts` | Add `list()` and `remove()` methods |
| `src/cli/commands.ts` | Add command handlers and `confirmRemoval()` |
| `src/index.ts` | Register CLI commands |
| `src/core/worktree.test.ts` | Unit tests for service methods |
| `tests/integration/worktree-commands.test.ts` | Integration tests for CLI commands |

---

## Code References

### WorktreeInfo Interface

```typescript
export interface WorktreeInfo {
  /** Absolute path to the worktree directory */
  path: string;
  /** Branch name (without refs/heads/ prefix) */
  branch: string;
  /** Story ID extracted from branch name (if ai-sdlc managed) */
  storyId?: string;
  /** Whether the worktree directory exists on filesystem */
  exists: boolean;
}
```

### list() Method

```typescript
list(): WorktreeInfo[] {
  const result = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: this.projectRoot,
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(`Failed to list worktrees: ${result.stderr}`);
  }

  const output = result.stdout || '';
  const worktrees: WorktreeInfo[] = [];
  const blocks = output.trim().split('\n\n');

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.split('\n');
    let path = '';
    let branch = '';

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.substring(9);
      } else if (line.startsWith('branch ')) {
        branch = line.substring(7).replace('refs/heads/', '');
      }
    }

    // Filter to only ai-sdlc managed worktrees
    if (path && path.startsWith(this.worktreeBasePath)) {
      const storyIdMatch = branch.match(/^ai-sdlc\/(S-\d+)-/);
      worktrees.push({
        path,
        branch,
        storyId: storyIdMatch ? storyIdMatch[1] : undefined,
        exists: existsSync(path),
      });
    }
  }

  return worktrees;
}
```

### remove() Method

```typescript
remove(worktreePath: string): void {
  const result = spawnSync('git', ['worktree', 'remove', worktreePath], {
    cwd: this.projectRoot,
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || '';
    if (stderr.includes('not a working tree')) {
      throw new Error(ERROR_MESSAGES.WORKTREE_NOT_FOUND);
    }
    if (stderr.includes('modified or untracked files')) {
      throw new Error(ERROR_MESSAGES.WORKTREE_HAS_CHANGES);
    }
    throw new Error(`Failed to remove worktree: ${stderr}`);
  }
}
```

### confirmRemoval Helper

```typescript
import * as readline from 'readline';

async function confirmRemoval(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(message + ' (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
```
