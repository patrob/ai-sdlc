---
id: S-0097
title: Restructure Project as Monorepo with Packages
priority: 1
status: backlog
type: refactor
created: '2026-01-19'
labels:
  - architecture
  - monorepo
  - epic-conversational-tui
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: monorepo-restructure
dependencies: []
---
# Restructure Project as Monorepo with Packages

## User Story

**As a** developer maintaining ai-sdlc
**I want** the project restructured as a monorepo with separate packages
**So that** the CLI and TUI can share core logic while evolving independently

## Summary

Restructure ai-sdlc into a monorepo with three packages: `@ai-sdlc/core` (agents, client, state), `@ai-sdlc/cli` (commander-based CLI), and `@ai-sdlc/tui` (future Ink-based TUI). This enables clean separation of concerns and allows both interfaces to share the same core logic.

## Technical Context

**Current State:**
- Single package structure with all code in `src/`
- CLI code mixed with core agent/client logic
- Entry point at `src/index.ts` handles everything

**Target State:**
- Monorepo using npm workspaces
- `packages/core/` - agents, client, kanban, config, state management
- `packages/cli/` - commander setup, commands, formatting, daemon
- `packages/tui/` - placeholder for future Ink-based TUI
- Shared TypeScript config and build tooling

## Acceptance Criteria

### Package Structure

- [ ] Create `packages/` directory with three packages:
  ```
  packages/
  ├── core/
  │   ├── package.json      # @ai-sdlc/core
  │   ├── tsconfig.json
  │   └── src/
  │       ├── agents/       # From src/agents/
  │       ├── core/         # From src/core/
  │       └── index.ts      # Barrel export
  ├── cli/
  │   ├── package.json      # @ai-sdlc/cli (main package)
  │   ├── tsconfig.json
  │   └── src/
  │       ├── cli/          # From src/cli/
  │       └── index.ts      # Entry point
  └── tui/
      ├── package.json      # @ai-sdlc/tui
      ├── tsconfig.json
      └── src/
          └── index.ts      # Placeholder
  ```

### Workspace Configuration

- [ ] Root `package.json` configured as workspace root:
  ```json
  {
    "name": "ai-sdlc",
    "private": true,
    "workspaces": ["packages/*"]
  }
  ```

- [ ] Each package has proper `package.json`:
  - `@ai-sdlc/core` - no bin, exports types and functions
  - `@ai-sdlc/cli` - bin: `ai-sdlc`, depends on `@ai-sdlc/core`
  - `@ai-sdlc/tui` - bin: `ai-sdlc-tui`, depends on `@ai-sdlc/core`

### Build Configuration

- [ ] Root `tsconfig.json` with project references
- [ ] Each package extends base config
- [ ] `npm run build` builds all packages in dependency order
- [ ] `npm run dev` watches all packages

### Backward Compatibility

- [ ] `npx ai-sdlc` continues to work (CLI package)
- [ ] All existing CLI commands work identically
- [ ] Tests pass without modification (paths updated)
- [ ] `make verify` passes

### Import Updates

- [ ] CLI imports from `@ai-sdlc/core` instead of relative paths
- [ ] No circular dependencies between packages
- [ ] Clean barrel exports from each package

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Convert to workspace root |
| `tsconfig.json` | Add project references |
| `Makefile` | Update build/test commands for workspaces |

## Files to Create

| File | Purpose |
|------|---------|
| `packages/core/package.json` | Core package config |
| `packages/core/tsconfig.json` | Core TypeScript config |
| `packages/core/src/index.ts` | Core barrel export |
| `packages/cli/package.json` | CLI package config |
| `packages/cli/tsconfig.json` | CLI TypeScript config |
| `packages/cli/src/index.ts` | CLI entry point |
| `packages/tui/package.json` | TUI package config |
| `packages/tui/tsconfig.json` | TUI TypeScript config |
| `packages/tui/src/index.ts` | TUI placeholder |

## Files to Move

| From | To |
|------|-----|
| `src/agents/*` | `packages/core/src/agents/` |
| `src/core/*` | `packages/core/src/core/` |
| `src/cli/*` | `packages/cli/src/cli/` |
| `src/index.ts` | `packages/cli/src/index.ts` |
| `tests/` | `packages/*/tests/` (split by package) |

## Implementation Notes

```json
// packages/core/package.json
{
  "name": "@ai-sdlc/core",
  "version": "0.3.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./agents": "./dist/agents/index.js",
    "./core": "./dist/core/index.js"
  }
}

// packages/cli/package.json
{
  "name": "@ai-sdlc/cli",
  "version": "0.3.0",
  "bin": {
    "ai-sdlc": "./dist/index.js"
  },
  "dependencies": {
    "@ai-sdlc/core": "workspace:*"
  }
}
```

### Migration Strategy

1. Create package structure (directories, configs)
2. Move files to new locations
3. Update all imports to use package names
4. Update build scripts for workspaces
5. Run tests to verify nothing broke
6. Update CI/CD if applicable

## Testing Requirements

- [ ] All existing unit tests pass (relocated)
- [ ] All existing integration tests pass
- [ ] `npm install` from fresh clone works
- [ ] `npx ai-sdlc --help` works
- [ ] `npx ai-sdlc status` works
- [ ] `npm test` runs tests across all packages
- [ ] `npm run build` builds all packages
- [ ] `make verify` passes

## Definition of Done

- [ ] Monorepo structure in place
- [ ] All packages build successfully
- [ ] CLI works identically to before
- [ ] Tests pass across all packages
- [ ] No circular dependencies
- [ ] `make verify` passes

## References

- npm workspaces: https://docs.npmjs.com/cli/v7/using-npm/workspaces
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- Related: S-0078 (IProvider Interface) - will live in core package
