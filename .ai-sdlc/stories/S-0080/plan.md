---
*Generated: 2026-02-02*

Perfect! Now I have a comprehensive understanding of the codebase structure. Let me create a detailed implementation plan for extracting the ClaudeProvider from client.ts.

# Implementation Plan: Extract ClaudeProvider from client.ts

## Phase 1: Setup and Structure Creation

- [ ] **T1**: Create provider directory structure
  - Files: `src/providers/claude/` (directory)
  - Dependencies: none
  - Create `src/providers/claude/` directory to house all Claude-specific implementation

- [ ] **T2**: Create Claude configuration file
  - Files: `src/providers/claude/config.ts`
  - Dependencies: none
  - Define Claude-specific constants: permission modes, setting sources, default model, supported models list

- [ ] **T3**: Create Claude authenticator class
  - Files: `src/providers/claude/authenticator.ts`
  - Dependencies: T2
  - Implement `IAuthenticator` interface wrapping existing `auth.ts` functions
  - Delegate to `configureAgentSdkAuth()`, `getCredentialType()`, `getTokenExpirationInfo()`

## Phase 2: Provider Implementation

- [ ] **T4**: Create ClaudeProvider class skeleton
  - Files: `src/providers/claude/index.ts`
  - Dependencies: T2, T3
  - Implement `IProvider` interface with stubs for all required methods
  - Define provider capabilities (streaming, tools, system prompts, multi-turn, context tokens, supported models)

- [ ] **T5**: Extract error handling utilities to provider
  - Files: `src/providers/claude/error-utils.ts`
  - Dependencies: none
  - Move `classifyApiError()`, `getErrorTypeLabel()` from `client.ts` to provider
  - Keep public exports in `client.ts` for backward compatibility (re-export from provider)

- [ ] **T6**: Extract retry logic to provider
  - Files: `src/providers/claude/retry-utils.ts`
  - Dependencies: T5
  - Move `shouldRetry()`, `calculateBackoff()`, `sleep()` from `client.ts` to provider
  - Keep public exports in `client.ts` for backward compatibility (re-export from provider)

- [ ] **T7**: Implement `query()` method - authentication and validation
  - Files: `src/providers/claude/index.ts`
  - Dependencies: T3, T4
  - Move authentication logic from `executeAgentQuery()` into `query()` method
  - Implement working directory validation
  - Handle OAuth token expiration checks

- [ ] **T8**: Implement `query()` method - SDK integration and streaming
  - Files: `src/providers/claude/index.ts`
  - Dependencies: T4, T7
  - Move Claude SDK `query()` call from `client.ts` into provider
  - Implement message streaming loop with timeout handling
  - Translate Claude SDK events to `ProviderProgressEvent` types

- [ ] **T9**: Implement `query()` method - retry logic integration
  - Files: `src/providers/claude/index.ts`
  - Dependencies: T6, T8
  - Integrate retry loop from `runAgentQuery()` into provider's `query()` method
  - Preserve exact retry behavior (exponential backoff, jitter, transient/permanent classification)
  - Emit progress events for retry attempts

- [ ] **T10**: Implement `validateConfiguration()` method
  - Files: `src/providers/claude/index.ts`
  - Dependencies: T3, T4
  - Check if credentials are configured
  - Validate token expiration if OAuth
  - Return `true` if ready, `false` otherwise

- [ ] **T11**: Implement `getAuthenticator()` method
  - Files: `src/providers/claude/index.ts`
  - Dependencies: T3, T4
  - Return Claude authenticator instance
  - Ensure singleton pattern for authenticator if needed

## Phase 3: Client Refactoring

- [ ] **T12**: Update provider index to export ClaudeProvider
  - Files: `src/providers/index.ts`
  - Dependencies: T4
  - Add export for `ClaudeProvider` class
  - Add export for `ClaudeAuthenticator` if needed externally

- [ ] **T13**: Register ClaudeProvider in application startup
  - Files: `src/index.ts`
  - Dependencies: T12
  - Import `ClaudeProvider` at top of file
  - Call `ProviderRegistry.register('claude', () => new ClaudeProvider())` before program initialization
  - Ensure registration happens synchronously before any commands can run

- [ ] **T14**: Refactor `runAgentQuery()` to use provider
  - Files: `src/core/client.ts`
  - Dependencies: T9, T13
  - Replace direct SDK query with `ProviderRegistry.getDefault().query()`
  - Map `AgentQueryOptions` to `ProviderQueryOptions`
  - Preserve exact function signature and return type
  - Remove retry logic (now handled by provider)

- [ ] **T15**: Remove unused Claude SDK imports from client.ts
  - Files: `src/core/client.ts`
  - Dependencies: T14
  - Remove `import { query } from '@anthropic-ai/claude-agent-sdk'`
  - Keep authentication imports (still used by provider through exports)
  - Keep error classes (`AgentTimeoutError`, `AuthenticationError`) as they're part of public API

- [ ] **T16**: Remove `executeAgentQuery()` internal function
  - Files: `src/core/client.ts`
  - Dependencies: T14
  - Delete `executeAgentQuery()` function (logic moved to provider)
  - Ensure no references remain in codebase

## Phase 4: Testing - Unit Tests

- [ ] **T17**: Create unit tests for error classification utilities
  - Files: `src/providers/claude/error-utils.test.ts`
  - Dependencies: T5
  - Test `classifyApiError()` for all HTTP status codes (429, 503, 500, 400, 401, 403, 404)
  - Test network error codes (ETIMEDOUT, ECONNRESET, ENOTFOUND, etc.)
  - Test AuthenticationError classification
  - Verify backward compatibility through client.ts re-exports

- [ ] **T18**: Create unit tests for retry utilities
  - Files: `src/providers/claude/retry-utils.test.ts`
  - Dependencies: T6
  - Test `shouldRetry()` with various error types and attempt counts
  - Test `calculateBackoff()` exponential backoff, capping, and jitter
  - Test `sleep()` timing accuracy
  - Verify backward compatibility through client.ts re-exports

- [ ] **T19**: Create unit tests for ClaudeAuthenticator
  - Files: `src/providers/claude/authenticator.test.ts`
  - Dependencies: T3
  - Test `isConfigured()` with API key, OAuth token, and no credentials
  - Test `getCredentialType()` returns correct type
  - Test `getTokenExpirationInfo()` for OAuth tokens
  - Mock underlying auth functions to avoid real credential checks

- [ ] **T20**: Create unit tests for ClaudeProvider capabilities
  - Files: `src/providers/claude/index.test.ts`
  - Dependencies: T4
  - Test `getCapabilities()` returns correct values
  - Verify `supportsStreaming: true`, `supportsTools: true`, etc.
  - Verify `supportedModels` array contains expected models
  - Verify `maxContextTokens: 200000`

- [ ] **T21**: Create unit tests for ClaudeProvider.query() - happy path
  - Files: `src/providers/claude/index.test.ts`
  - Dependencies: T9
  - Mock Claude SDK to return successful response
  - Verify query executes and returns expected result
  - Verify progress events emitted in correct order
  - Verify authentication configured before query

- [ ] **T22**: Create unit tests for ClaudeProvider.query() - error handling
  - Files: `src/providers/claude/index.test.ts`
  - Dependencies: T9
  - Test timeout handling (verify `AgentTimeoutError` thrown)
  - Test authentication errors (verify `AuthenticationError` thrown)
  - Test transient errors trigger retry
  - Test permanent errors fail immediately without retry

- [ ] **T23**: Create unit tests for ClaudeProvider.query() - retry behavior
  - Files: `src/providers/claude/index.test.ts`
  - Dependencies: T9
  - Test retry loop executes correct number of attempts
  - Test exponential backoff delays between retries
  - Test retry progress events emitted
  - Test max total duration cap enforced

- [ ] **T24**: Create mock provider for testing
  - Files: `src/providers/__mocks__/mock-provider.ts`
  - Dependencies: none
  - Implement `IProvider` with configurable responses
  - Support success, failure, and timeout scenarios
  - Enable testing without actual API calls

## Phase 5: Testing - Integration Tests

- [ ] **T25**: Create integration test for provider registration
  - Files: `src/providers/claude/integration.test.ts`
  - Dependencies: T13
  - Verify ClaudeProvider registered at startup
  - Verify `ProviderRegistry.getDefault()` returns ClaudeProvider
  - Verify `ProviderRegistry.get('claude')` returns same instance

- [ ] **T26**: Create integration test for runAgentQuery() delegation
  - Files: `src/core/client.integration.test.ts`
  - Dependencies: T14
  - Mock provider to verify `runAgentQuery()` delegates to provider
  - Verify exact same options passed through
  - Verify progress events pass through unchanged
  - Verify return value matches provider response

- [ ] **T27**: Verify all existing client.test.ts tests pass
  - Files: `src/core/client.test.ts`
  - Dependencies: T14
  - Run existing test suite without modification
  - Fix any broken tests (should be minimal if backward compatibility preserved)
  - Ensure error classification and retry tests still pass

- [ ] **T28**: Create end-to-end test for complete query flow
  - Files: `tests/integration/provider-e2e.test.ts`
  - Dependencies: T9, T13, T14
  - Test complete flow: client → registry → provider → SDK → response
  - Use mock SDK to avoid real API calls
  - Verify streaming, progress events, and final result
  - Test with both default provider and explicitly specified provider

## Phase 6: Verification and Documentation

- [ ] **T29**: Verify no Claude SDK imports in src/core/
  - Files: none (verification task)
  - Dependencies: T15
  - Run `grep -r "@anthropic-ai/claude-agent-sdk" src/core/` and verify only allowed re-exports
  - Verify client.ts doesn't import SDK directly

- [ ] **T30**: Run full test suite
  - Files: none (verification task)
  - Dependencies: T27
  - Execute `npm test` and verify all tests pass
  - Check for any test regressions
  - Verify code coverage maintained or improved

- [ ] **T31**: Run build verification
  - Files: none (verification task)
  - Dependencies: T30
  - Execute `npm run build` and verify successful compilation
  - Check for TypeScript errors
  - Verify no circular dependencies

- [ ] **T32**: Run make verify
  - Files: none (verification task)
  - Dependencies: T31
  - Execute `make verify` as required by CLAUDE.md
  - Fix any linting, formatting, or test failures
  - Ensure all checks pass before commit

- [ ] **T33**: Manual smoke test - basic agent query
  - Files: none (verification task)
  - Dependencies: T32
  - Run `npm run agent work` or equivalent command
  - Verify agent executes successfully
  - Check that streaming progress events display correctly
  - Confirm no user-visible changes in behavior

- [ ] **T34**: Manual smoke test - error scenarios
  - Files: none (verification task)
  - Dependencies: T33
  - Test with invalid API key (verify authentication error)
  - Test with expired OAuth token (verify expiration warning)
  - Test with network interruption (verify retry behavior)
  - Confirm error messages unchanged from user perspective

- [ ] **T35**: Update story document with implementation details
  - Files: `stories/S-0080/story.md` (or equivalent)
  - Dependencies: T34
  - Mark all acceptance criteria as completed
  - Document any deviations from original plan
  - Update file modification table with actual changes
  - Add notes on backward compatibility preserved

## Phase 7: Cleanup and Final Polish

- [ ] **T36**: Review and optimize imports
  - Files: `src/providers/claude/*.ts`, `src/core/client.ts`
  - Dependencies: T35
  - Remove unused imports
  - Organize import statements (external, internal, types)
  - Follow project import conventions

- [ ] **T37**: Add JSDoc comments to public APIs
  - Files: `src/providers/claude/index.ts`, `src/providers/claude/authenticator.ts`
  - Dependencies: T36
  - Document all public methods with JSDoc
  - Include `@param`, `@returns`, `@throws` annotations
  - Add usage examples where helpful

- [ ] **T38**: Verify code follows project conventions
  - Files: All modified files
  - Dependencies: T37
  - Check ActionType patterns if applicable
  - Verify SOLID principles (SRP, DIP particularly relevant)
  - Ensure DRY - no code duplication between client and provider
  - Review security considerations (credential handling, path validation)

- [ ] **T39**: Final verification run
  - Files: none (verification task)
  - Dependencies: T38
  - Run `make verify` one final time
  - Execute full test suite
  - Run manual smoke tests
  - Verify no regressions introduced

---

## Summary

This plan extracts all Claude-specific code from `client.ts` into a dedicated `ClaudeProvider` class while maintaining complete backward compatibility. The refactoring follows these key principles:

1. **Zero Breaking Changes**: The external API surface of `runAgentQuery()` remains identical
2. **Progressive Refactoring**: Build provider incrementally, test at each step
3. **Backward Compatibility**: Re-export utilities from `client.ts` for existing consumers
4. **Comprehensive Testing**: Unit tests for provider, integration tests for delegation, E2E tests for complete flow
5. **Verification First**: Run `make verify` and manual tests before considering complete

**Total Tasks**: 39 tasks across 7 phases

**Estimated Effort**: Large (as specified in story) - approximately 2-3 days for experienced developer

**Critical Path**: T1→T2→T3→T4→T7→T8→T9→T13→T14→T32

**Risk Mitigation**: 
- Early testing (Phase 4) to catch integration issues
- Preserved backward compatibility reduces regression risk
- Manual smoke tests verify user-facing behavior unchanged