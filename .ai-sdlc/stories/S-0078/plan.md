---
*Generated: 2026-02-02*

# Implementation Plan: Create IProvider Interface and Provider Types

## Overview
This plan creates a provider-agnostic interface system to support multiple AI backends (Claude, Copilot, OpenAI) without changing agent code. The implementation is **non-breaking** and focuses on establishing type-safe abstractions.

---

## Phase 1: Project Setup and Validation

- [ ] **T1**: Verify current project state and dependencies
  - Files: `package.json`, `tsconfig.json`
  - Dependencies: none
  - Run `npm run build` and `npm test` to establish baseline
  - Confirm `src/core/client.ts` exists with Claude SDK imports

- [ ] **T2**: Review existing type definitions in client.ts
  - Files: `src/core/client.ts`
  - Dependencies: T1
  - Identify current `AgentProgressEvent` and `AgentQueryOptions` definitions (around lines 250-259)
  - Document exact structure for backward compatibility

---

## Phase 2: Core Type Definitions

- [ ] **T3**: Create providers directory structure
  - Files: `src/providers/` (directory)
  - Dependencies: none
  - Create `src/providers/` directory
  - Create `src/providers/__tests__/` directory for tests

- [ ] **T4**: Define ProviderCapabilities interface
  - Files: `src/providers/types.ts`
  - Dependencies: T3
  - Add boolean capability flags: `supportsStreaming`, `supportsTools`, `supportsSystemPrompt`, `supportsMultiTurn`
  - Add metadata fields: `maxContextTokens: number`, `supportedModels: string[]`
  - Use `readonly` modifiers on all fields
  - Add JSDoc documentation with examples

- [ ] **T5**: Define ProviderProgressEvent discriminated union
  - Files: `src/providers/types.ts`
  - Dependencies: T4
  - Create base event type with `type` discriminant field
  - Define all 7 event types: `session_start`, `tool_start`, `tool_end`, `message`, `completion`, `error`, `retry`
  - Add type-specific payloads (sessionId, toolName, content, etc.)
  - Add JSDoc for each event variant

- [ ] **T6**: Define ProviderProgressCallback type alias
  - Files: `src/providers/types.ts`
  - Dependencies: T5
  - Create type alias: `(event: ProviderProgressEvent) => void`
  - Add JSDoc with usage example

- [ ] **T7**: Define ProviderQueryOptions interface
  - Files: `src/providers/types.ts`
  - Dependencies: T6
  - Add required field: `prompt: string`
  - Add optional fields: `systemPrompt?`, `workingDirectory?`, `model?`, `timeout?`, `onProgress?: ProviderProgressCallback`
  - Add JSDoc documentation

---

## Phase 3: Provider and Authenticator Interfaces

- [ ] **T8**: Define IAuthenticator interface
  - Files: `src/providers/types.ts`
  - Dependencies: T7
  - Add methods: `isConfigured()`, `getCredentialType()`, `configure()`, `validateCredentials()`
  - Add optional method: `getTokenExpirationInfo?()`
  - Add JSDoc with `@example` block showing implementation

- [ ] **T9**: Define IProvider interface
  - Files: `src/providers/types.ts`
  - Dependencies: T8
  - Add readonly properties: `name: string`, `capabilities: ProviderCapabilities`
  - Add methods: `query(options: ProviderQueryOptions): Promise<string>`, `validateConfiguration(): Promise<boolean>`, `getAuthenticator(): IAuthenticator`
  - Add comprehensive JSDoc with `@example` block showing usage

---

## Phase 4: Barrel Exports and Backward Compatibility

- [ ] **T10**: Create barrel export file
  - Files: `src/providers/index.ts`
  - Dependencies: T9
  - Export all types from `./types.js` using `export *`
  - Add module-level JSDoc with usage examples

- [ ] **T11**: Add backward-compatible type aliases in client.ts
  - Files: `src/core/client.ts`
  - Dependencies: T10
  - Import new provider types
  - Create `@deprecated` type aliases: `AgentProgressEvent`, `AgentQueryOptions`
  - Point aliases to new provider types
  - Verify existing code still compiles

---

## Phase 5: Testing

- [ ] **T12**: Create type compilation test suite
  - Files: `src/providers/__tests__/types.test.ts`
  - Dependencies: T11
  - Test all types export correctly from `src/providers/index.ts`
  - Test interfaces are valid TypeScript (compile-time checks)
  - Verify discriminated union type narrowing works

- [ ] **T13**: Test ProviderProgressEvent variants
  - Files: `src/providers/__tests__/types.test.ts`
  - Dependencies: T12
  - Create test objects for each event type (session_start, tool_start, etc.)
  - Verify type discrimination with switch/if statements
  - Test optional fields (input, result)

- [ ] **T14**: Test IProvider and IAuthenticator implementations
  - Files: `src/providers/__tests__/types.test.ts`
  - Dependencies: T13
  - Create mock implementations of both interfaces
  - Verify all required methods and properties compile
  - Test optional methods (getTokenExpirationInfo)

- [ ] **T15**: Test backward compatibility aliases
  - Files: `src/providers/__tests__/types.test.ts`
  - Dependencies: T14
  - Import deprecated aliases from `src/core/client.ts`
  - Verify they resolve to correct provider types
  - Ensure type equivalence

---

## Phase 6: Documentation and Verification

- [ ] **T16**: Review all JSDoc documentation
  - Files: `src/providers/types.ts`, `src/providers/index.ts`
  - Dependencies: T15
  - Verify all exported types have JSDoc comments
  - Confirm `@example` blocks on `IProvider` and `IAuthenticator`
  - Check `@deprecated` tags on aliases

- [ ] **T17**: Run build verification
  - Files: N/A (verification step)
  - Dependencies: T16
  - Run `npm run build` - must succeed with no type errors
  - Check for any new TypeScript warnings

- [ ] **T18**: Run test suite
  - Files: N/A (verification step)
  - Dependencies: T17
  - Run `npm test` - all tests must pass
  - Verify new type tests execute successfully
  - Confirm no existing tests broken

- [ ] **T19**: Run lint checks
  - Files: N/A (verification step)
  - Dependencies: T18
  - Run `npm run lint` - must pass
  - Fix any style violations

- [ ] **T20**: Run make verify
  - Files: N/A (verification step)
  - Dependencies: T19
  - Run `make verify` - must pass all checks
  - This is the pre-commit requirement per CLAUDE.md

---

## Phase 7: Final Review

- [ ] **T21**: Review implementation against acceptance criteria
  - Files: N/A (review step)
  - Dependencies: T20
  - Check off each acceptance criterion in story
  - Verify all edge cases documented in JSDoc
  - Confirm no breaking changes introduced

- [ ] **T22**: Verify file hygiene
  - Files: Project root
  - Dependencies: T21
  - Ensure no temporary/scratch files created
  - Confirm only specified files modified/created
  - Check no new root-level markdown files added

---

## Summary

**Total Tasks**: 22  
**Estimated Effort**: Small (as per story label)  
**Breaking Changes**: None (backward-compatible aliases provided)

### Files to Create:
- `src/providers/types.ts` - Core interface definitions (~280 lines)
- `src/providers/index.ts` - Barrel export (~20 lines)
- `src/providers/__tests__/types.test.ts` - Type compilation tests (~450 lines)

### Files to Modify:
- `src/core/client.ts` - Add backward-compatible type aliases

### Critical Success Factors:
1. **Type Safety**: No `any` types - all strictly typed
2. **Documentation**: Comprehensive JSDoc on all exports
3. **Backward Compatibility**: Deprecated aliases prevent breakage
4. **Discriminated Unions**: Use `type` field for event discrimination
5. **Immutability**: `readonly` on all immutable properties
6. **Pre-Commit**: `make verify` must pass before completion