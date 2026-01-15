# Research: Worktree Configuration Support (S-0030)

## 1. Problem Overview

**Problem Statement**: Add configuration file support so users can make git worktrees the default behavior for story execution.

**Key Objectives**:
- Add `worktree.enabled: boolean` option to `.ai-sdlc.json` config (default: false)
- Add `worktree.basePath: string` option to override default location (default: `.ai-sdlc/worktrees`)
- Add `--no-worktree` CLI flag to override config when worktrees are enabled
- Validate `basePath` at startup, not at worktree creation time
- Resolve relative paths relative to project root

**Success Criteria**:
- Existing behavior unchanged when config not present (backwards compatible)
- Config with `worktree.enabled: true` makes worktrees default for `--story` commands
- `--no-worktree` allows users to override config
- Invalid `basePath` fails fast at startup with clear error message
- All existing tests continue to pass

## 2. Web Research Findings

### Recommended Approaches and Patterns

#### Configuration Pattern: Simple JSON + Manual Validation
The codebase already uses a custom config loading pattern (not cosmiconfig) - follow existing patterns:
- Define interface in `src/types/index.ts`
- Add defaults constant in `src/core/config.ts`
- Merge with spread operator in `loadConfig()`
- Validate in `sanitizeUserConfig()`

#### Path Validation Best Practices
```typescript
// Resolve relative paths relative to project root
const resolvedPath = path.isAbsolute(basePath)
  ? basePath
  : path.resolve(projectRoot, basePath);

// Validate path exists and is a directory
if (!fs.existsSync(resolvedPath)) {
  throw new Error(`Worktree basePath does not exist: ${resolvedPath}`);
}
```

**Critical Security Notes**:
- Never use `path.join()` alone - it doesn't prevent directory traversal
- Always validate after resolution
- Fail-fast at startup, not at worktree creation

#### CLI Flag Pattern
Commander.js supports negation flags natively:
```typescript
.option('--worktree', 'Create isolated git worktree')
.option('--no-worktree', 'Disable worktree (override config)')
```

#### Configuration Precedence
Industry standard: **CLI flags > Config file > Defaults**

### Best Practices Summary
1. Keep defaults safe (`enabled: false`)
2. Validate paths at startup for fail-fast behavior
3. Use consistent patterns with existing config sections (TDD, daemon)
4. Provide clear error messages with resolution guidance

## 3. Codebase Analysis

### Affected Files

| File | Change Type | Purpose |
|------|-------------|---------|
| `src/types/index.ts` (line 321) | Modify | Add `WorktreeConfig` interface |
| `src/core/config.ts` (lines 38, 81, 259, 310, 558) | Modify | Defaults, validation, merging, path validation |
| `src/index.ts` (line 84) | Modify | Add `--no-worktree` flag |
| `src/core/worktree.ts` (lines 9-13, 39-42, 48-50) | Modify | Support custom base path |
| `src/cli/commands.ts` (lines 284, 296, 580-638) | Modify | Config-aware worktree decision logic |

### Existing Patterns to Follow

**Nested Config Pattern** (Reference: TDD config, lines 307-310 in config.ts):
```typescript
tdd: {
  ...DEFAULT_TDD_CONFIG,
  ...userConfig.tdd,
},
```

**Boolean Validation Pattern** (Reference: lines 220-225 in config.ts):
```typescript
if (userConfig.tdd.enabled !== undefined) {
  if (typeof userConfig.tdd.enabled !== 'boolean') {
    console.warn('Invalid tdd.enabled in config (must be boolean), using default');
    delete userConfig.tdd.enabled;
  }
}
```

**Path Resolution** (Reference: line 268 in config.ts):
```typescript
const configPath = path.join(workingDir, CONFIG_FILENAME);
```

### Current Worktree Implementation
- Flag: `--worktree` in `src/index.ts` line 84
- Validation: Lines 90-95 (requires `--story` flag)
- Creation: `src/cli/commands.ts` lines 585-638
- Path format: `{sdlcRoot}/worktrees/{storyId}-{slug}`
- Branch format: `ai-sdlc/{storyId}-{slug}`

### Integration Points
1. `GitWorktreeService` constructor needs optional `basePath` parameter
2. `run()` function needs to check config before creating worktree
3. `loadConfig()` needs to merge worktree config with defaults
4. `sanitizeUserConfig()` needs worktree validation block

## 4. Proposed Solution Approach

### High-Level Strategy
1. **Types First**: Define `WorktreeConfig` interface
2. **Config Layer**: Add defaults, validation, and merging
3. **CLI Layer**: Add `--no-worktree` flag
4. **Service Layer**: Update `GitWorktreeService` for custom basePath
5. **Command Layer**: Integrate config-based worktree decision logic

### Implementation Steps
1. Add `WorktreeConfig` interface to types
2. Add `DEFAULT_WORKTREE_CONFIG` constant
3. Add validation in `sanitizeUserConfig()`
4. Add merging in `loadConfig()`
5. Add `validateWorktreeBasePath()` function
6. Add `--no-worktree` flag to CLI
7. Update `GitWorktreeService` constructor and methods
8. Update `run()` with config-aware worktree logic

### Technology/Library Choices
- **No new dependencies** - use existing fs, path modules
- Follow existing validation patterns from config.ts
- Use Commander.js built-in negation flag support

### Risk Factors and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking changes | Default `enabled: false` preserves existing behavior |
| Path traversal | Validate path exists (requires explicit directory) |
| Validation timing | Only validate if `worktree.enabled: true` |
| BasePath typos | Fail-fast at startup with clear error message |

## 5. Example Code Snippets

### WorktreeConfig Interface
```typescript
// src/types/index.ts
export interface WorktreeConfig {
  /** Enable worktree mode by default. @default false */
  enabled: boolean;
  /** Base path for worktree directories. @default '{sdlcRoot}/worktrees' */
  basePath?: string;
}
```

### Default Configuration
```typescript
// src/core/config.ts
export const DEFAULT_WORKTREE_CONFIG: WorktreeConfig = {
  enabled: false,
};
```

### Path Validation Function
```typescript
// src/core/config.ts
export function validateWorktreeBasePath(basePath: string, projectRoot: string): string {
  const resolvedPath = path.isAbsolute(basePath)
    ? basePath
    : path.resolve(projectRoot, basePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Worktree basePath does not exist: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`Worktree basePath is not a directory: ${resolvedPath}`);
  }

  return resolvedPath;
}
```

### Worktree Decision Logic
```typescript
// src/cli/commands.ts
const shouldUseWorktree = (() => {
  if (options.noWorktree) return false;
  if (options.worktree) {
    if (!options.story) {
      console.log(c.error('Error: --worktree requires --story flag'));
      return false;
    }
    return true;
  }
  if (config.worktree?.enabled && options.story) {
    return true;
  }
  return false;
})();
```

## 6. Next Steps

### Prerequisites
- None - can start immediately

### Recommended Implementation Order
1. `src/types/index.ts` - Add WorktreeConfig interface
2. `src/core/config.ts` - Defaults, validation, merging, path validation function
3. `src/index.ts` - Add --no-worktree flag
4. `src/core/worktree.ts` - Support custom basePath
5. `src/cli/commands.ts` - Config-aware worktree decision logic
6. Unit tests for config validation
7. Integration tests for CLI flag combinations

### Testing Considerations

**Unit Tests** (src/core/config.test.ts):
- Default worktree config values
- Validation of `enabled` (must be boolean)
- Validation of `basePath` (must be non-empty string)
- Config merging with user values

**Unit Tests** (src/core/worktree.test.ts):
- Custom base path in constructor
- `getWorktreePath()` with custom base
- Create with `customBasePath` option

**New Unit Test File** (src/core/config-worktree-validation.test.ts):
- Path resolution (relative/absolute)
- Non-existent path error
- File instead of directory error
- Paths with `..` navigation

**Integration Tests** (tests/integration/worktree-config.test.ts):
- Config-enabled worktree creation
- `--no-worktree` override
- basePath validation at startup
- Custom basePath usage
