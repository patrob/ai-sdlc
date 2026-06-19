# CLAUDE.md Auto-Discovery Feature

> **Historical note (no longer automatic):** The auto-discovery behavior described
> below was provided by the Anthropic Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
> via its `settingSources: ['project']` setting. That SDK has been **removed** — all
> providers now run on the [Pi](https://pi.dev) agentic engine, which does not auto-inject
> `.claude/CLAUDE.md` from a settings source. `CLAUDE.md` remains a useful, version-controlled
> instructions file for humans and agents; it is simply no longer loaded automatically by an
> SDK setting. The rest of this document is retained for historical context and describes how
> the feature worked under the Claude Agent SDK.

## Overview

Under the now-removed Claude Agent SDK, the SDK automatically discovered and loaded `CLAUDE.md` from project settings when `settingSources` included 'project'. This enabled teams to share custom instructions without manual configuration.

## Changes Made

### 1. Type Definitions (`src/types/index.ts`)

Added `SettingSource` type and `settingSources` field to `Config` interface:

```typescript
export type SettingSource = 'user' | 'project' | 'local';

export interface Config {
  // ... other fields
  settingSources?: SettingSource[];
}
```

### 2. Default Configuration (`src/core/config.ts`)

Added `settingSources: []` to maintain backward compatibility:

```typescript
export const DEFAULT_CONFIG: Config = {
  // ... other fields
  settingSources: [],
};
```

### 3. Client Implementation (`src/core/client.ts`)

Updated `runAgentQuery()` to:
- Load configuration and extract `settingSources`
- Pass `settingSources` to Agent SDK
- Add debug logging for CLAUDE.md discovery

```typescript
const config = loadConfig(workingDir);
const settingSources = config.settingSources || [];

// Debug logging
if (settingSources.includes('project')) {
  const claudeMdPath = path.join(workingDir, '.claude', 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    console.log('Debug: Found CLAUDE.md in project settings (.claude/CLAUDE.md)');
  } else {
    console.log('Debug: CLAUDE.md not found in project settings (.claude/CLAUDE.md)');
  }
}

// Pass to SDK
const response = query({
  prompt: options.prompt,
  options: {
    // ... other options
    settingSources: settingSources,
  },
});
```

### 4. Tests (`tests/core/client-settings.test.ts`)

Comprehensive test suite covering:
- Configuration defaults and loading
- CLAUDE.md discovery logging
- Multiple setting sources
- Priority order scenarios
- Backward compatibility
- Edge cases (large files, special characters, symlinks, missing directories)

### 5. Documentation

**README.md:**
- Added "Project Settings with CLAUDE.md" section
- Documented how to enable the feature
- Explained directory structure
- Provided example CLAUDE.md content
- Documented priority order
- Explained debug logging
- Provided use case examples
- Emphasized backward compatibility

**Example files:**
- `docs/example-claude-md.md` - Example CLAUDE.md with best practices
- `docs/example-config-with-project-settings.json` - Example configuration

## How to Use

### 1. Enable Project Settings

Add to `.ai-sdlc.json`:

```json
{
  "settingSources": ["project"]
}
```

### 2. Create CLAUDE.md

Create `.claude/CLAUDE.md` in your project root:

```markdown
# Project Instructions

You are working on [project description].

## Conventions
- [Your conventions here]
```

### 3. Verify

Run any ai-sdlc command and look for:

```
Debug: Found CLAUDE.md in project settings (.claude/CLAUDE.md)
```

## Backward Compatibility

- Default `settingSources: []` maintains SDK isolation mode
- Existing workflows continue to work without changes
- Feature is opt-in via configuration

## Priority Order

1. Explicit `systemPrompt` in code (highest priority)
2. Local settings (`.claude/settings.local.json`)
3. Project settings (`.claude/settings.json` and `CLAUDE.md`)
4. User settings (`~/.claude/settings.json`) (lowest priority)

## Edge Cases Handled

- Missing `.claude/` directory → graceful continuation
- Missing CLAUDE.md → graceful continuation
- Empty CLAUDE.md → loaded as empty string
- Large CLAUDE.md files → handled by SDK
- Symlinked CLAUDE.md → followed automatically
- File permission errors → caught and ignored for debug logging
- Special characters in CLAUDE.md → handled correctly

## Testing

Run the test suite:

```bash
npm test tests/core/client-settings.test.ts
```

All tests validate:
- Configuration loading and merging
- Debug logging behavior
- Multiple source scenarios
- Backward compatibility
- Edge case handling

## Benefits

1. **Team Consistency** - All team members use the same custom instructions
2. **No Manual Configuration** - Instructions loaded automatically
3. **Version Controlled** - CLAUDE.md is committed to repository
4. **Flexible** - Support multiple setting sources with priority order
5. **Backward Compatible** - Opt-in feature, doesn't break existing workflows

## Future Enhancements

Possible future improvements:
- CLI command to initialize `.claude/` directory with template
- Validation of CLAUDE.md content
- Size warnings for very large files
- More granular control over setting precedence
