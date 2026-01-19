---
id: S-0078
title: Create IProvider Interface and Provider Types
priority: 1
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
slug: create-iprovider-interface
dependencies: []
---
# Create IProvider Interface and Provider Types

## User Story

**As a** developer maintaining ai-sdlc
**I want** a provider-agnostic interface for AI backends
**So that** we can support multiple AI providers (Claude, Copilot, etc.) without changing agent code

## Summary

This story creates the foundational `IProvider` interface and related types that define how ai-sdlc communicates with AI backends. This abstraction layer enables future provider integrations (GitHub Copilot SDK, OpenAI, etc.) without modifying agent implementations.

## Technical Context

**Current State:**
- Direct import of `@anthropic-ai/claude-agent-sdk` in `src/core/client.ts:1`
- Claude-specific options hardcoded in `runAgentQuery()` at `src/core/client.ts:250-259`
- No abstraction layer exists

**Target State:**
- Provider-agnostic `IProvider` interface
- `ProviderCapabilities` type for feature detection
- Unified `ProviderProgressEvent` format
- `IAuthenticator` interface for credential management

## Acceptance Criteria

### Interface Definitions

- [ ] Create `src/providers/types.ts` with:
  - [ ] `IProvider` interface with `query()`, `validateConfiguration()`, `getAuthenticator()`
  - [ ] `ProviderCapabilities` interface (streaming, tools, system prompt, multi-turn, context size)
  - [ ] `ProviderQueryOptions` interface (prompt, systemPrompt, workingDirectory, model, timeout, onProgress)
  - [ ] `ProviderProgressEvent` union type (session_start, tool_start, tool_end, message, completion, error, retry)
  - [ ] `ProviderProgressCallback` type
  - [ ] `IAuthenticator` interface (isConfigured, getCredentialType, configure, validateCredentials)

### Type Safety

- [ ] All interfaces use strict TypeScript types
- [ ] No `any` types in public interfaces
- [ ] Exported types are documented with JSDoc comments

### Backward Compatibility

- [ ] Existing `AgentProgressEvent` type re-exported as alias to `ProviderProgressEvent`
- [ ] Existing `AgentQueryOptions` type re-exported as alias to `ProviderQueryOptions`

## Files to Create

| File | Purpose |
|------|---------|
| `src/providers/types.ts` | Core provider interface definitions |
| `src/providers/index.ts` | Barrel export for provider module |

## Interface Specifications

```typescript
// src/providers/types.ts

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsSystemPrompt: boolean;
  supportsMultiTurn: boolean;
  maxContextTokens: number;
  supportedModels: string[];
}

export interface ProviderQueryOptions {
  prompt: string;
  systemPrompt?: string;
  workingDirectory?: string;
  model?: string;
  timeout?: number;
  onProgress?: ProviderProgressCallback;
}

export type ProviderProgressEvent =
  | { type: 'session_start'; sessionId: string }
  | { type: 'tool_start'; toolName: string; input?: Record<string, unknown> }
  | { type: 'tool_end'; toolName: string; result?: unknown }
  | { type: 'message'; content: string }
  | { type: 'completion' }
  | { type: 'error'; message: string }
  | { type: 'retry'; attempt: number; delay: number; error: string };

export type ProviderProgressCallback = (event: ProviderProgressEvent) => void;

export interface IProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  query(options: ProviderQueryOptions): Promise<string>;
  validateConfiguration(): Promise<boolean>;
  getAuthenticator(): IAuthenticator;
}

export interface IAuthenticator {
  isConfigured(): boolean;
  getCredentialType(): 'api_key' | 'oauth' | 'none';
  configure(): Promise<void>;
  validateCredentials(): Promise<boolean>;
  getTokenExpirationInfo?(): { isExpired: boolean; expiresInMs: number | null };
}
```

## Testing Requirements

- [ ] Unit tests for type exports
- [ ] Type compilation tests (ensure interfaces are valid)
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] All interfaces defined in `src/providers/types.ts`
- [ ] Barrel export in `src/providers/index.ts`
- [ ] JSDoc documentation on all public types
- [ ] Backward-compatible aliases exported from `src/types/index.ts`
- [ ] All tests pass
- [ ] Build succeeds

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 3.1
- SOLID Principle: Dependency Inversion (DIP)
