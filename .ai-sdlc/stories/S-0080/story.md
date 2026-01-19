---
id: S-0080
title: Extract ClaudeProvider from client.ts
priority: 3
status: backlog
type: refactor
created: '2026-01-19'
labels:
  - architecture
  - provider-abstraction
  - epic-modular-architecture
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: extract-claude-provider
dependencies:
  - S-0078
  - S-0079
---
# Extract ClaudeProvider from client.ts

## User Story

**As a** developer maintaining ai-sdlc
**I want** Claude SDK integration encapsulated in its own provider class
**So that** the core client is provider-agnostic and other providers can be added

## Summary

This story extracts all Claude-specific code from `src/core/client.ts` into a dedicated `ClaudeProvider` class that implements `IProvider`. The `runAgentQuery()` function will be refactored to use the provider abstraction while maintaining backward compatibility.

## Technical Context

**Current State:**
- `src/core/client.ts` directly imports `@anthropic-ai/claude-agent-sdk` (line 1)
- `runAgentQuery()` contains Claude-specific options (lines 250-259):
  - `permissionMode: 'acceptEdits'`
  - `settingSources`
  - Claude model names
- Message streaming logic is Claude-specific (lines 270-343)

**Target State:**
- `ClaudeProvider` class in `src/providers/claude/index.ts`
- `runAgentQuery()` delegates to `ProviderRegistry.getDefault()`
- All Claude-specific code isolated in provider module

## Acceptance Criteria

### ClaudeProvider Class

- [ ] Create `src/providers/claude/index.ts` with `ClaudeProvider` class
- [ ] Implements `IProvider` interface
- [ ] Contains Claude-specific:
  - [ ] Model names and capabilities
  - [ ] SDK `query()` call and options
  - [ ] Message streaming logic
  - [ ] Progress event translation

### Provider Capabilities

- [ ] Define accurate `capabilities` for Claude:
  ```typescript
  capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsTools: true,
    supportsSystemPrompt: true,
    supportsMultiTurn: true,
    maxContextTokens: 200000,
    supportedModels: ['claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101'],
  }
  ```

### Client Refactoring

- [ ] `runAgentQuery()` in `client.ts` delegates to provider
- [ ] Remove direct Claude SDK import from `client.ts`
- [ ] Maintain exact same external API for `runAgentQuery()`

### Provider Registration

- [ ] `ClaudeProvider` registered with `ProviderRegistry` at startup
- [ ] Registration in `src/providers/claude/index.ts` or `src/index.ts`

### Backward Compatibility

- [ ] All existing agent calls continue to work unchanged
- [ ] Same error messages and behavior
- [ ] Same progress events emitted

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/claude/index.ts` | Create | ClaudeProvider implementation |
| `src/providers/claude/config.ts` | Create | Claude-specific configuration |
| `src/providers/index.ts` | Modify | Export Claude provider, register with registry |
| `src/core/client.ts` | Modify | Remove Claude coupling, use provider |
| `src/index.ts` | Modify | Ensure provider registration at startup |

## Code Migration

**Before (client.ts):**
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const response = query({
  prompt: options.prompt,
  options: {
    model: options.model || 'claude-sonnet-4-5-20250929',
    systemPrompt: options.systemPrompt,
    cwd: workingDir,
    permissionMode: 'acceptEdits',
    settingSources: settingSources,
  },
});
```

**After (client.ts):**
```typescript
import { ProviderRegistry } from '../providers/index.js';

const provider = ProviderRegistry.getDefault();
const result = await provider.query({
  prompt: options.prompt,
  systemPrompt: options.systemPrompt,
  workingDirectory: workingDir,
  model: options.model,
  timeout: options.timeout,
  onProgress: options.onProgress,
});
```

## Testing Requirements

- [ ] Unit tests for `ClaudeProvider.query()`
- [ ] Unit tests for capability reporting
- [ ] Integration test: Existing agent workflows unchanged
- [ ] Mock provider for testing without real API calls
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `ClaudeProvider` class implemented and tested
- [ ] `client.ts` uses provider abstraction
- [ ] No direct Claude SDK imports in `src/core/`
- [ ] All existing tests pass without modification
- [ ] Build succeeds
- [ ] Manual verification: `npm run agent work` still works

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 3.2
- Design Pattern: Adapter Pattern
- SOLID Principle: Single Responsibility (SRP), Dependency Inversion (DIP)
