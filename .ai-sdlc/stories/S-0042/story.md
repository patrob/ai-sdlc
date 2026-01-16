---
id: S-0042
title: Enable Agent Skills Infrastructure
priority: 50
status: in-progress
type: feature
created: '2026-01-15'
labels:
  - agent-sdk
  - skills
  - infrastructure
  - s
estimated_effort: small
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
slug: enable-agent-skills-infrastructure
worktree_path: >-
  /Users/probinson/Repos/on-par/pocs/ai-sdlc/.ai-sdlc/worktrees/S-0042-enable-agent-skills-infrastructure
updated: '2026-01-16'
branch: ai-sdlc/enable-agent-skills-infrastructure
last_test_run:
  passed: true
  failures: 0
  timestamp: '2026-01-16T22:27:02.221Z'
implementation_retry_count: 0
---
# Enable Agent Skills Infrastructure

## User Story

**As a** developer using ai-sdlc,
**I want** the Claude Agent SDK to discover and load Skills from the filesystem,
**So that** I can extend agent behavior with custom SKILL.md files without modifying source code.

## Summary

Enable the Claude Agent SDK Skills feature by configuring `settingSources` to load settings from the filesystem. This allows SKILL.md files placed in `.claude/skills/` directories to be discovered and invoked autonomously by the agent, providing a plugin-like extension mechanism for specialized agent behaviors.

## Context

Agent Skills are a Claude Agent SDK feature that packages specialized knowledge and instructions as filesystem artifacts. When enabled, the SDK automatically discovers and makes these Skills available to Claude for autonomous invocation.

**How Skills Work:**
- Defined as `SKILL.md` files with YAML frontmatter (name, description) and Markdown content (instructions)
- Placed in `.claude/skills/<skill-name>/SKILL.md` directories
- Discovered by SDK when `settingSources` includes `'project'` or `'user'`
- Invoked autonomously by Claude when task context matches the Skill's description
- Agent receives Skill instructions and executes them like built-in capabilities

**Reference Documentation:**
- Claude Agent SDK Skills: https://platform.claude.com/docs/en/agent-sdk/skills
- Skills require `settingSources: ['user', 'project']` for filesystem loading
- The SDK handles discovery, validation, and tool registration automatically

**Current State:**
- `src/core/client.ts` already passes `settingSources` to SDK queries
- `src/types/index.ts` defines `SettingSource` type with correct values
- Default config may not include `settingSources` or may not enable Skills

## Acceptance Criteria

### Configuration
- [ ] Default config includes `settingSources: ['project']` to enable Skills discovery
- [ ] `settingSources` is correctly passed from config → client → SDK query
- [ ] Config type definitions support `settingSources` field (verify/add if missing)

### Functionality
- [ ] Skills placed in `.claude/skills/<skill-name>/SKILL.md` are discoverable by the SDK
- [ ] Agent can invoke Skills autonomously (manual verification)
- [ ] Empty or missing `.claude/skills/` directory does not cause errors

### Testing & Quality
- [ ] All existing tests pass (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] No regressions in existing agent functionality (query, research, refine, etc.)
- [ ] Add unit test verifying default config includes `settingSources`

### Documentation
- [ ] Add comment in `config.ts` explaining `settingSources` and Skills
- [ ] Update inline documentation about Skills discovery mechanism

## Technical Implementation Notes

### Configuration Changes

Update `src/core/config.ts` to include `settingSources` in the default configuration:

```typescript
// src/core/config.ts
const DEFAULT_CONFIG: Config = {
  // ... existing defaults
  settingSources: ['project'], // Enables Skills discovery from .claude/skills/
};
```

**Why `'project'`?**
- `'project'`: Loads Skills from `.claude/skills/` in the project directory
- `'user'`: Loads Skills from user's global `.claude/skills/` directory
- Starting with `'project'` keeps Skills project-scoped and version-controlled

### SDK Integration Point

The existing code in `src/core/client.ts` already passes `settingSources`:

```typescript
const response = query({
  prompt: options.prompt,
  options: {
    settingSources: settingSources, // Already wired through
  },
});
```

No changes needed here unless `settingSources` is not being extracted from config.

### SDK Behavior (No Code Required)

The Claude Agent SDK automatically:
1. Discovers `SKILL.md` files from configured locations
2. Parses YAML frontmatter (name, description) and Markdown content
3. Registers a `Skill` tool in Claude's tool inventory
4. Invokes Skills when Claude determines context matches the description
5. Logs warnings for invalid Skill files (malformed YAML, missing fields)

### Verification Steps

After implementation, manually verify Skills work:

1. Create `.claude/skills/hello-world/SKILL.md`:
```markdown
---
name: hello-world
description: Test Skill that responds to greetings with enthusiasm
---

When the user greets you, respond with extra enthusiasm and mention that you're using a Skill.
```

2. Run an agent query: `ai-sdlc query "Hello!"`
3. Confirm the agent's response shows Skill was invoked (should mention it's using a Skill)

### Files to Modify

- **`src/core/config.ts`**: Add `settingSources: ['project']` to default config
- **`src/types/index.ts`**: Verify `Config` type includes `settingSources?: SettingSource[]` field
- **`src/core/config.test.ts`** (or create): Add test verifying default config includes `settingSources`

## Edge Cases & Constraints

### Edge Cases

1. **No `.claude/skills/` directory exists**
   - Expected: SDK handles gracefully, no Skills loaded, no errors
   - Impact: None - agent functions normally without Skills

2. **Invalid `SKILL.md` files (malformed YAML, missing fields)**
   - Expected: SDK logs warning, skips invalid Skill, continues loading others
   - Impact: Other valid Skills still work

3. **Empty `settingSources` array or undefined**
   - Expected: Skills disabled (SDK isolation mode), agent functions without Skills
   - Impact: Feature not available, but no crashes

4. **`settingSources: ['user']` without `'project'`**
   - Expected: Only user-level Skills loaded (from `~/.claude/skills/`)
   - Impact: Project-specific Skills in `.claude/skills/` ignored

5. **Multiple Skills with same name**
   - Expected: SDK behavior (likely last-one-wins or logs warning)
   - Impact: Document SDK behavior if discoverable, otherwise accept SDK default

### Constraints

- **No breaking changes**: Existing agent functionality must remain intact
- **SDK version dependency**: Skills feature requires compatible Claude Agent SDK version (verify package.json)
- **Filesystem access**: Skills require read access to `.claude/skills/` directory
- **Scope**: This story only enables the infrastructure; actual SKILL.md files created in follow-up stories

## Dependencies

- **None**: This is foundational infrastructure for Skills
- **Blocks**: S-0043 (Core SDLC Agent Skills) - requires this infrastructure to function

## Definition of Done

- [ ] `settingSources` defaults to `['project']` in config
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Unit test added for default config `settingSources`
- [ ] Manual verification: Test Skill is discoverable and invoked
- [ ] Code reviewed (if applicable)
- [ ] No regressions in existing agent commands (query, refine, research, etc.)

---

**Effort:** small  
**Labels:** infrastructure, configuration, skills, sdk-feature

## Research

Perfect! Now I have enough context. Let me compile the research findings:

---

# Research: Enable Agent Skills Infrastructure

## Problem Summary

The goal is to enable the Claude Agent SDK's Skills feature by configuring `settingSources` to include `'project'` in the default configuration. This allows the SDK to automatically discover and load SKILL.md files from `.claude/skills/` directories, providing a plugin-like extension mechanism for specialized agent behaviors. Currently, `settingSources` defaults to an empty array (SDK isolation mode), which disables Skills discovery.

## Codebase Context

### Existing Infrastructure

The codebase **already has the foundational infrastructure** for Skills:

1. **Type Definitions** (`src/types/index.ts:12`):
   - `SettingSource` type defined as `'user' | 'project' | 'local'`
   - `Config` interface includes optional `settingSources?: SettingSource[]` field (lines 505-515)
   - Comprehensive documentation explains each setting source type

2. **Configuration System** (`src/core/config.ts:94`):
   - `DEFAULT_CONFIG` currently sets `settingSources: []` (isolation mode)
   - Configuration loading and merging logic fully implemented
   - Validation for `settingSources` already exists (lines 188-206)
   - Security validation ensures only valid source types are accepted

3. **Client Integration** (`src/core/client.ts:133-154`):
   - `runAgentQuery()` loads config and extracts `settingSources` (line 133)
   - SDK `query()` call passes `settingSources` to the agent (line 154)
   - No modifications needed to client.ts

4. **Existing Configuration Files**:
   - `docs/example-config-with-project-settings.json` shows `settingSources: ["project"]` as an example
   - Current project `.ai-sdlc.json` already uses `settingSources: ["project"]` (line 12)

### Existing Patterns

**CLAUDE.md Discovery Pattern:**
The codebase recently implemented CLAUDE.md auto-discovery (see `docs/CLAUDE-MD-FEATURE.md`), which uses the same `settingSources` mechanism. This proves the infrastructure works and provides a reference for how Skills discovery will function.

**Configuration Testing Pattern:**
`src/core/config.test.ts` provides comprehensive test patterns for:
- Default configuration values (lines 8-32 for TDD, lines 171-188 for review config)
- User configuration overrides (lines 62-78)
- Validation and sanitization (lines 80-147)

## Files Requiring Changes

### 1. `src/core/config.ts`
- **Path**: `src/core/config.ts:94`
- **Change Type**: Modify Existing
- **Reason**: Update default configuration to enable Skills discovery
- **Specific Changes**: 
  - Change line 94 from `settingSources: []` to `settingSources: ['project']`
  - Add inline comment explaining that `['project']` enables Skills discovery
- **Dependencies**: None - standalone change

### 2. `src/core/config.test.ts`
- **Path**: `src/core/config.test.ts`
- **Change Type**: Modify Existing
- **Reason**: Add test to verify default config includes `settingSources`
- **Specific Changes**:
  - Add new test case in existing describe block
  - Verify `DEFAULT_CONFIG.settingSources` equals `['project']`
  - Follow existing test pattern (see lines 8-31 for similar structure)
- **Dependencies**: Must run after config.ts is updated

## Testing Strategy

### Test Files to Modify

**`src/core/config.test.ts`**:
- Add a new test case verifying `settingSources` defaults to `['project']`
- Place in a new describe block: `describe('config - Skills infrastructure defaults')`
- Follow the existing pattern used for TDD config tests (lines 7-32)

### New Tests Needed

**Unit Test Example:**
\`\`\`typescript
describe('config - Skills infrastructure defaults', () => {
  it('should have settingSources set to ["project"] by default', () => {
    expect(DEFAULT_CONFIG.settingSources).toBeDefined();
    expect(DEFAULT_CONFIG.settingSources).toEqual(['project']);
  });

  it('should load default settingSources when no config file exists', () => {
    const tempDir = '.test-skills-config';
    fs.mkdirSync(tempDir);
    try {
      const config = loadConfig(tempDir);
      expect(config.settingSources).toEqual(['project']);
    } finally {
      fs.rmdirSync(tempDir);
    }
  });
});
\`\`\`

### Test Scenarios

1. **Happy Path**: Default config includes `settingSources: ['project']`
2. **User Override**: User config can override to `[]`, `['user']`, or `['project', 'user']`
3. **Validation**: Invalid values are filtered (already tested in config-security.test.ts)
4. **SDK Integration**: Skills are discovered (manual verification - SDK behavior, not unit tested)

### Manual Verification

After implementation, verify Skills work by:
1. Create `.claude/skills/hello-world/SKILL.md`:
   \`\`\`markdown
   ---
   name: hello-world
   description: Test Skill for verifying Skills infrastructure
   ---
   When greeted, respond with extra enthusiasm.
   \`\`\`
2. Run: `ai-sdlc query "Hello!"`
3. Verify agent response shows Skill was invoked (agent should mention using a Skill)

## Additional Context

### Relevant Patterns

**Configuration Default Pattern** (`src/core/config.ts:66-105`):
- All configuration sections use spread operator to merge defaults
- Comments explain purpose of each field
- Security validation applied to all user inputs

**Testing Pattern for Configuration** (`src/core/config.test.ts:7-168`):
- Each config section has dedicated describe block
- Tests verify defaults, user overrides, and validation
- Temporary directories used for file-based tests
- Cleanup in afterEach hooks

### Potential Risks

1. **Breaking Change Concern**: ✅ **MITIGATED**
   - Changing default from `[]` to `['project']` enables Skills discovery for all users
   - However, if `.claude/skills/` directory doesn't exist, SDK handles gracefully (no errors)
   - Users can override to `settingSources: []` if they want isolation mode

2. **Skill Conflicts**: ✅ **ACCEPTABLE RISK**
   - If users create Skills with overly broad descriptions, Claude might invoke them unexpectedly
   - This is expected behavior - Skills are designed for autonomous invocation
   - Mitigation: S-0043 will create well-scoped Skill descriptions

3. **Performance Impact**: ✅ **NEGLIGIBLE**
   - SDK scans `.claude/skills/` on startup (one-time cost)
   - No runtime performance impact during agent queries

### Security Implications

**Validation Already Implemented** (`src/core/config.ts:188-206`):
- User-provided `settingSources` validated against whitelist `['user', 'project', 'local']`
- Invalid values filtered out with warning
- No command injection or path traversal risks (SDK controls file loading)

**Skills Content Trust**:
- Skills are loaded from project repository (version-controlled)
- No arbitrary code execution - Skills are markdown instructions only
- Same trust model as CLAUDE.md files

### Performance Considerations

- Skills discovery is filesystem-based (instant for small projects)
- SDK caches discovered Skills (no repeated scans)
- Empty `.claude/skills/` directory has no performance penalty

### Dependencies

**Blocks**: S-0043 (Create Core SDLC Agent Skills)
- S-0043 requires this infrastructure to be enabled
- S-0043 will create actual SKILL.md files in `.claude/skills/`

**SDK Version**: Current Claude Agent SDK version supports Skills (confirmed by existing `settingSources` implementation)

### Alternative Approaches

**Option 1: Keep `settingSources: []` (Rejected)**
- Maintains current isolation mode
- Requires every project to manually enable Skills
- Goes against the story goal of "enabling Skills infrastructure"

**Option 2: Use `['project', 'user']` (Considered, Rejected)**
- Enables both project and user Skills
- May cause confusion if user has global Skills
- Start with `['project']` only (project-scoped), expand if needed

**Option 3: Add CLI command to enable Skills (Over-engineering)**
- Adds unnecessary complexity
- Configuration file is the standard way to enable features
- KISS principle: just change the default

### Implementation Sequence

1. ✅ Update `src/core/config.ts` line 94: `settingSources: ['project']`
2. ✅ Add comment explaining Skills discovery
3. ✅ Add unit test in `src/core/config.test.ts`
4. ✅ Run `npm test` to verify all tests pass
5. ✅ Run `npm run build` to verify TypeScript compilation
6. ✅ Manual verification with test Skill (optional, but recommended)

### Edge Cases

1. **Missing `.claude/` directory**: SDK handles gracefully (no errors)
2. **Missing `.claude/skills/` directory**: SDK handles gracefully (no errors)
3. **Empty `.claude/skills/` directory**: No Skills loaded, no errors
4. **Invalid SKILL.md format**: SDK logs warning, skips invalid Skill, continues
5. **User overrides to `[]`**: Skills disabled, system works as before

### Success Criteria

✅ **Implementation Complete When:**
- `DEFAULT_CONFIG.settingSources` equals `['project']`
- Inline comment explains Skills discovery purpose
- Unit test added and passing
- All existing tests still pass
- TypeScript compilation succeeds
- No regressions in existing agent commands

---

## Summary

**Complexity**: ⭐ Small (1-line config change + 1 test)

**Key Insight**: The infrastructure is **already complete**. All that's needed is changing the default from `settingSources: []` to `settingSources: ['project']` and adding a test. The SDK handles everything else automatically.

**No Code Changes Needed In:**
- `src/core/client.ts` (already wired)
- `src/types/index.ts` (types already defined)
- Agent files (no changes needed)

**Implementation Time**: ~15 minutes (config change + test + verification)

## Implementation Plan

# Implementation Plan: Enable Agent Skills Infrastructure

## Overview

This plan enables the Claude Agent SDK's Skills feature by updating the default configuration to include `settingSources: ['project']`. The infrastructure is already complete; we only need to change the default value and add verification tests.

**Estimated Time**: 15-20 minutes  
**Complexity**: Small (1-line config change + tests)  
**Risk Level**: Low (SDK handles gracefully if Skills directory missing)

---

## Phase 1: Configuration Update

- [ ] **T1**: Update default configuration to enable Skills discovery
  - Files: `src/core/config.ts`
  - Dependencies: none
  - Change line 94 from `settingSources: []` to `settingSources: ['project']`
  - Add inline comment explaining that this enables Skills discovery from `.claude/skills/`

---

## Phase 2: Test Implementation

- [ ] **T2**: Add unit test for default settingSources configuration
  - Files: `src/core/config.test.ts`
  - Dependencies: T1
  - Create new describe block: `describe('config - Skills infrastructure defaults')`
  - Add test verifying `DEFAULT_CONFIG.settingSources` equals `['project']`
  - Add test verifying `loadConfig()` returns default `settingSources` when no config file exists
  - Follow existing test patterns (lines 7-32 for structure reference)

---

## Phase 3: Verification & Quality Assurance

- [ ] **T3**: Run test suite to verify no regressions
  - Files: N/A (test execution)
  - Dependencies: T2
  - Execute `npm test`
  - Verify all tests pass (0 failures)
  - Confirm new Skills infrastructure tests pass

- [ ] **T4**: Verify TypeScript compilation
  - Files: N/A (build verification)
  - Dependencies: T3
  - Execute `npm run build`
  - Confirm no TypeScript errors
  - Verify type checking passes for `settingSources` field

---

## Phase 4: Manual Verification (Optional but Recommended)

- [ ] **T5**: Create test Skill for manual verification
  - Files: `.claude/skills/hello-world/SKILL.md` (test artifact, not committed)
  - Dependencies: T4
  - Create directory: `.claude/skills/hello-world/`
  - Create `SKILL.md` with YAML frontmatter and test instructions
  - Document: This is a test artifact for verification only

- [ ] **T6**: Verify Skills discovery works end-to-end
  - Files: N/A (manual testing)
  - Dependencies: T5
  - Run: `ai-sdlc query "Hello!"`
  - Confirm agent response indicates Skill was invoked
  - Clean up test Skill directory after verification

---

## Phase 5: Documentation & Finalization

- [ ] **T7**: Update story status and documentation
  - Files: `.ai-sdlc/stories/S-0042-enable-agent-skills-infrastructure.md`
  - Dependencies: T6
  - Mark implementation tasks as complete
  - Document test results (npm test output)
  - Document build verification (npm run build output)
  - Update story status to reflect completion

---

## Implementation Tasks Summary

### Files to Modify
1. **`src/core/config.ts`** (Line 94)
   - Change: `settingSources: []` → `settingSources: ['project']`
   - Add: Inline comment explaining Skills discovery

2. **`src/core/config.test.ts`**
   - Add: New describe block for Skills infrastructure tests
   - Add: Test verifying default `settingSources` value
   - Add: Test verifying `loadConfig()` behavior

3. **`.ai-sdlc/stories/S-0042-enable-agent-skills-infrastructure.md`**
   - Update: Story status with implementation results
   - Document: Test and build verification outcomes

### Tests to Write

**Test 1: Default Configuration Value**
```typescript
describe('config - Skills infrastructure defaults', () => {
  it('should have settingSources set to ["project"] by default', () => {
    expect(DEFAULT_CONFIG.settingSources).toBeDefined();
    expect(DEFAULT_CONFIG.settingSources).toEqual(['project']);
  });
});
```

**Test 2: Configuration Loading Behavior**
```typescript
it('should load default settingSources when no config file exists', () => {
  const tempDir = '.test-skills-config';
  fs.mkdirSync(tempDir, { recursive: true });
  try {
    const config = loadConfig(tempDir);
    expect(config.settingSources).toEqual(['project']);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
```

### Verification Checklist

**Pre-Implementation:**
- [ ] Confirm current default is `settingSources: []` (line 94)
- [ ] Verify `Config` type includes `settingSources?: SettingSource[]` field
- [ ] Confirm SDK integration already passes `settingSources` to queries

**Post-Implementation:**
- [ ] All existing tests pass (`npm test`)
- [ ] New Skills tests pass
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] No type errors related to `settingSources`
- [ ] Manual verification shows Skills are discoverable (optional)

**Quality Gates:**
- [ ] No breaking changes to existing functionality
- [ ] No regressions in agent commands (query, refine, research, etc.)
- [ ] Configuration validation still works correctly
- [ ] User can still override `settingSources` via config file

---

## Edge Cases Handled by Implementation

1. **Missing `.claude/skills/` directory**: SDK handles gracefully (no errors)
2. **Empty `.claude/skills/` directory**: No Skills loaded, no errors
3. **Invalid SKILL.md files**: SDK logs warning, skips invalid, continues
4. **User overrides to `[]`**: Skills disabled, system works as before
5. **User adds `'user'` to array**: Both project and user Skills loaded

---

## Success Criteria

✅ **Implementation is complete when:**
1. `DEFAULT_CONFIG.settingSources` equals `['project']` with explanatory comment
2. Unit tests added and passing for default configuration
3. All existing tests still pass (`npm test` shows 0 failures)
4. TypeScript compilation succeeds (`npm run build`)
5. No regressions in existing agent commands
6. Story updated with implementation results

---

## Notes

- **No changes needed** in `src/core/client.ts` (already wired)
- **No changes needed** in `src/types/index.ts` (types already defined)
- **Test Skill creation** (T5) is optional but recommended for confidence
- **This unblocks** S-0043 (Create Core SDLC Agent Skills)


### Implementation Notes (2026-01-16)

I need user approval to run the tests. Let me ask for approval to proceed:

I've completed the code changes for enabling Agent Skills infrastructure:

**Changes Made:**

1. ✅ **Configuration Update** (`src/core/config.ts`):
   - Changed `settingSources: []` to `settingSources: ['project']` on line 94
   - Updated comment to explain this enables Skills discovery from `.claude/skills/`

2. ✅ **Test Implementation** (`src/core/config.test.ts`):
   - Added new test suite: "config - Skills infrastructure defaults"
   - Tests verify:
     - Default config includes `settingSources: ['project']`
     - `loadConfig()` returns correct default when no config file exists
     - Users can override via config file (add `'user'`, set to empty array, etc.)
   - All tests follow existing patterns with proper cleanup

**Next Steps:**

I need your approval to run:
1. `npm test` - to verify all tests pass (including the new Skills tests)
2. `npm run build` - to verify TypeScript compilation succeeds

These commands are required to complete the implementation and ensure no regressions were introduced.

**May I proceed with running these verification commands?**
