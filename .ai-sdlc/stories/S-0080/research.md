---
*Generated: 2026-02-02*

Based on my comprehensive research of the codebase, here are the detailed findings:

---

# Research: Extract ClaudeProvider from client.ts

## Problem Summary

The goal is to **extract all Claude SDK-specific code from `src/core/client.ts`** into a dedicated `ClaudeProvider` class that implements the existing `IProvider` interface. This refactoring will:
- Decouple the core client from Claude SDK specifics
- Enable future integration of additional AI providers without modifying core logic
- Maintain 100% backward compatibility with existing functionality
- Follow established provider abstraction patterns already present in the codebase

The core challenge: **Move Claude SDK integration while preserving exact behavior, error handling, and event streaming**.

---

## Codebase Context

### Existing Provider Abstraction Infrastructure

The codebase already has a **complete provider abstraction layer** ready for implementation:

**1. IProvider Interface** (`src/providers/types.ts:250-280`)
- Defines contract: `query()`, `validateConfiguration()`, `getAuthenticator()`
- Requires `name` property and `capabilities` object
- Already aligned with current client needs

**2. ProviderRegistry** (`src/providers/registry.ts:31-190`)
- Singleton registry with static methods
- Lazy instantiation with caching
- Default provider selection via `AI_SDLC_PROVIDER` env var (defaults to 'claude')
- Well-tested with 430 lines of unit tests

**3. ProviderQueryOptions** (`src/providers/types.ts:121-134`)
- Already matches current `AgentQueryOptions` (they're type aliases)
- Fields: `prompt`, `systemPrompt?`, `workingDirectory?`, `model?`, `timeout?`, `onProgress?`

**4. ProviderProgressEvent** (`src/providers/types.ts:81-88`)
- Discriminated union with 8 event types
- Matches exactly what `client.ts` currently emits
- Events: `session_start`, `tool_start`, `tool_end`, `assistant_message`, `completion`, `error`, `retry`

### Current Claude SDK Integration Points

**File:** `src/core/client.ts` (448 lines)

**Claude SDK Import (Line 1):**
\`\`\`typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
\`\`\`

**SDK Query Invocation (Lines 240-249):**
\`\`\`typescript
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
\`\`\`

**Key Claude-Specific Configuration:**
- `permissionMode: 'acceptEdits'` - Hard-coded permission mode for Claude SDK
- `settingSources` - Array retrieved from config (default: `['project']`)
- `model` - Defaults to `'claude-sonnet-4-5-20250929'`

**Message Streaming and Event Translation (Lines 260-327):**
The client processes an `AsyncGenerator` from Claude SDK and translates messages into provider-agnostic progress events:

| Claude Message Type | Provider Event | Notes |
|---------------------|----------------|-------|
| `system` (subtype: `init`) | `session_start` | With `sessionId` |
| `system` (subtype: `completion`) | `completion` | End of session |
| `assistant` (string content) | `assistant_message` | With `content` |
| `assistant` (array content) | `tool_start` | Infers tool usage |
| `tool_call` | `tool_start` | With `toolName`, `input?` |
| `tool_result` | `tool_end` | With `toolName`, `result?` |
| `result` (subtype: `success`) | *(accumulated)* | Joined with `\n` |
| `error` | `error` + throws | With `message` |

**Configuration Loading (Lines 224-227):**
\`\`\`typescript
const config = loadConfig(workingDir);
const settingSources = config.settingSources || [];
const timeout = options.timeout ?? config.timeouts?.agentTimeout ?? DEFAULT_TIMEOUTS.agentTimeout;
\`\`\`

### Public API to Preserve

**Function:** `runAgentQuery(options: AgentQueryOptions): Promise<string>` (Lines 354-448)

**Signature (Must Remain Identical):**
\`\`\`typescript
export async function runAgentQuery(options: AgentQueryOptions): Promise<string>
\`\`\`

**Current Behavior:**
- Returns Promise resolving to string (results joined by newlines)
- Implements retry logic with exponential backoff (max 3 retries)
- Throws `AgentTimeoutError` on timeout
- Throws `AuthenticationError` on credential failures
- Emits progress events via `options.onProgress` callback
- Supports `options.onRetry` callback for retry notifications

**Retry Logic Structure:**
\`\`\`typescript
runAgentQuery() {
  for (attempt 1 to maxRetries) {
    try {
      return await executeAgentQuery(options, queryStartTime);
    } catch (error) {
      if (shouldRetry(error, attempt, maxRetries)) {
        // Emit retry event, wait backoff, continue
      } else {
        throw error;
      }
    }
  }
}
\`\`\`

### Authentication Integration

**File:** `src/core/auth.ts`

**Key Functions ClaudeProvider Will Need:**
- `configureAgentSdkAuth(): { configured: boolean; type: CredentialType }` - Check/configure auth
- `getApiKey(): string | null` - Get current API key
- `getCredentialType(key): CredentialType` - Determine credential type
- `getTokenExpirationInfo(): TokenExpirationInfo` - Check token expiration

**Approach:** Wrap these in a `ClaudeAuthenticator` class implementing `IAuthenticator` interface.

---

## Files Requiring Changes

### 1. **src/providers/claude/index.ts** (Create New)

**Change Type:** Create New  
**Reason:** Contains the `ClaudeProvider` class implementing `IProvider`  
**Specific Changes:**
- Import Claude SDK `query` function
- Import auth functions from `src/core/auth.ts`
- Import config types from `src/core/config.ts`
- Implement `IProvider` interface
- Define `ClaudeProvider` class with:
  - `name = 'claude'`
  - `capabilities` object with accurate Claude limits
  - `query()` method containing all SDK-specific logic (lines 180-347 from client.ts)
  - `validateConfiguration()` using `configureAgentSdkAuth()`
  - `getAuthenticator()` returning `ClaudeAuthenticator` instance
- Implement message streaming and event translation (lines 260-327 from client.ts)
- Handle model selection, settingSources, permissionMode

**Dependencies:** Must be created before modifying `client.ts`

### 2. **src/providers/claude/config.ts** (Create New)

**Change Type:** Create New  
**Reason:** Centralize Claude-specific configuration constants  
**Specific Changes:**
- Export `DEFAULT_MODEL = 'claude-sonnet-4-5-20250929'`
- Export `OPUS_MODEL = 'claude-opus-4-5-20251101'`
- Export `SUPPORTED_MODELS` array
- Export `PERMISSION_MODE = 'acceptEdits'`
- Export `DEFAULT_SETTING_SOURCES = ['project']`
- Export `MAX_CONTEXT_TOKENS = 200000`

**Dependencies:** None

### 3. **src/providers/claude/authenticator.ts** (Create New)

**Change Type:** Create New  
**Reason:** Implement `IAuthenticator` for Claude SDK  
**Specific Changes:**
- Import `IAuthenticator` from `src/providers/types.ts`
- Import auth functions from `src/core/auth.ts`
- Implement `ClaudeAuthenticator` class:
  - `isConfigured()` → calls `configureAgentSdkAuth().configured`
  - `getCredentialType()` → maps to `'api_key'`
  - `configure()` → calls `configureAgentSdkAuth()`
  - `validateCredentials()` → checks API key validity
  - `getTokenExpirationInfo()` → calls `getTokenExpirationInfo()` from auth

**Dependencies:** Must be created before `ClaudeProvider`

### 4. **src/core/client.ts** (Modify Existing)

**Change Type:** Modify Existing  
**Reason:** Remove Claude coupling, delegate to provider registry  
**Specific Changes:**
- **Remove (Line 1):** `import { query } from '@anthropic-ai/claude-agent-sdk';`
- **Add:** `import { ProviderRegistry } from '../providers/index.js';`
- **Refactor `executeAgentQuery()` (Lines 180-347):**
  - Replace lines 240-327 (Claude SDK invocation + message loop) with:
    \`\`\`typescript
    const provider = ProviderRegistry.getDefault();
    const result = await provider.query({
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      workingDirectory: workingDir,
      model: options.model,
      timeout,
      onProgress: options.onProgress,
    });
    return result;
    \`\`\`
- **Keep unchanged:**
  - `runAgentQuery()` signature and retry logic (lines 354-448)
  - Error classification utilities (lines 75-144)
  - Authentication check (line 194-204)
  - Timeout validation (line 206-218)
  - Working directory validation (line 220-222)

**Dependencies:** Requires `ClaudeProvider` to be registered before first call

### 5. **src/providers/index.ts** (Modify Existing)

**Change Type:** Modify Existing  
**Reason:** Export ClaudeProvider and handle registration  
**Specific Changes:**
- Add: `export { ClaudeProvider } from './claude/index.js';`
- Add: `export { ClaudeAuthenticator } from './claude/authenticator.js';`
- **Decision point:** Should registration happen here or in `src/index.ts`?
  - **Option A (Recommended):** Register in `index.ts` after all exports
    \`\`\`typescript
    import { ClaudeProvider } from './claude/index.js';
    ProviderRegistry.register('claude', () => new ClaudeProvider());
    \`\`\`
  - **Option B:** Register in main `src/index.ts` before CLI initialization

**Dependencies:** Requires `ClaudeProvider` class to exist

### 6. **src/index.ts** (Modify Existing)

**Change Type:** Modify Existing  
**Reason:** Ensure provider registration happens at application startup  
**Specific Changes:**
- Add import: `import './providers/index.js';` (if registration in providers/index.ts)
- OR add explicit registration:
  \`\`\`typescript
  import { ProviderRegistry, ClaudeProvider } from './providers/index.js';
  ProviderRegistry.register('claude', () => new ClaudeProvider());
  \`\`\`
- Place registration **before** command definitions (before line ~50)

**Dependencies:** Must happen before any command can call `runAgentQuery()`

### 7. **src/providers/claude/claude.test.ts** (Create New)

**Change Type:** Create New  
**Reason:** Unit tests for ClaudeProvider  
**Specific Changes:**
- Test `getCapabilities()` returns correct values
- Test `query()` method with mo