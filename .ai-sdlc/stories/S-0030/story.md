---
id: S-0030
title: Worktree configuration support
priority: 2
status: backlog
type: feature
created: '2026-01-15'
labels:
  - git
  - worktree
  - configuration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
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
- [ ] `worktree.enabled: boolean` - when true, worktrees are default (default: false)
- [ ] `worktree.basePath: string` - override default worktree location (default: `.ai-sdlc/worktrees`)
- [ ] Configuration is optional - missing config uses defaults

### CLI Flags
- [ ] `--no-worktree` flag available when config has `worktree.enabled: true`
- [ ] `--no-worktree` forces branch-based workflow even when config enables worktrees
- [ ] `--worktree` flag still works (overrides config when `enabled: false`)

### Validation
- [ ] Invalid `worktree.basePath` (non-existent parent directory) fails with clear error
- [ ] Relative `basePath` resolved relative to project root
- [ ] Config validation runs at startup, not at worktree creation time

### Config Loading
- [ ] Extend existing config loading in `src/core/config.ts`
- [ ] Add `WorktreeConfig` type to `src/types/index.ts`

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

- [ ] Config file with `worktree.enabled: true` makes worktrees default
- [ ] `--no-worktree` overrides config
- [ ] All tests pass
- [ ] `make verify` passes

---

**Effort:** small
**Labels:** git, worktree, configuration
