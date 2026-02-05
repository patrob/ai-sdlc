---
*Generated: 2026-02-05*

Based on my analysis of the codebase, I can see that the `ClaudeAuthenticator` has already been extracted and implemented. However, let me create a comprehensive implementation plan that covers the complete refactoring work as described in the story, including verification that all requirements are met.

# Implementation Plan: Extract ClaudeAuthenticator from auth.ts

## Phase 1: Analysis & Verification
- [ ] **T1**: Verify current implementation completeness
  - Files: `src/providers/claude/authenticator.ts`, `src/core/auth.ts`
  - Dependencies: none
  - Verify that `ClaudeAuthenticator` implements all `IAuthenticator` interface methods
  - Confirm all Claude-specific logic has been moved from `auth.ts`

- [ ] **T2**: Review interface compliance
  - Files: `src/providers/types.ts`, `src/providers/claude/authenticator.ts`
  - Dependencies: T1
  - Ensure `IAuthenticator` interface matches story requirements
  - Verify method signatures and return types are correct

- [ ] **T3**: Analyze remaining code in auth.ts
  - Files: `src/core/auth.ts`
  - Dependencies: T1
  - Identify any Claude-specific code that still needs extraction
  - Document what generic utilities should remain

## Phase 2: Complete ClaudeAuthenticator Implementation

- [ ] **T4**: Ensure all credential detection methods are encapsulated
  - Files: `src/providers/claude/authenticator.ts`
  - Dependencies: T3
  - Verify API key detection (`ANTHROPIC_API_KEY` env var)
  - Verify OAuth token detection (`sk-ant-oat*` pattern)
  - Verify credential file reading (`~/.claude/.credentials.json`)
  - Verify macOS Keychain integration

- [ ] **T5**: Implement credential validation method
  - Files: `src/providers/claude/authenticator.ts`
  - Dependencies: T4
  - Current implementation just checks if credentials exist
  - Consider if test API call is needed (as per AC)
  - Document decision if skipping test API call

- [ ] **T6**: Verify token expiration methods
  - Files: `src/providers/claude/authenticator.ts`, `src/core/auth.ts`
  - Dependencies: T4
  - Ensure `getTokenExpirationInfo()` returns correct format
  - Verify clock skew buffer (30 seconds) is implemented
  - Test expiration detection logic

## Phase 3: Refactor auth.ts for Generic Utilities

- [ ] **T7**: Move Claude-specific constants to ClaudeAuthenticator
  - Files: `src/core/auth.ts`, `src/providers/claude/authenticator.ts`
  - Dependencies: T4
  - Extract `ANTHROPIC_API_KEY` constant reference
  - Extract token format patterns (`sk-ant-oat*`, `sk-ant-api*`)
  - Extract credential file path (`~/.claude/.credentials.json`)
  - Extract keychain service name ("Claude Code-credentials")

- [ ] **T8**: Extract Claude-specific helper functions
  - Files: `src/core/auth.ts`, `src/providers/claude/authenticator.ts`
  - Dependencies: T7
  - Move `getCredentialsFromFile()` if Claude-specific
  - Move `getApiKeyFromKeychain()` if Claude-specific
  - Move `isTokenExpired()` if Claude-specific
  - Keep generic path validation and security functions in auth.ts

- [ ] **T9**: Refactor configureAgentSdkAuth for provider abstraction
  - Files: `src/core/auth.ts`, `src/providers/claude/index.ts`
  - Dependencies: T8
  - Determine if this should be Claude-specific or generic
  - Move to ClaudeProvider if Claude-specific
  - Update ClaudeProvider.query() to call internal auth config

- [ ] **T10**: Update getApiKey() to delegate to provider
  - Files: `src/core/auth.ts`
  - Dependencies: T9
  - Consider making this a generic function that delegates to active provider
  - Or keep as Claude-specific and move to authenticator
  - Document decision and rationale

## Phase 4: Provider Integration

- [ ] **T11**: Verify ClaudeProvider uses authenticator correctly
  - Files: `src/providers/claude/index.ts`
  - Dependencies: T5
  - Confirm `getAuthenticator()` returns ClaudeAuthenticator instance
  - Verify `validateConfiguration()` delegates to authenticator
  - Check authentication in `query()` method uses authenticator

- [ ] **T12**: Update authentication error handling
  - Files: `src/providers/claude/index.ts`
  - Dependencies: T11
  - Ensure expired token errors reference authenticator
  - Maintain same error message format for backward compatibility
  - Test error messages match original behavior

- [ ] **T13**: Add authenticator exports
  - Files: `src/providers/claude/index.ts`
  - Dependencies: T4
  - Export `ClaudeAuthenticator` class
  - Export any Claude-specific auth types if needed
  - Update barrel exports in `src/providers/index.ts` if exists

## Phase 5: Testing

### Unit Tests

- [ ] **T14**: Review existing ClaudeAuthenticator tests
  - Files: `src/providers/claude/authenticator.test.ts`
  - Dependencies: T6
  - Verify all methods have test coverage
  - Check mocking of keychain, file system, env vars
  - Ensure edge cases are covered

- [ ] **T15**: Add missing test cases for ClaudeAuthenticator
  - Files: `src/providers/claude/authenticator.test.ts`
  - Dependencies: T14
  - Test `isConfigured()` with all credential sources
  - Test `getCredentialType()` for api_key, oauth, none
  - Test `configure()` error cases
  - Test `validateCredentials()` with various scenarios
  - Test `getTokenExpirationInfo()` edge cases

- [ ] **T16**: Update auth.ts tests
  - Files: `src/core/auth.test.ts`
  - Dependencies: T10
  - Remove tests for moved Claude-specific functions
  - Add tests for remaining generic utilities
  - Ensure no Claude-specific logic is tested here

- [ ] **T17**: Test credential priority ordering
  - Files: `src/providers/claude/authenticator.test.ts`
  - Dependencies: T15
  - Test env var > keychain > file priority
  - Test with multiple sources present
  - Verify correct source is used

- [ ] **T18**: Test token expiration scenarios
  - Files: `src/providers/claude/authenticator.test.ts`
  - Dependencies: T15
  - Test expired tokens
  - Test expiring soon (within 5 minutes)
  - Test clock skew buffer (30 seconds)
  - Test invalid/missing expiration dates

### Integration Tests

- [ ] **T19**: Test end-to-end authentication flow
  - Files: `tests/integration/auth-flow.test.ts` (create if needed)
  - Dependencies: T11
  - Test ClaudeProvider with authenticator
  - Test authentication from different sources
  - Verify query execution with valid credentials
  - Test error handling for invalid/expired credentials

- [ ] **T20**: Test backward compatibility
  - Files: `tests/integration/auth-flow.test.ts`
  - Dependencies: T19
  - Verify same environment variables still work
  - Verify credential file format unchanged
  - Verify keychain service name unchanged
  - Confirm error messages match original

## Phase 6: Edge Cases & Security

- [ ] **T21**: Verify path traversal protection
  - Files: `src/providers/claude/authenticator.ts`, `src/core/auth.ts`
  - Dependencies: T8
  - Test with manipulated HOME env var
  - Ensure credential path validation works
  - Test `isValidHomeDirectory()` function

- [ ] **T22**: Verify file permission checking
  - Files: `src/providers/claude/authenticator.ts`
  - Dependencies: T21
  - Test permission warnings for 644, 640 modes
  - Test no warnings for 600, 400 modes
  - Verify TOCTOU protection (stat before read)

- [ ] **T23**: Test keychain access denial handling
  - Files: `src/providers/claude/authenticator.ts`
  - Dependencies: T15
  - Test graceful failure when keychain access denied
  - Test fallback to credential file
  - Ensure no crashes or exposed errors

- [ ] **T24**: Test corrupted credential file handling
  - Files: `src/providers/claude/authenticator.ts`
  - Dependencies: T15
  - Test invalid JSON
  - Test empty file
  - Test missing accessToken field
  - Verify helpful error messages

- [ ] **T25**: Test non-macOS platform behavior
  - Files: `src/providers/claude/authenticator.ts`
  - Dependencies: T23
  - Test on Linux (no keychain)
  - Test on Windows (no keychain)
  - Verify graceful degradation

## Phase 7: Documentation & Code Quality

- [ ] **T26**: Add JSDoc comments to ClaudeAuthenticator
  - Files: `src/providers/claude/authenticator.ts`
  - Dependencies: T6
  - Document each public method
  - Add usage examples
  - Document credential priority order
  - Document platform-specific behavior

- [ ] **T27**: Update auth.ts documentation
  - Files: `src/core/auth.ts`
  - Dependencies: T10
  - Update file header comments
  - Document what remains in auth.ts vs provider
  - Add migration notes if applicable

- [ ] **T28**: Add architecture documentation
  - Files: `docs/architecture-analysis.md` (update Section 3.1)
  - Dependencies: T13
  - Document provider authentication abstraction
  - Explain ClaudeAuthenticator design
  - Document how to add future authenticators

- [ ] **T29**: Review code for tidy improvements
  - Files: `src/providers/claude/authenticator.ts`, `src/core/auth.ts`
  - Dependencies: T26
  - Rename unclear variables (per Tidy Rule)
  - Add missing types
  - Keep improvements scoped to modified files only

## Phase 8: Verification & Pre-Commit

- [ ] **T30**: Run all unit tests
  - Files: All test files
  - Dependencies: T18
  - Execute: `npm test`
  - Ensure all tests pass
  - Fix any failing tests

- [ ] **T31**: Run build
  - Files: All TypeScript files
  - Dependencies: T30
  - Execute: `npm run build`
  - Fix any compilation errors
  - Verify no type errors

- [ ] **T32**: Run make verify
  - Files: All project files
  - Dependencies: T31
  - Execute: `make verify`
  - Fix any linting errors
  - Fix any formatting issues
  - Ensure all pre-commit checks pass

- [ ] **T33**: Manual testing of authentication flows
  - Files: N/A (CLI testing)
  - Dependencies: T32
  - Test with ANTHROPIC_API_KEY env var
  - Test with credential file
  - Test with keychain (macOS only)
  - Test with expired token
  - Test with no credentials

- [ ] **T34**: Verify no breaking changes
  - Files: All modified files
  - Dependencies: T33
  - Test existing CLI commands work
  - Verify error messages unchanged
  - Confirm credential file format unchanged
  - Test environment variable names unchanged

## Phase 9: Final Review & Completion

- [ ] **T35**: Code review checklist
  - Files: All modified files
  - Dependencies: T34
  - Verify all acceptance criteria met
  - Check SOLID principles applied
  - Verify DRY principle followed
  - Confirm security best practices

- [ ] **T36**: Update story document
  - Files: Story file
  - Dependencies: T35
  - Mark all acceptance criteria as complete
  - Document any deviations from plan
  - Add notes on implementation decisions

- [ ] **T37**: Final verification
  - Files: All files
  - Dependencies: T36
  - Run `make verify` one final time
  - Confirm all tests pass
  - Verify build succeeds
  - Ready for commit

---

## Summary

This plan extracts Claude authentication logic into a dedicated `ClaudeAuthenticator` class that implements the `IAuthenticator` interface. The work is organized into 9 phases:

1. **Analysis & Verification** - Understand current state and verify interface compliance
2. **ClaudeAuthenticator Implementation** - Complete all authenticator methods
3. **Refactor auth.ts** - Remove Claude-specific code, keep generic utilities
4. **Provider Integration** - Wire authenticator into ClaudeProvider
5. **Testing** - Unit tests, integration tests, and edge case coverage
6. **Edge Cases & Security** - Path traversal, permissions, platform compatibility
7. **Documentation** - Code comments, architecture docs, migration notes
8. **Verification** - Tests, build, make verify, manual testing
9. **Final Review** - Code review, story completion, final checks

The implementation maintains backward compatibility with existing authentication flows while enabling future providers to have their own authentication strategies.