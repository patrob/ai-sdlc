---
*Generated: 2026-02-02*

Perfect! Now I have all the information I need. Let me compile the research findings:

# Research: Create IProvider Interface and Provider Types

## Problem Summary

The core goal is to create a provider-agnostic abstraction layer that decouples ai-sdlc's agent logic from the Claude Agent SDK. Currently, `src/core/client.ts` directly imports and uses `@anthropic-ai/claude-agent-sdk`, making it impossible to support alternative AI providers (OpenAI, GitHub Copilot, etc.) without modifying existing agent code. This story establishes the foundational TypeScript interfaces and types that will enable multi-provider support in future implementation stories.

This is a **pure type definition story** - no implementation logic, no behavior changes, just creating the contract that future providers will implement.

## Codebase Context

### Current Architecture

**Direct SDK Coupling:**
- `src/core/client.ts:1` — Direct import: `import { query } from '@anthropic-ai/claude-agent-sdk'`
- `src/core/client.ts:250-259` — Claude-specific options hardcoded in `runAgentQuery()`
- `src/core/client.ts:32-39` — `AgentProgressEvent` type mirrors SDK message structure
- `src/core/client.ts:46-55` — `AgentQueryOptions` interface wraps SDK parameters

**Authentication Architecture:**
- `src/core/auth.ts` — Already has modular credential detection:
  - `getApiKey()`: Multi-source credential resolution (env vars, file, keychain)
  - `getCredentialType()`: Returns `'api_key' | 'oauth_token' | 'none'`
  - `getTokenExpirationInfo()`: Returns expiration details with `isExpired` and `expiresInMs`
  - `configureAgentSdkAuth()`: Sets environment variables for SDK
- **Pattern to follow**: The auth module already demonstrates the abstraction pattern we need - it provides a generic interface over multiple credential sources

**Existing Provider Pattern (Ticket Integration):**
The codebase already implements a provider pattern in `src/services/ticket-provider/`:
- `types.ts`: Defines `TicketProvider` interface with readonly `name` property
- `index.ts`: Exports barrel pattern with `createTicketProvider(config)` factory
- `null-provider.ts`, `github-provider.ts`: Concrete implementations
- **Key insight**: This is the EXACT pattern to follow for AI providers

**Type Organization:**
- `src/types/index.ts`: Central type definitions (1200+ lines)
  - Currently exports `AgentProgressEvent`, `AgentProgressCallback`, `AgentQueryOptions`
  - Uses discriminated unions for type-safe events (e.g., `ReviewDecision`)
  - Follows barrel export pattern with re-exports from submodules
  - Line 63: Already defines `SettingSource = 'user' | 'project' | 'local'`

**Testing Patterns:**
- `src/types/types.test.ts`: Type compilation tests (TDD types validated)
- Tests verify interface structure without mocking implementations
- Pattern: Instantiate concrete objects matching the interface, verify properties exist
- Located co-located with source files (`*.test.ts` alongside `*.ts`)

### Architectural Patterns to Follow

1. **Interface Segregation** (from ticket provider pattern):
   - Small, focused interfaces (`IProvider`, `IAuthenticator`)
   - Readonly properties for identity (`name`, `capabilities`)
   - Concrete implementations in separate files

2. **Discriminated Unions** (from existing types):
   - `type: string` field for type narrowing
   - Used in `AgentProgressEvent`, `ReviewDecision`, etc.

3. **Barrel Exports** (from `src/types/index.ts`, `src/services/ticket-provider/index.ts`):
   - Create `src/providers/index.ts` to re-export all types
   - Single import point: `import { IProvider } from '../providers/index.js'`

4. **JSDoc Documentation** (pervasive in codebase):
   - All interfaces have JSDoc comments
   - `@example` blocks for complex interfaces
   - `@default` tags for optional fields

## Files Requiring Changes

### 1. Create: `src/providers/types.ts`
**Change Type**: Create New  
**Reason**: Central location for all provider-related type definitions  
**Specific Changes**:
- Define `IProvider` interface with methods: `query()`, `validateConfiguration()`, `getAuthenticator()`
- Define readonly properties: `name`, `capabilities`
- Define `ProviderCapabilities` interface with boolean flags and metadata
- Define `ProviderQueryOptions` interface (generalizes current `AgentQueryOptions`)
- Define `ProviderProgressEvent` as discriminated union (6 event types: `session_start`, `tool_start`, `tool_end`, `message`, `completion`, `error`, `retry`)
- Define `ProviderProgressCallback` type alias
- Define `IAuthenticator` interface with methods: `isConfigured()`, `getCredentialType()`, `configure()`, `validateCredentials()`, optional `getTokenExpirationInfo?()`
- Add comprehensive JSDoc with `@example` blocks for `IProvider` and `IAuthenticator`

**Dependencies**: None (pure type definitions)

**Reference Implementation**: Follow `src/services/ticket-provider/types.ts` structure

### 2. Create: `src/providers/index.ts`
**Change Type**: Create New  
**Reason**: Barrel export for clean import paths  
**Specific Changes**:
- Re-export all types from `./types.js`: `export * from './types.js'`
- Single file, ~10 lines
- Follows pattern from `src/services/ticket-provider/index.ts`

**Dependencies**: Requires `src/providers/types.ts` to exist first

### 3. Modify: `src/types/index.ts`
**Change Type**: Modify Existing  
**Reason**: Add backward-compatible type aliases for gradual migration  
**Specific Changes**:
- Add import: `import { ProviderProgressEvent, ProviderQueryOptions, ProviderProgressCallback } from '../providers/index.js'`
- Add deprecated aliases (after line 55):
  \`\`\`typescript
  /**
   * @deprecated Use ProviderProgressEvent from providers module instead
   */
  export type { ProviderProgressEvent as AgentProgressEvent };
  
  /**
   * @deprecated Use ProviderQueryOptions from providers module instead
   */
  export type { ProviderQueryOptions as AgentQueryOptions };
  
  /**
   * @deprecated Use ProviderProgressCallback from providers module instead
   */
  export type { ProviderProgressCallback as AgentProgressCallback };
  \`\`\`
- Remove current definitions of `AgentProgressEvent` (lines 32-39), `AgentProgressCallback` (line 44), `AgentQueryOptions` (lines 46-55) from `src/core/client.ts` (these will move to `src/providers/types.ts`)

**Dependencies**: Requires `src/providers/types.ts` and `src/providers/index.ts` to exist first

**Risk**: Potential circular dependency if not careful with imports. Solution: Keep `src/providers/types.ts` free of imports from `src/types/index.ts`

## Testing Strategy

### Test Files to Modify
**None** - No existing test files need modification (this is a pure type addition)

### New Tests Needed

#### 1. Create: `src/providers/types.test.ts`
**Purpose**: Validate all type exports compile and interfaces are structurally correct  
**Test Scenarios**:

**Type Compilation Tests:**
\`\`\`typescript
describe('Provider Type Definitions', () => {
  describe('IProvider interface', () => {
    it('should define all required properties and methods', () => {
      const mockProvider: IProvider = {
        name: 'test-provider',
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsSystemPrompt: true,
          supportsMultiTurn: true,
          maxContextTokens: 100000,
          supportedModels: ['model-1'],
        },
        query: async () => 'result',
        validateConfiguration: async () => true,
        getAuthenticator: () => mockAuthenticator,
      };
      
      expect(mockProvider.name).toBeDefined();
      expect(mockProvider.capabilities).toBeDefined();
    });
  });

  describe('ProviderProgressEvent discriminated union', () => {
    it('should support session_start event', () => {
      const event: ProviderProgressEvent = {
        type: 'session_start',
        sessionId: 'test-123',
      };
      expect(event.type).toBe('session_start');
    });

    it('should support retry event with all fields', () => {
      const event: ProviderProgressEvent = {
        type: 'retry',
        attempt: 2,
        delay: 4000,
        error: 'Rate limit exceeded',
      };
      expect(event.attempt).toBe(2);
    });
  });

  describe('IAuthenticator interface', () => {
    it('should define all required methods', () => {
      const mockAuth: IAuthenticator = {
        isConfigured: () => true,
        getCredentialType: () => 'api_key',
        configure: async () => {},
        validateCredentials: async () => true,
      };
      expect(mockAuth.isConfigured()).toBe(true);
    });

    it('should support optional getTokenExpirationInfo', () => {
      const mockAuth: IAuthenticator = {
        isConfigured: () => true,
        getCredentialType: () => 'oauth',
        configure: async () => {},
        validateCredentials: async () => true,
        getTokenExpirationInfo: () => ({
          isExpired: false,
          expiresInMs: 3600000,
        }),
      };
      expect(mockAuth.getTokenExpirationInfo?.()).toBeDefined();
    });
  });
});
\`\`\`

**Pattern**: Follow `src/types/types.test.ts` pattern - instantiate objects matching interfaces, verify properties exist

#### 2. Create: `src/providers/index.test.ts`
**Purpose**: Verify barrel exports work correctly  
**Test Scenarios**:
\`\`\`typescript
describe('Provider Module Exports', () => {
  it('should export all provider types', () => {
    // Use dynamic import to verify exports exist
    const exports = Object.keys(await import('./index.js'));
    expect(exports).toContain('IProvider');
    expect(exports).toContain('IAuthenticator');
    expect(exports).toContain('ProviderCapabilities');
    expect(exports).toContain('ProviderQueryOptions');
    expect(exports).toContain('ProviderProgressEvent');
    expect(exports).toContain('ProviderProgressCallback');
  });
});
\`\`\`

### Test Coverage Requirements
- All interfaces must have at least one instantiation test
- All discriminated union variants must have a test case
- A