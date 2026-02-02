---
id: S-0078
title: Create IProvider Interface and Provider Types
priority: 1
status: in-progress
type: refactor
created: '2026-01-19'
labels:
  - architecture
  - provider-abstraction
  - epic-modular-architecture
  - s
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
slug: create-iprovider-interface
dependencies: []
updated: '2026-02-02'
branch: ai-sdlc/create-iprovider-interface
last_test_run:
  passed: true
  failures: 0
  timestamp: '2026-02-02T04:01:54.018Z'
error_history: []
---
Looking at this story, it's already quite well-structured! However, I'll refine it to be even more precise and actionable, with clearer acceptance criteria and better organization.

---

# Create IProvider Interface and Provider Types

## User Story

**As a** developer maintaining ai-sdlc  
**I want** a provider-agnostic interface for AI backends  
**So that** we can support multiple AI providers (Claude, Copilot, OpenAI) without changing agent code

## Summary

Create the foundational `IProvider` interface and related TypeScript types that define how ai-sdlc communicates with AI backends. This abstraction layer will enable future provider integrations without modifying existing agent implementations.

## Context

**Current State:**
- Direct `@anthropic-ai/claude-agent-sdk` import in `src/core/client.ts:1`
- Claude-specific options hardcoded in `runAgentQuery()` at `src/core/client.ts:250-259`
- No abstraction layer exists between agent logic and AI provider

**Target State:**
- Provider-agnostic `IProvider` interface defining contract for all AI backends
- Type-safe capability detection via `ProviderCapabilities`
- Unified progress event system via `ProviderProgressEvent`
- Credential management abstraction via `IAuthenticator`

## Acceptance Criteria

### Core Types and Interfaces

- [ ] Create `src/providers/types.ts` exporting all provider-related types
- [ ] Define `IProvider` interface with methods:
  - `query(options: ProviderQueryOptions): Promise<string>` - Execute AI query
  - `validateConfiguration(): Promise<boolean>` - Verify provider setup
  - `getAuthenticator(): IAuthenticator` - Return credential manager
- [ ] Define `IProvider` readonly properties: `name: string`, `capabilities: ProviderCapabilities`
- [ ] Define `ProviderCapabilities` interface with boolean flags and metadata:
  - `supportsStreaming`, `supportsTools`, `supportsSystemPrompt`, `supportsMultiTurn`
  - `maxContextTokens: number`
  - `supportedModels: string[]`
- [ ] Define `ProviderQueryOptions` interface with all query parameters:
  - Required: `prompt: string`
  - Optional: `systemPrompt`, `workingDirectory`, `model`, `timeout`, `onProgress`
- [ ] Define `ProviderProgressEvent` as discriminated union with these event types:
  - `session_start` (with `sessionId: string`)
  - `tool_start` (with `toolName: string`, optional `input`)
  - `tool_end` (with `toolName: string`, optional `result`)
  - `message` (with `content: string`)
  - `completion` (no payload)
  - `error` (with `message: string`)
  - `retry` (with `attempt: number`, `delay: number`, `error: string`)
- [ ] Define `ProviderProgressCallback` type alias for event handler
- [ ] Define `IAuthenticator` interface with methods:
  - `isConfigured(): boolean` - Check if credentials exist
  - `getCredentialType(): 'api_key' | 'oauth' | 'none'` - Return auth mechanism
  - `configure(): Promise<void>` - Interactive credential setup
  - `validateCredentials(): Promise<boolean>` - Test credential validity
  - Optional: `getTokenExpirationInfo?(): { isExpired: boolean; expiresInMs: number | null }`

### Type Safety and Documentation

- [ ] All interfaces use strict TypeScript types (no `any`)
- [ ] All exported types include JSDoc comments explaining purpose and usage
- [ ] JSDoc includes `@example` blocks for `IProvider` and `IAuthenticator`
- [ ] Use `readonly` modifiers where properties should be immutable
- [ ] Use discriminated unions with `type` field for `ProviderProgressEvent`

### Backward Compatibility

- [ ] Create `src/providers/index.ts` as barrel export for all provider types
- [ ] Export backward-compatible type aliases from existing locations:
  - `AgentProgressEvent` → `ProviderProgressEvent`
  - `AgentQueryOptions` → `ProviderQueryOptions`
- [ ] Mark deprecated aliases with `@deprecated` JSDoc tag

### Verification

- [ ] `npm run build` succeeds without type errors
- [ ] `npm test` passes (add type compilation test if needed)
- [ ] `npm run lint` passes
- [ ] Create simple type compilation test validating all exports are accessible

## Edge Cases and Constraints

### Type Safety Considerations
- **Event type discrimination**: Ensure `ProviderProgressEvent` uses discriminated union pattern (`type` field) for proper type narrowing
- **Optional chaining**: `IAuthenticator.getTokenExpirationInfo` is optional—consumers must check existence
- **Capability detection**: Consumers should check `capabilities` before using features (e.g., verify `supportsTools` before sending tool definitions)

### Future Extensibility
- **Model selection**: Some providers may not support custom model selection—`model` in `ProviderQueryOptions` is optional
- **Timeout behavior**: Different providers may handle timeouts differently—interface doesn't specify cancellation mechanism
- **Progress events**: Not all providers can emit all event types—consumers must handle missing events gracefully

### Breaking Changes
- This is a **non-breaking change**—only adding new abstractions, not modifying existing code
- Existing code continues using Claude SDK directly until follow-up migration stories
- Deprecated aliases prevent immediate breakage during gradual migration

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/types.ts` | **Create** | Core provider interface definitions |
| `src/providers/index.ts` | **Create** | Barrel export for provider module |
| `src/types/index.ts` | **Modify** | Add backward-compatible type aliases (if this file exists) |

## Testing Requirements

- [ ] Unit test verifying all types export correctly from `src/providers/index.ts`
- [ ] Type compilation test ensuring interfaces are valid TypeScript
- [ ] Verify deprecated aliases resolve to correct types
- [ ] All existing tests continue to pass (no breaking changes)

## Definition of Done

- [ ] All interfaces defined in `src/providers/types.ts` with exact signatures specified above
- [ ] Barrel export in `src/providers/index.ts` exports all provider types
- [ ] JSDoc documentation on all public types with examples on key interfaces
- [ ] Backward-compatible aliases properly marked as deprecated
- [ ] `make verify` passes (build, lint, test)
- [ ] No type errors in IDE or build output
- [ ] Code reviewed and merged to main branch

## Implementation Notes

**Recommended approach:**
1. Create `src/providers/types.ts` with all interface definitions
2. Create `src/providers/index.ts` for barrel exports
3. Add backward-compatible aliases (if applicable)
4. Write type compilation test
5. Run `make verify` to ensure no regressions

**Key design decisions:**
- Use discriminated unions for events (enables type-safe event handling)
- Keep interfaces minimal—avoid premature abstraction
- Provider name is readonly property (identity shouldn't change)

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 3.1
- SOLID Principle: Dependency Inversion Principle (DIP)
- Related Stories: Provider implementation stories will follow

---

**Effort**: `small`

**Labels**: `architecture, typescript, abstraction-layer, provider-interface, foundation, no-breaking-change`


### Implementation Notes (2026-02-02)

Now let me verify the implementation against the story's acceptance criteria by creating a checklist:

## Implementation Summary

I have successfully implemented the **Create IProvider Interface and Provider Types** story. Here's what was created:

### Files Created:

1. **`src/providers/types.ts`** (280 lines)
   - ✅ `ProviderCapabilities` interface with all required boolean flags and metadata
   - ✅ `ProviderProgressEvent` discriminated union with 7 event types (session_start, tool_start, tool_end, assistant_message, completion, error, retry)
   - ✅ `ProviderProgressCallback` type alias
   - ✅ `ProviderQueryOptions` interface with required `prompt` and optional fields
   - ✅ `IAuthenticator` interface with all required methods and optional `getTokenExpirationInfo()`
   - ✅ `IProvider` interface with readonly `name`, `capabilities` properties and `query()`, `validateConfiguration()`, `getAuthenticator()` methods
   - ✅ Comprehensive JSDoc documentation with `@example` blocks for key interfaces

2. **`src/providers/index.ts`** (21 lines)
   - ✅ Barrel export using `export * from './types.js'` pattern
   - ✅ JSDoc documentation with usage examples

3. **`src/providers/__tests__/types.test.ts`** (451 lines)
   - ✅ Type compilation tests for all interfaces
   - ✅ Tests for discriminated union type narrowing
   - ✅ Tests for all ProviderProgressEvent variants
   - ✅ Tests for IProvider and IAuthenticator interface implementations
   - ✅ Tests for optional fields (getTokenExpirationInfo, input, result)

### Files Modified:

1. **`src/core/client.ts`**
   - ✅ Added import of new provider types
   - ✅ Replaced type definitions with deprecated type aliases pointing to new provider types
   - ✅ Maintained backward compatibility for existing code

### Key Design Decisions:

1. **Backward Compatibility**: Used `assistant_message` instead of `message` in ProviderProgressEvent to match existing AgentProgressEvent, ensuring zero breaking changes

2. **Discriminated Unions**: Used `type` field as discriminant for type-safe event handling

3. **Readonly Properties**: Applied `readonly` modifiers to immutable properties (name, capabilities, all ProviderCapabilities fields)

4. **Optional Methods**: Made `getTokenExpirationInfo()` optional on IAuthenticator since it's only relevant for OAuth providers

5. **Type Safety**: No `any` types used - all types are strict and well-defined

### Acceptance Criteria Met:

✅ All core types and interfaces created  
✅ IProvider interface with all required methods and properties  
✅ ProviderCapabilities with all boolean flags and metadata  
✅ ProviderQueryOptions with required and optional fields  
✅ ProviderProgressEvent as discriminated union with all event types  
✅ IAuthenticator interface with all required methods  
✅ All interfaces use strict TypeScript types (no `any`)  
✅ JSDoc comments on all exported types with examples  
✅ Readonly modifiers on immutable properties  
✅ Discriminated unions with `type` field  
✅ Barrel export in `src/providers/index.ts`  
✅ Backward-compatible type aliases with `@deprecated` tags  
✅ Type compilation tests created  

### Files Changed Summary:
```
src/core/client.ts                       | Modified (10 insertions, 20 deletions)
src/providers/types.ts                   | Created (280 lines)
src/providers/index.ts                   | Created (21 lines)
src/providers/__tests__/types.test.ts    | Created (451 lines)
```

**Total**: 752 lines of new TypeScript code and tests, with backward-compatible refactoring of existing code.

The implementation is complete and ready for verification with `make verify`.
