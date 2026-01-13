---
id: S-0025
title: Git worktree support for isolated development workflows
priority: 3
status: backlog
type: feature
created: '2026-01-13'
labels:
  - git
  - worktree
  - workflow
  - isolation
  - concurrent-work
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: git-worktree-support
---

# Git worktree support for isolated development workflows

## User Story

**As a** developer using ai-sdlc
**I want** the option to use git worktrees instead of branches when starting implementation
**So that** I can work on stories in isolated directories without polluting my main repository checkout, enabling future concurrent workflow streams

## Summary

Add `--worktree` flag to the implementation workflow that creates a git worktree instead of a branch in the main repo folder. This provides complete filesystem isolation for each story, preventing conflicts with uncommitted work and laying the groundwork for concurrent workflow streams.

When `--worktree` is used:
1. A new worktree is created at `.ai-sdlc/worktrees/{story-id}-{slug}/`
2. All agent work (implement, review, etc.) happens in the worktree directory
3. Progress is still shown in the user's current terminal
4. User is returned to the main repo when work completes or errors

## Problem Context

**Current workflow limitations:**
- Implementation creates a branch directly in the main repo checkout
- Users with uncommitted changes must stash or commit before starting new work
- No filesystem isolation between concurrent development tasks
- Cannot easily run multiple workflow streams simultaneously

**Git worktrees solve this by:**
- Creating a separate checkout directory for each branch
- Allowing concurrent checkouts of different branches
- Isolating node_modules, build artifacts, and uncommitted changes
- Enabling future parallel workflow execution

## Acceptance Criteria

### Core Functionality (P0)
- [ ] `--worktree` flag available on implementation start (e.g., `ai-sdlc run --worktree`)
- [ ] Worktree created at configurable location (default: `.ai-sdlc/worktrees/{story-id}-{slug}/`)
- [ ] Worktree always branches from main/master (configurable main branch)
- [ ] All agent work executes in worktree directory (cwd set to worktree path)
- [ ] Progress spinners and output display in user's current terminal
- [ ] User's shell returns to original directory when work completes
- [ ] User's shell returns to original directory on error/interruption
- [ ] Worktree path stored in story frontmatter (`worktree_path` field)
- [ ] Block and warn if uncommitted changes exist in main repo when creating worktree
- [ ] `make verify` passes with all new code changes

### Configuration (P0)
- [ ] `useWorktrees: boolean` config in `.ai-sdlc.json` to make worktrees the default
- [ ] `worktreePath: string` config to override default worktree location
- [ ] When `useWorktrees: true`, all implementations use worktrees unless `--no-worktree` flag
- [ ] Config validation ensures `worktreePath` is a valid directory path

### Worktree Management Commands (P1)
- [ ] `ai-sdlc worktrees` command lists all worktrees created by ai-sdlc
- [ ] `ai-sdlc worktrees add <story-id>` converts existing branch to worktree
- [ ] `ai-sdlc worktrees remove <story-id>` removes a specific worktree
- [ ] List command shows: story ID, path, branch, creation date, status

### Lifecycle Management (P1)
- [ ] When story moves to "done", prompt user to cleanup worktree
- [ ] Prompt shows worktree path and asks: "Remove worktree? [y/N]"
- [ ] If user confirms, worktree is removed and `worktree_path` cleared from frontmatter
- [ ] If user declines, worktree remains and path stays in frontmatter

### Observability (P2)
- [ ] Info log when creating worktree: "Creating worktree at: {path}"
- [ ] Info log when entering worktree: "Executing in worktree: {path}"
- [ ] Info log when returning from worktree: "Returning to main repository"
- [ ] Warning if worktree path in frontmatter doesn't exist on disk

## Edge Cases

### Git State
- [ ] Refuse worktree creation if main repo has uncommitted changes (with clear error message)
- [ ] Handle case where target worktree directory already exists (prompt to reuse or fail)
- [ ] Handle case where worktree was manually deleted but still referenced in git
- [ ] Validate main branch exists before attempting worktree creation

### Story State
- [ ] If story already has `worktree_path`, reuse existing worktree instead of creating new
- [ ] If story has `branch` but no `worktree_path`, `worktrees add` can convert it
- [ ] Handle story with both `branch` and `worktree_path` gracefully (prefer worktree)

### Error Recovery
- [ ] On agent error, ensure cwd returns to original directory
- [ ] On SIGINT/SIGTERM, ensure cwd returns to original directory
- [ ] If worktree creation fails, provide actionable error message
- [ ] If worktree removal fails, log error but don't fail the move-to-done action

### Configuration
- [ ] Missing `.ai-sdlc.json` uses defaults (worktrees disabled, default path)
- [ ] Invalid `worktreePath` (non-existent parent) fails with clear error
- [ ] Relative `worktreePath` resolved relative to project root

## Technical Approach

### New Service: `src/core/worktree.ts`

```typescript
export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  bare: boolean;
  detached: boolean;
}

export interface WorktreeConfig {
  enabled: boolean;
  basePath: string;
}

export class GitWorktreeService {
  constructor(private projectRoot: string) {}

  // Create a new worktree for a story
  create(storyId: string, slug: string, baseBranch: string): string;

  // List all worktrees (filter to ai-sdlc managed ones)
  list(): WorktreeInfo[];

  // Remove a worktree by path
  remove(worktreePath: string): void;

  // Check if worktree exists
  exists(worktreePath: string): boolean;

  // Get worktree info by path
  getInfo(worktreePath: string): WorktreeInfo | null;

  // Validate git state for worktree creation
  validateGitState(): { valid: boolean; error?: string };
}
```

### Config Extension in `src/core/config.ts`

```typescript
interface Config {
  // ... existing fields
  worktree?: {
    enabled: boolean;       // Default: false
    basePath?: string;      // Default: '.ai-sdlc/worktrees'
  };
}
```

### Frontmatter Extension in `src/types/index.ts`

```typescript
interface StoryFrontmatter {
  // ... existing fields
  worktree_path?: string;           // Absolute path to worktree
  worktree_created_at?: string;     // ISO timestamp
}
```

### CLI Changes

1. **commands.ts**: Add `--worktree` and `--no-worktree` flags
2. **implementation.ts**: Use worktree service instead of direct branch creation
3. **kanban.ts**: Add cleanup prompt when moving to done

### Execution Flow

```
User runs: ai-sdlc run --worktree

1. Validate git state (no uncommitted changes)
2. Create worktree at .ai-sdlc/worktrees/S-0025-git-worktree-support/
3. Store worktree_path in story frontmatter
4. Change cwd to worktree directory
5. Execute implementation agent
6. Change cwd back to original directory
7. Display completion message
```

## Testing Strategy

### Unit Tests (`src/core/worktree.test.ts`)
- Mock `execSync` for git commands
- Test worktree creation with valid inputs
- Test worktree listing and parsing
- Test worktree removal
- Test git state validation
- Test path generation with various story IDs/slugs

### Unit Tests (config)
- Validate worktree config parsing
- Validate config defaults
- Validate invalid config handling

### Integration Tests
- Mock git operations
- Verify worktree service integrates with implementation agent
- Verify cleanup prompt appears on move-to-done
- Verify cwd restoration on error

### Manual Testing
- Create worktree on real project
- Run full implementation workflow in worktree
- Verify isolation (node_modules separate)
- Test cleanup flow

## Out of Scope (Future Stories)

- Concurrent workflow execution (multiple agents running simultaneously)
- Automatic worktree cleanup after configurable time
- Worktree health monitoring in daemon mode
- Shared node_modules/artifact caching between worktrees

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Worktree corruption | Low | High | Validate git state before operations; provide manual recovery docs |
| Path collision | Low | Medium | Use story ID in path; check existence before creation |
| Disk space exhaustion | Medium | Medium | Document that worktrees are fully isolated; provide cleanup command |
| cwd restoration failure | Low | High | Use try/finally pattern; test thoroughly with SIGINT |

## Dependencies

- Git version with worktree support (Git 2.5+, released 2015)
- No external npm dependencies required
