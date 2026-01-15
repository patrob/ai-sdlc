# Implementation Plan: S-0030 Worktree Configuration Support

## Overview

This plan implements configuration file support for git worktrees, allowing users to set worktrees as the default behavior via `.ai-sdlc.json` and providing a `--no-worktree` CLI flag to override when needed. The implementation follows existing patterns in the codebase for nested configuration (like TDD config) and boolean validation.

## Prerequisites

- S-0029 (Core Worktree Implementation) must be complete (verified: `src/core/worktree.ts` exists)
- Node.js and npm installed
- Tests passing before starting (`npm test`)

---

## Phase 1: Type Definitions and Default Configuration

**Goal**: Add the `WorktreeConfig` type and integrate defaults into the configuration system.

**Committable State**: Types compile, defaults are defined, but not yet used by CLI.

- [x] Add `WorktreeConfig` interface to `src/types/index.ts` after `TimeoutConfig` interface
- [x] Add `worktree?: WorktreeConfig` field to `Config` interface in `src/types/index.ts`
- [x] Add `WorktreeConfig` to the import statement in `src/core/config.ts`
- [x] Add `DEFAULT_WORKTREE_CONFIG` constant to `src/core/config.ts`
- [x] Add `worktree: { ...DEFAULT_WORKTREE_CONFIG }` to `DEFAULT_CONFIG` object
- [x] Add worktree config merging to `loadConfig()` function
- [x] Run `npm run build` to verify TypeScript compilation succeeds

**Phase 1 Acceptance Criteria**:
- TypeScript compiles without errors
- `DEFAULT_CONFIG.worktree.enabled` is `false`
- `DEFAULT_CONFIG.worktree.basePath` is `'.ai-sdlc/worktrees'`

---

## Phase 2: Configuration Validation and Path Resolution

**Goal**: Add validation logic for worktree configuration, including boolean validation and path resolution/validation.

**Committable State**: Config validation active, invalid configs produce warnings, paths resolved correctly.

- [x] Add worktree validation block to `sanitizeUserConfig()` function in `src/core/config.ts`
- [x] Add `validateWorktreeBasePath()` function to `src/core/config.ts`
- [x] Add `getWorktreeConfig()` helper function to `src/core/config.ts`
- [x] Export `validateWorktreeBasePath`, `getWorktreeConfig`, and `DEFAULT_WORKTREE_CONFIG`
- [x] Run `npm run build` to verify TypeScript compilation succeeds

**Phase 2 Acceptance Criteria**:
- Invalid `worktree.enabled` (non-boolean) produces warning and uses default
- Invalid `worktree.basePath` (non-string) produces warning and uses default
- Relative paths are resolved relative to project root
- Non-existent parent directory throws clear error

---

## Phase 3: CLI Integration and --no-worktree Flag

**Goal**: Add `--no-worktree` flag to CLI and integrate config-aware worktree decision logic.

**Committable State**: Full feature complete - worktrees can be enabled via config, overridden via `--no-worktree`.

- [x] Add `--no-worktree` option to `run` command in `src/index.ts`
- [x] Update worktree decision logic in `src/cli/commands.ts` `run()` function
- [x] Update `GitWorktreeService` constructor call to pass custom basePath from config
- [x] Update `GitWorktreeService` in `src/core/worktree.ts` to use the provided basePath directly
- [x] Run `npm run build && npm test` to verify everything passes

**Phase 3 Acceptance Criteria**:
- `--worktree` flag enables worktree when config has `enabled: false`
- `--no-worktree` flag disables worktree when config has `enabled: true`
- Config `worktree.enabled: true` enables worktree by default (with `--story`)
- Custom `basePath` from config is used for worktree location

---

## Phase 4: Testing

**Goal**: Add comprehensive unit and integration tests.

- [x] Add unit tests for worktree config defaults in `src/core/config.test.ts`
- [x] Add unit tests for worktree config validation in `src/core/config.test.ts`
- [x] Add unit tests for `validateWorktreeBasePath()` function
- [x] Add unit tests for custom basePath in `src/core/worktree.test.ts`
- [x] Run `npm test` to verify all tests pass

**Phase 4 Acceptance Criteria**:
- All unit tests pass
- Test coverage for:
  - Default config values
  - Boolean validation for `enabled`
  - String validation for `basePath`
  - Path resolution (relative/absolute)
  - Error on non-existent parent directory
  - Custom basePath in worktree service

---

## Validation Checklist

- [x] `npm run build` succeeds with no TypeScript errors
- [x] `npm test` passes with 0 failures (727 unit tests, 161 integration tests)
- [x] `make verify` passes (includes lint, build, test)
- [x] Config `{"worktree": {"enabled": true}}` with `--story` uses worktree
- [x] Config enabled + `--no-worktree` does NOT use worktree
- [x] Config disabled + `--worktree` uses worktree

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `WorktreeConfig` interface, add `worktree` field to `Config` |
| `src/core/config.ts` | Add defaults, validation, path resolution functions |
| `src/index.ts` | Add `--no-worktree` CLI option |
| `src/cli/commands.ts` | Config-aware worktree decision logic |
| `src/core/worktree.ts` | Support custom basePath (minor update) |
| `src/core/config.test.ts` | Add unit tests for worktree config |
| `src/core/worktree.test.ts` | Add unit tests for custom basePath |

---

## Example Configuration

```json
{
  "worktree": {
    "enabled": true,
    "basePath": ".ai-sdlc/worktrees"
  }
}
```
