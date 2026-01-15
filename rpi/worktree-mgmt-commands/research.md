# Research: S-0031 Worktree Management Commands

## 1. Problem Overview

**Problem Statement**: Add CLI commands to list, add, and remove worktrees. This gives users visibility into their worktrees and manual control over cleanup.

**Key Objectives**:
1. Add `list(): WorktreeInfo[]` method to `GitWorktreeService` that parses `git worktree list --porcelain`
2. Add `remove(worktreePath: string): void` method to `GitWorktreeService`
3. Add CLI subcommands: `worktrees`, `worktrees add <id>`, `worktrees remove <id>`
4. Update story frontmatter (`worktree_path`) on add/remove operations

**Success Criteria**:
- `ai-sdlc worktrees` lists all ai-sdlc managed worktrees with story ID, branch, path, status
- `ai-sdlc worktrees add <story-id>` creates worktree and updates frontmatter
- `ai-sdlc worktrees remove <story-id>` prompts for confirmation, removes worktree, clears frontmatter
- All tests pass, `make verify` passes

## 2. Web Research Findings

### Git Worktree Porcelain Output Format

The `git worktree list --porcelain` command produces machine-parseable output:

**Format Specification**:
- Each record starts with `worktree <path>` and ends with an empty line
- Attribute format: `label value` (separated by single space)
- Boolean attributes listed as label only (e.g., `bare`, `detached`)

**Available Fields**:
| Attribute | Type | Description |
|-----------|------|-------------|
| `worktree` | path | Worktree directory path (always first) |
| `HEAD` | commit hash | Current HEAD commit hash |
| `branch` | ref path | Branch reference (e.g., `refs/heads/ai-sdlc/S-0029-story`) |
| `bare` | boolean | Present if repository is bare |
| `detached` | boolean | Present if HEAD is detached |
| `locked` | label | Present if locked |
| `prunable` | label | Present if prunable |

**Example Output**:
```
worktree /path/to/project
HEAD abc123def456
branch refs/heads/main

worktree /path/to/project/.ai-sdlc/worktrees/S-0029-story-slug
HEAD def456abc123
branch refs/heads/ai-sdlc/S-0029-story-slug
```

### Git Worktree Remove Best Practices

**Force Flag Behavior**:
| Worktree State | Command | Behavior |
|----------------|---------|----------|
| Clean | `git worktree remove <path>` | Removes successfully |
| Unclean (uncommitted changes) | `git worktree remove --force <path>` | Removes, discarding changes |
| Locked | `git worktree remove --force --force <path>` | Removes locked worktree |
| Main worktree | Cannot remove | Error regardless of flags |

**Approach**: Try without force first, let git validate, provide clear feedback on failure.

### CLI Confirmation Prompts

For this project, use Node.js native `readline` (no external library needed):

```typescript
import * as readline from 'readline';

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(message + ' (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
```

### Commander.js Subcommand Pattern

Commander.js supports space-separated subcommands:

```typescript
program
  .command('worktrees')
  .description('List worktrees')
  .action(listWorktrees);

program
  .command('worktrees add <story-id>')
  .description('Create worktree for a story')
  .action(addWorktree);

program
  .command('worktrees remove <story-id>')
  .option('--force', 'Skip confirmation')
  .action((storyId, options) => removeWorktree(storyId, options));
```

## 3. Codebase Analysis

### Key Files and Modifications

| File | Change Type | Reason |
|------|-------------|--------|
| `src/types/index.ts` | Modify | Add `WorktreeInfo` interface |
| `src/core/worktree.ts` | Modify | Add `list()` and `remove()` methods |
| `src/cli/commands.ts` | Modify | Add command handlers |
| `src/index.ts` | Modify | Register CLI commands |
| `src/core/worktree.test.ts` | Modify | Add unit tests |
| `tests/integration/worktree-commands.test.ts` | Create | Integration tests |

### Existing Patterns to Follow

**Git Command Execution** (from worktree.ts):
```typescript
const result = spawnSync('git', ['command', 'args'], {
  cwd: this.projectRoot,
  encoding: 'utf-8',
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.status !== 0) {
  const stderr = result.stderr?.toString() || '';
  throw new Error(`Failed: ${stderr}`);
}
```

**Story Frontmatter Update** (from commands.ts):
```typescript
const updatedStory = updateStoryField(story, 'worktree_path', value);
await writeStory(updatedStory);
```

**CLI Command Handler** (from commands.ts):
```typescript
export async function commandName(arg: string): Promise<void> {
  const spinner = ora('Operation...').start();
  try {
    const config = loadConfig();
    const sdlcRoot = getSdlcRoot();
    const c = getThemedChalk(config);

    // Operation
    spinner.succeed(c.success('Success message'));
  } catch (error) {
    spinner.fail('Failed');
    process.exit(1);
  }
}
```

### Dependencies and Imports

**For worktree.ts**:
- Existing: `spawnSync` from `child_process`, `existsSync` from `fs`, `path`
- New: Import `WorktreeInfo` from types

**For commands.ts**:
- Existing: `ora`, `loadConfig`, `getSdlcRoot`, `getThemedChalk`
- New: `GitWorktreeService`, `readline` for confirmation, `findStoryById`, `updateStoryField`, `writeStory`

**For index.ts**:
- New imports: `listWorktrees`, `addWorktree`, `removeWorktree` from commands.ts

### Type Definitions Needed

```typescript
// In src/types/index.ts
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

## 4. Proposed Solution Approach

### High-Level Strategy

1. **Phase 1 - Service Layer**: Add `WorktreeInfo` type, implement `list()` and `remove()` methods
2. **Phase 2 - CLI Commands**: Implement three command handlers with proper error handling
3. **Phase 3 - CLI Registration**: Register commands in index.ts
4. **Phase 4 - Testing**: Add unit and integration tests

### Key Implementation Steps

**list() method**:
1. Execute `git worktree list --porcelain`
2. Parse output by splitting on double newlines
3. For each worktree block, extract path, branch, HEAD
4. Filter to only worktrees in `this.worktreeBasePath`
5. Extract storyId from branch name pattern `ai-sdlc/{storyId}-{slug}`
6. Check if path exists on filesystem

**remove() method**:
1. Validate worktree path
2. Execute `git worktree remove <path>`
3. Handle errors with descriptive messages

**listWorktrees command**:
1. Load config and instantiate GitWorktreeService
2. Call list() and format output as table
3. Show empty state message if no worktrees

**addWorktree command**:
1. Find story by ID
2. Validate story exists and has no worktree
3. Create worktree using existing create() method
4. Update story frontmatter with worktree_path

**removeWorktree command**:
1. Find story by ID
2. Prompt for confirmation (unless --force)
3. Remove worktree
4. Clear worktree_path from frontmatter

### Risk Factors and Mitigations

| Risk | Mitigation |
|------|------------|
| Path traversal | Validate worktree paths are within basePath |
| Orphaned frontmatter | Check if worktree exists before git remove |
| Race conditions | Use try-catch and handle "not found" gracefully |
| Command injection | Use `shell: false` and array args in spawnSync |

## 5. Example Code Snippets

### WorktreeInfo Type

```typescript
export interface WorktreeInfo {
  path: string;
  branch: string;
  storyId?: string;
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
      throw new Error(`Worktree not found: ${worktreePath}`);
    }
    if (stderr.includes('modified or untracked files')) {
      throw new Error(`Worktree has uncommitted changes. Use --force to remove.`);
    }
    throw new Error(`Failed to remove worktree: ${stderr}`);
  }
}
```

### Confirmation Prompt

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

## 6. Next Steps

### Prerequisites
- S-0029 complete (verified - GitWorktreeService exists)
- S-0030 complete (verified - WorktreeConfig exists)

### Implementation Order
1. Add `WorktreeInfo` type to `src/types/index.ts`
2. Implement `list()` method in `src/core/worktree.ts`
3. Implement `remove()` method in `src/core/worktree.ts`
4. Add unit tests in `src/core/worktree.test.ts`
5. Implement command handlers in `src/cli/commands.ts`
6. Register CLI commands in `src/index.ts`
7. Add integration tests

### Testing Considerations
- Mock `spawnSync` for unit tests
- Mock `GitWorktreeService` for integration tests
- Test empty list state
- Test story not found error
- Test worktree already exists error
- Test confirmation bypass with --force
- Test frontmatter updates
