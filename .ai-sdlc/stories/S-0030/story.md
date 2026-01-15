---
id: S-0030
title: Worktree configuration support
priority: 2
status: done
type: feature
created: '2026-01-15'
labels:
  - git
  - worktree
  - configuration
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
slug: worktree-configuration-support
depends_on:
  - S-0029
---

# Worktree configuration support

## User Story

**As a** developer who prefers worktrees for all story work
**I want** to configure worktrees as the default behavior
**So that** I don't need to pass `--worktree` every time

## Summary

Add configuration file support so users can make worktrees the default. When enabled, all implementations use worktrees unless `--no-worktree` is explicitly passed.

## Acceptance Criteria

### Configuration in `.ai-sdlc.json`
- [x] `worktree.enabled: boolean` - when true, worktrees are default (default: false)
- [x] `worktree.basePath: string` - override default worktree location (default: `.ai-sdlc/worktrees`)
- [x] Configuration is optional - missing config uses defaults

### CLI Flags
- [x] `--no-worktree` flag available when config has `worktree.enabled: true`
- [x] `--no-worktree` forces branch-based workflow even when config enables worktrees
- [x] `--worktree` flag still works (overrides config when `enabled: false`)

### Validation
- [x] Invalid `worktree.basePath` (non-existent parent directory) fails with clear error
- [x] Relative `basePath` resolved relative to project root
- [x] Config validation runs at startup, not at worktree creation time

### Config Loading
- [x] Extend existing config loading in `src/core/config.ts`
- [x] Add `WorktreeConfig` type to `src/types/index.ts`

## Technical Approach

```typescript
// src/types/index.ts
export interface WorktreeConfig {
  enabled: boolean;
  basePath: string;
}

// src/core/config.ts
export interface Config {
  // ... existing fields
  worktree?: Partial<WorktreeConfig>;
}

export function getWorktreeConfig(config: Config): WorktreeConfig {
  return {
    enabled: config.worktree?.enabled ?? false,
    basePath: config.worktree?.basePath ?? '.ai-sdlc/worktrees'
  };
}
```

## Testing Strategy

- Unit tests for config parsing with various inputs
- Unit tests for path resolution (relative vs absolute)
- Unit tests for validation errors
- Integration: verify `--no-worktree` overrides config

## Out of Scope

- Worktree management commands (S-0031)
- Lifecycle cleanup (S-0032)

## Definition of Done

- [x] Config file with `worktree.enabled: true` makes worktrees default
- [x] `--no-worktree` overrides config
- [x] All tests pass
- [x] `make verify` passes

---

**Effort:** small
**Labels:** git, worktree, configuration
