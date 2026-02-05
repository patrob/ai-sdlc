---
*Generated: 2026-02-05*

Perfect! Now I have comprehensive context. Let me compile my research findings:

## Research Findings

### Problem Summary

The story aims to extract Claude-specific authentication logic from the generic `src/core/auth.ts` file (470+ lines) into a dedicated `ClaudeAuthenticator` class. This refactoring enables future support for multiple AI providers (GitHub Copilot, OpenAI, etc.) by implementing the existing `IAuthenticator` interface. The key challenge is separating provider-specific authentication mechanisms while maintaining backward compatibility with existing authentication flows.

### Codebase Context

**Current Architecture:**

1. **Provider Abstraction Already Exists**: The codebase already has a well-designed provider abstraction layer:
   - `IProvider` interface in `src/providers/types.ts` defines the contract for AI providers
   - `IAuthenticator` interface (lines 170-214 in `src/providers/types.ts`) already exists with required methods
   - `ClaudeProvider` class (`src/providers/claude/index.ts`) implements `IProvider`
   - **`ClaudeAuthenticator` already exists** at `src/providers/claude/authenticator.ts` (76 lines)
   - Provider registry pattern (`src/providers/registry.ts`) manages provider lifecycle with lazy instantiation

2. **Partial Implementation Complete**: The story has already been partially implemented:
   - `ClaudeAuthenticator` class exists and implements `IAuthenticator`
   - `ClaudeProvider` already has `getAuthenticator()` method returning `ClaudeAuthenticator` instance
   - Tests exist: `src/providers/claude/authenticator.test.ts` (138 lines) and `src/core/auth.test.ts` (883 lines)
   - Integration test exists: `tests/integration/auth-expiration.test.ts` (281 lines)

3. **Authentication Flow**:
   - Entry point: `src/index.ts` uses `hasApiKey()` from `src/core/auth.ts` (line 7, 29)
   - `configureAgentSdkAuth()` (lines 371-391 in auth.ts) is the main function that sets env vars for Claude SDK
   - Credential priority: env vars (`ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`) > credential file (`~/.claude/.credentials.json`) > macOS Keychain
   - Token expiration checking happens in `ClaudeProvider.executeQuery()` (lines 226-241)

4. **Key Functions in auth.ts** (what needs evaluation for migration):
   - `getApiKey()` (lines 301-335): Multi-source credential retrieval with precedence logic
   - `getCredentialsFromFile()` (lines 90-135): Reads `~/.claude/.credentials.json`
   - `getApiKeyFromKeychain()` (lines 397-439): macOS Keychain integration for "Claude Code-credentials"
   - `isTokenExpired()` (lines 145-163): OAuth token expiration check with 30s clock skew buffer
   - `getTokenExpirationInfo()` (lines 212-270): Returns expiration details
   - `isOAuthToken()`, `isDirectApiKey()`, `getCredentialType()` (lines 340-358): Token format detection
   - `configureAgentSdkAuth()` (lines 371-391): Sets process.env vars for Claude SDK
   - `hasApiKey()` (line 444): Boolean check wrapper
   - `getApiKeySource()` (lines 451-469): Returns credential source for display
   - Security utilities: `validateCredentialPath()`, `isValidHomeDirectory()`, `checkFilePermissions()`

5. **Current ClaudeAuthenticator Implementation** (lines 1-76 in `src/providers/claude/authenticator.ts`):
   - Delegates to `core/auth.ts` functions: `configureAgentSdkAuth()`, `getApiKey()`, `getCredentialType()`, `getTokenExpirationInfo()`
   - Implements all `IAuthenticator` methods but is a thin wrapper
   - **The migration has NOT happened yet** - Claude-specific logic still lives in `core/auth.ts`

### Files Requiring Changes

#### **Path**: `src/core/auth.ts`
- **Change Type**: Modify Existing
- **Reason**: Remove all Claude/Anthropic-specific authentication code
- **Specific Changes**: 
  - Remove or refactor the following Claude-specific functions to `ClaudeAuthenticator`:
    - `getApiKey()` - Claude-specific credential sources
    - `getCredentialsFromFile()` - Claude credential file format
    - `getApiKeyFromKeychain()` - Claude Keychain service name
    - `isTokenExpired()` - OAuth-specific expiration logic
    - `getTokenExpirationInfo()` - OAuth token details
    - `isOAuthToken()`, `isDirectApiKey()` - Claude token format detection
    - `getCredentialType()` - Maps to Claude token types
    - `configureAgentSdkAuth()` - Claude SDK environment variable setup
    - `hasApiKey()` - Claude-specific wrapper
    - `getApiKeySource()` - Claude credential source detection
  - Keep generic utilities (if any truly generic):
    - `validateCredentialPath()` - could be generic
    - `isValidHomeDirectory()` - could be generic
    - `checkFilePermissions()` - could be generic
  - After migration, this file may become very small or be removed entirely
- **Dependencies**: Must be done before `ClaudeAuthenticator` changes to avoid circular dependencies

#### **Path**: `src/providers/claude/authenticator.ts`
- **Change Type**: Modify Existing
- **Reason**: Move Claude-specific authentication logic from `core/auth.ts` into this class
- **Specific Changes**:
  - Move all functions listed above from `auth.ts` as private/protected methods
  - Update method implementations to use internal methods instead of delegating to `core/auth`
  - Add Claude-specific constants: `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, credential file path, Keychain service name
  - Maintain the same public API (implements `IAuthenticator` interface)
  - Keep security features: path validation, permission checking, clock skew buffer
- **Dependencies**: Depends on reviewing `auth.ts` to understand full scope

#### **Path**: `src/providers/claude/index.ts` (ClaudeProvider)
- **Change Type**: Modify Existing
- **Reason**: Update imports to use `ClaudeAuthenticator` methods instead of `core/auth` functions
- **Specific Changes**:
  - Line 5: Remove imports `configureAgentSdkAuth`, `getTokenExpirationInfo` from `core/auth`
  - Lines 209-241: Update `executeQuery()` to call `this.authenticator.configureAgentSdkAuth()` instead of direct import
  - Line 227: Update token expiration check to use `this.authenticator.getTokenExpirationInfo()`
  - Ensure authentication logic flows through the authenticator instance
- **Dependencies**: Requires `ClaudeAuthenticator` migration to be complete first

#### **Path**: `src/index.ts` (CLI entry point)
- **Change Type**: Modify Existing
- **Reason**: Update to use provider abstraction instead of direct `core/auth` import
- **Specific Changes**:
  - Line 7: Remove `import { hasApiKey } from './core/auth.js'`
  - Lines 28-43: Update `checkApiKey()` function to use provider registry:
    \`\`\`typescript
    function checkApiKey(): boolean {
      const provider = ProviderRegistry.getDefault();
      const authenticator = provider.getAuthenticator();
      if (!authenticator.isConfigured()) {
        // ... existing error message logic
      }
      return true;
    }
    \`\`\`
  - This delegates to the active provider's authenticator instead of Claude-specific function
- **Dependencies**: None (can be done after authenticator migration)

#### **Path**: `src/core/client.ts`
- **Change Type**: Modify Existing (if needed)
- **Reason**: May have imports from `core/auth` that need updating
- **Specific Changes**:
  - Line 1: Currently imports `getApiKey`, `getCredentialType`, `CredentialType` from `./auth.js`
  - Review usage and potentially remove if now handled by provider abstraction
  - If these are still needed generically, keep them; otherwise delegate to provider
- **Dependencies**: Needs analysis of how client.ts uses auth functions

#### **Path**: `src/core/index.ts`
- **Change Type**: Modify Existing
- **Reason**: May export auth functions that should no longer be public
- **Specific Changes**:
  - Line 15: `export * from './auth.js'` - review what's exported
  - If `auth.ts` becomes provider-specific, remove or update this export
  - Ensure only generic utilities are exported (if any remain)
- **Dependencies**: Depends on what remains in `auth.ts` after migration

#### **Path**: `src/providers/claude/authenticator.test.ts`
- **Change Type**: Modify Existing
- **Reason**: Update tests to reflect that authenticator now has internal implementation
- **Specific Changes**:
  - Lines 5-10: Currently mocks `core/auth.js` - may need to change mocking strategy
  - Update tests to test actual implementation instead of mocked delegates
  - Add tests for new private methods (credential file reading, keychain access, etc.)
  - Ensure all edge cases from `auth.test.ts` are covered
- **Dependencies**: Requires `ClaudeAuthenticator` implementation changes first

#### **Path**: `src/core/auth.test.ts`
- **Change Type**: Modify Existing or Delete
- **Reason**: Tests for Claude-specific auth logic should move to provider tests
- **Specific Changes**:
  - 883 lines of tests - most test Claude-specific behavior
  - Move relevant tests to `authenticator.test.ts` for Claude provider
  - If generic utilities remain in `auth.ts`, keep only those tests
  - Otherwise, this file can be deleted after migration
- **Dependencies**: Should happen after authenticator tests are updated

#### **Path**: `tests/integration/auth-expiration.test.ts`
- **Change Type**: Modify Existing (minor)
- **Reason**: Integration test should continue to work, may need import updates
- **Specific Changes**:
  - Currently imports from `src/core/client.js` which uses provider abstraction
  - Should continue to work as-is since it tests through the client API
  - May need to update mocks if internal structure changes
  - Verify test still passes after migration
- **Dependencies**: Can be tested at the end to verify backward compatibility

### Testing Strategy

**Existing Test Coverage**: The codebase has excellent test coverage:
- Unit tests: `src/core/auth.test.ts` (883 lines) - comprehensive coverage of all auth scenarios
- Provider unit tests: `src/providers/claude/authenticator.test.ts` (138 lines)
- Integration tests: `tests/integration/auth-expiration.test.ts` (2