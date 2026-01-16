---
id: S-0042
title: Enable Agent Skills Infrastructure
priority: 50
status: backlog
type: feature
created: '2026-01-15'
labels:
  - agent-sdk
  - skills
  - infrastructure
estimated_effort: small
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: enable-agent-skills-infrastructure
---
# Enable Agent Skills Infrastructure

## User Story

**As a** developer using ai-sdlc,
**I want** the Claude Agent SDK to discover and load Skills from the filesystem,
**So that** I can extend agent behavior with custom SKILL.md files without code changes.

## Summary

Enable the Claude Agent SDK Skills feature by configuring `settingSources` to load settings from the filesystem. This allows SKILL.md files placed in `.claude/skills/` directories to be discovered and invoked autonomously by the agent.

## Context

Agent Skills are a Claude Agent SDK feature that allows packaging specialized knowledge and instructions as filesystem artifacts. Skills are:
- Defined as `SKILL.md` files with YAML frontmatter and Markdown content
- Loaded from `.claude/skills/*/SKILL.md` directories
- Invoked autonomously by Claude when the context matches the Skill's description

**Reference Documentation:**
- Claude Agent SDK Skills: https://platform.claude.com/docs/en/agent-sdk/skills
- Skills require `settingSources: ['user', 'project']` to load from filesystem
- The SDK handles Skill discovery automatically when settingSources is configured

## Acceptance Criteria

- [ ] Config defaults `settingSources` to include 'project' for Skills discovery
- [ ] SDK query passes `settingSources` correctly to enable Skills loading
- [ ] Skills in `.claude/skills/` directory are discoverable
- [ ] Add config documentation explaining Skills configuration
- [ ] Existing agent functionality not broken (all existing tests pass)
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### Configuration Changes

The key change is ensuring `settingSources` includes `'project'` (or `'user'` for global Skills):

```typescript
// src/core/config.ts
// Default settingSources should enable Skills discovery
const DEFAULT_CONFIG: Config = {
  // ... existing defaults
  settingSources: ['project'], // Enables Skills from .claude/skills/
};
```

### SDK Integration

The `src/core/client.ts` already passes `settingSources` to the SDK:

```typescript
const response = query({
  prompt: options.prompt,
  options: {
    // ... other options
    settingSources: settingSources, // Already passed from config
  },
});
```

The SDK automatically:
1. Discovers SKILL.md files from configured locations
2. Makes the `Skill` tool available to Claude
3. Invokes Skills autonomously based on description matching

### Verification

After implementation, verify Skills are working by:
1. Creating a test SKILL.md file in `.claude/skills/test-skill/SKILL.md`
2. Running an agent query with context matching the Skill's description
3. Confirming the Skill was invoked (visible in agent output)

### Files to Modify

- `src/core/config.ts` - Update default `settingSources` to enable Skills
- `src/types/index.ts` - Verify `SettingSource` type includes needed values (already exists)

## Edge Cases

1. **No Skills directory**: SDK handles gracefully - no Skills loaded
2. **Invalid SKILL.md format**: SDK logs warning, skips invalid Skills
3. **Empty settingSources**: Skills disabled (SDK isolation mode)
4. **settingSources without 'project'**: Project Skills not loaded, only user Skills

## Definition of Done

- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] `settingSources` defaults enable Skills discovery
- [ ] Config documentation updated with Skills explanation
- [ ] Manual verification that Skills can be discovered

---

**Effort:** small
**Dependencies:** None
**Blocks:** S-0043 (Core SDLC Agent Skills)
