# Implementation Plan: S-0032 Worktree Lifecycle Cleanup Prompts

## Overview

This plan implements worktree cleanup prompts when stories move to done. The implementation hooks into the existing `move_to_done` action in `executeAction()` and prompts users (in interactive mode) to optionally remove their worktree.

## Prerequisites

- S-0029 complete (GitWorktreeService exists)
- S-0031 complete (GitWorktreeService.remove() exists)

---

## Phase 1: Implementation

**Goal**: Add worktree cleanup logic to move-to-done flow.

**Committable State**: Cleanup prompts work in interactive mode; non-interactive gracefully skips.

- [x] Add `handleWorktreeCleanup()` helper function in `src/cli/commands.ts`
- [x] Import `existsSync` from fs in commands.ts (for worktree path check) - using fs.existsSync
- [x] Integrate cleanup call in `move_to_done` case of `executeAction()`
- [x] Run `npm run build` to verify TypeScript compilation succeeds

**Phase 1 Acceptance Criteria**:
- `npm run build` succeeds
- Moving story to done with worktree prompts for cleanup (interactive)
- Non-interactive mode skips cleanup gracefully

---

## Phase 2: Testing

**Goal**: Add unit tests for cleanup logic.

**Committable State**: All tests pass, `make verify` succeeds.

- [x] Create `src/cli/worktree-cleanup.test.ts` with unit tests
- [x] Test: Interactive mode cleanup accepted
- [x] Test: Interactive mode cleanup declined
- [x] Test: Non-interactive mode skips prompt
- [x] Test: Worktree already deleted - frontmatter cleared
- [x] Test: Worktree removal fails - error logged, workflow continues
- [x] Run `npm test` and fix any failures
- [x] Run `make verify` and fix any issues

**Phase 2 Acceptance Criteria**:
- All unit tests pass
- `make verify` passes

---

## Validation Checklist

- [ ] Moving story to done with worktree prompts for cleanup
- [ ] User can accept or decline cleanup
- [ ] Default is No (pressing Enter preserves worktree)
- [ ] Worktree removed if confirmed
- [ ] Frontmatter `worktree_path` cleared after removal
- [ ] Non-interactive mode skips prompt
- [ ] Missing worktree clears frontmatter without error
- [ ] Removal failure logs warning, doesn't block move-to-done
- [ ] `npm test` passes
- [ ] `make verify` passes

---

## Key File Paths

| File | Purpose |
|------|---------|
| `src/cli/commands.ts` | Add handleWorktreeCleanup() and integrate with move_to_done |
| `src/cli/worktree-cleanup.test.ts` | Unit tests for cleanup logic |

---

## Code Reference

### handleWorktreeCleanup Function

```typescript
/**
 * Handle worktree cleanup when story moves to done
 * Prompts user in interactive mode to remove worktree
 */
async function handleWorktreeCleanup(
  story: Story,
  config: Config,
  c: any // ThemeColors
): Promise<void> {
  const worktreePath = story.frontmatter.worktree_path;
  if (!worktreePath) return;

  const sdlcRoot = getSdlcRoot();
  const workingDir = path.dirname(sdlcRoot);
  const worktreeConfig = config.worktree ?? DEFAULT_WORKTREE_CONFIG;

  // Check if worktree exists
  if (!existsSync(worktreePath)) {
    console.log(c.warning(`  Note: Worktree path no longer exists: ${worktreePath}`));
    const updated = updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updated);
    console.log(c.dim('  Cleared worktree_path from frontmatter'));
    return;
  }

  // Only prompt in interactive mode
  if (!process.stdin.isTTY) {
    console.log(c.dim(`  Worktree preserved (non-interactive mode): ${worktreePath}`));
    return;
  }

  // Prompt for cleanup
  console.log();
  console.log(c.info(`  Story has a worktree at: ${worktreePath}`));
  const shouldRemove = await confirmRemoval('  Remove worktree?');

  if (!shouldRemove) {
    console.log(c.dim('  Worktree preserved'));
    return;
  }

  // Remove worktree
  try {
    let resolvedBasePath: string;
    try {
      resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
    } catch {
      resolvedBasePath = path.dirname(worktreePath);
    }
    const service = new GitWorktreeService(workingDir, resolvedBasePath);
    service.remove(worktreePath);

    const updated = updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updated);
    console.log(c.success('  ✓ Worktree removed'));
  } catch (error) {
    console.log(c.warning(`  Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`));
    const updated = updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updated);
  }
}
```

### Integration Point

```typescript
// In executeAction(), move_to_done case:
case 'move_to_done': {
  // ... existing code ...
  await updateStoryStatus(story, 'done');
  spinner.succeed(c.success(`Moved ${action.storyId} to done`));
  changesMade.push(`Moved ${action.storyId} to done`);

  // NEW: Worktree cleanup prompt
  if (story.frontmatter.worktree_path) {
    await handleWorktreeCleanup(story, config, c);
  }
  break;
}
```
