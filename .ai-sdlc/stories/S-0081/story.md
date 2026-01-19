---
id: S-0081
title: Extract ClaudeAuthenticator from auth.ts
priority: 4
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
slug: extract-claude-authenticator
dependencies:
  - S-0078
  - S-0080
---
# Extract ClaudeAuthenticator from auth.ts

## User Story

**As a** developer maintaining ai-sdlc
**I want** Claude authentication logic encapsulated in its own authenticator class
**So that** different providers can have different authentication mechanisms

## Summary

This story extracts all Claude/Anthropic-specific authentication code from `src/core/auth.ts` into a dedicated `ClaudeAuthenticator` class that implements `IAuthenticator`. This enables future providers (GitHub Copilot, OpenAI, etc.) to have their own authentication strategies.

## Technical Context

**Current State:**
- `src/core/auth.ts` (470+ lines) contains:
  - Anthropic API key handling (`ANTHROPIC_API_KEY`, `sk-ant-api*`)
  - Claude Code OAuth token handling (`sk-ant-oat*`)
  - macOS Keychain integration for "Claude Code-credentials"
  - Credential file path: `~/.claude/.credentials.json`
  - Token expiration checking

**Target State:**
- `ClaudeAuthenticator` class implementing `IAuthenticator`
- Generic auth utilities remain in `src/core/auth.ts`
- Provider-specific auth in `src/providers/claude/authenticator.ts`

## Acceptance Criteria

### ClaudeAuthenticator Class

- [ ] Create `src/providers/claude/authenticator.ts` with:
  - [ ] `isConfigured(): boolean` - Check if Claude credentials exist
  - [ ] `getCredentialType(): 'api_key' | 'oauth' | 'none'` - Detect credential type
  - [ ] `configure(): Promise<void>` - Interactive credential setup
  - [ ] `validateCredentials(): Promise<boolean>` - Verify credentials work
  - [ ] `getTokenExpirationInfo()` - OAuth token expiry details

### Move Claude-Specific Code

- [ ] API key detection (`ANTHROPIC_API_KEY` env var)
- [ ] OAuth token format validation (`sk-ant-oat*`, `sk-ant-api*`)
- [ ] Keychain access for "Claude Code-credentials"
- [ ] Credential file reading (`~/.claude/.credentials.json`)
- [ ] Token refresh logic

### Keep Generic in auth.ts

- [ ] Common authentication utilities
- [ ] `checkAuthentication()` delegates to provider's authenticator
- [ ] Shared credential storage helpers (if any)

### Integration with ClaudeProvider

- [ ] `ClaudeProvider.getAuthenticator()` returns `ClaudeAuthenticator` instance
- [ ] `ClaudeProvider` uses authenticator for credential validation

### Backward Compatibility

- [ ] `checkAuthentication()` still works from CLI
- [ ] Same error messages for auth failures
- [ ] Same environment variable names

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/claude/authenticator.ts` | Create | ClaudeAuthenticator implementation |
| `src/providers/claude/index.ts` | Modify | Wire authenticator to provider |
| `src/core/auth.ts` | Modify | Remove Claude-specific code, delegate to provider |

## Code Migration

**Move to ClaudeAuthenticator:**
- `getAnthropicCredential()` logic
- `validateOAuthToken()`
- `checkKeychain()` for Claude credentials
- `readCredentialFile()` for `~/.claude/.credentials.json`
- `isTokenExpired()` logic

**Keep in auth.ts:**
- `checkAuthentication()` (but delegate to authenticator)
- Generic auth error types
- Common utilities

## Testing Requirements

- [ ] Unit tests for `ClaudeAuthenticator` methods
- [ ] Mock keychain access for testing
- [ ] Mock file system for credential file tests
- [ ] Integration test: Auth flow still works end-to-end
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `ClaudeAuthenticator` class implemented
- [ ] All Claude-specific auth code moved from `auth.ts`
- [ ] `ClaudeProvider` integrated with authenticator
- [ ] `checkAuthentication()` works via provider abstraction
- [ ] All existing tests pass
- [ ] Build succeeds

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 3.1
- Design Pattern: Strategy Pattern (for authentication strategies)
- SOLID Principle: Single Responsibility (SRP)
