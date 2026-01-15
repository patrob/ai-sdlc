# Research: S-0032 Worktree Lifecycle Cleanup Prompts

## 1. Problem Overview

**Problem Statement**: When a story with a worktree moves to "done" status, prompt the user to optionally remove the worktree.

**Key Objectives**:
1. Hook into move-to-done flow in `executeAction()` function
2. Detect interactive mode using `process.stdin.isTTY`
3. Prompt user for cleanup confirmation (reuse existing `confirmRemoval()` helper)
4. Use `GitWorktreeService.remove()` from S-0031
5. Clear `worktree_path` from frontmatter after removal
6. Add observability logging for worktree operations

**Success Criteria**:
- Moving story to done prompts for worktree cleanup (interactive mode only)
- Worktree is removed if user confirms
- Frontmatter is updated appropriately
- Non-interactive mode skips prompt gracefully
- All tests pass, `make verify` passes

## 2. Codebase Analysis

### Integration Point

The `move_to_done` action is executed in `src/cli/commands.ts` within the `executeAction()` function around line 985-995:

```typescript
case 'move_to_done': {
  spinner.text = `Moving ${action.storyId} to done...`;
  const story = getStory(action.storyPath);
  if (!story) {
    spinner.fail(c.error(`Story not found: ${action.storyId}`));
    break;
  }
  await updateStoryStatus(story, 'done');
  spinner.succeed(c.success(`Moved ${action.storyId} to done`));
  changesMade.push(`Moved ${action.storyId} to done`);
  break;
}
```

### Existing Patterns to Reuse

**1. User Prompt Pattern** (lines 1723-1733 in commands.ts):
```typescript
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

**2. Interactive Mode Detection** (from daemon.ts):
```typescript
if (process.stdin.isTTY) {
  // Interactive mode - show prompts
}
```

**3. Worktree Service Usage** (from removeWorktree function):
```typescript
const worktreeConfig = config.worktree ?? DEFAULT_WORKTREE_CONFIG;
let resolvedBasePath = validateWorktreeBasePath(worktreeConfig.basePath, workingDir);
const service = new GitWorktreeService(workingDir, resolvedBasePath);
service.remove(worktreePath);
```

### Affected Files

| File | Change Type | Reason |
|------|-------------|--------|
| `src/cli/commands.ts` | Modify | Add cleanup logic after move-to-done |
| `src/cli/commands-worktree-cleanup.test.ts` | Create | Unit tests for cleanup logic |

## 3. Proposed Implementation

### Key Code Changes

```typescript
// In executeAction(), after move_to_done case succeeds:
case 'move_to_done': {
  spinner.text = `Moving ${action.storyId} to done...`;
  const story = getStory(action.storyPath);
  if (!story) {
    spinner.fail(c.error(`Story not found: ${action.storyId}`));
    break;
  }
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

### Helper Function

```typescript
async function handleWorktreeCleanup(
  story: Story,
  config: Config,
  c: ThemeColors
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
    // Clear frontmatter anyway (user may have manually deleted)
    const updated = updateStoryField(story, 'worktree_path', undefined);
    await writeStory(updated);
  }
}
```

## 4. Testing Strategy

### Unit Tests

1. Interactive mode, cleanup accepted - verify remove() called, frontmatter cleared
2. Interactive mode, cleanup declined - verify worktree preserved
3. Non-interactive mode - verify no prompt, worktree preserved
4. Worktree already deleted - verify frontmatter cleared without error
5. Worktree removal fails - verify error logged, move-to-done succeeds

### Test Pattern

```typescript
describe('worktree cleanup on move-to-done', () => {
  it('prompts for cleanup in interactive mode', async () => {
    // Mock process.stdin.isTTY = true
    // Mock readline to return 'y'
    // Verify GitWorktreeService.remove() called
  });

  it('skips prompt in non-interactive mode', async () => {
    // Mock process.stdin.isTTY = false
    // Verify no prompt shown
  });
});
```

## 5. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Prompt in daemon mode | Check `process.stdin.isTTY` before prompting |
| Removal failure blocks workflow | Catch errors, log warning, continue |
| Manually deleted worktree | Check `existsSync` first, clear frontmatter if missing |
| Race conditions | Handle errors gracefully, always update frontmatter |

## 6. Next Steps

1. Implement `handleWorktreeCleanup()` helper function
2. Integrate into `move_to_done` case in `executeAction()`
3. Add unit tests
4. Run `make verify`
