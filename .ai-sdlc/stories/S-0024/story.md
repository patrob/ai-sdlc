---
id: S-0024
title: Graceful auth failure handling with expiration warnings
priority: 15
status: backlog
type: feature
created: '2026-01-13'
labels:
  - p1-important
  - authentication
  - user-experience
  - error-handling
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: graceful-auth-failure-handling
---
# Graceful auth failure handling with expiration warnings

## User Story

**As a** developer using ai-sdlc
**I want** clear, helpful messages when my authentication expires or is about to expire
**So that** I can quickly re-authenticate and continue my work without confusion

## Summary

When OAuth tokens expire, users currently receive unclear error messages. This story adds proactive expiration detection and clear guidance, improving the user experience without the complexity of implementing automatic token refresh (which requires unknown Anthropic OAuth endpoints).

This is a follow-up to S-0023 (Cross-platform credential management) and depends on the credential file reading implemented there.

## Dependencies

- S-0023: Cross-platform credential management (must be completed first)

## Acceptance Criteria

### Must Have (P0)
- [ ] Detect token expiration before making API calls
- [ ] If token is expired, throw clear error: "OAuth token has expired. Please run `claude login` to refresh your credentials."
- [ ] If token expires within 5 minutes, log warning: "OAuth token expires in less than 5 minutes. Consider running `claude login`."
- [ ] Error messages do not include stack traces for auth failures
- [ ] Graceful exit on auth failure (don't lose work in progress where possible)

### Should Have (P1)
- [ ] Include credential source in error message for debugging (e.g., "Token from ~/.claude/.credentials.json has expired")
- [ ] Detect missing `expiresAt` field gracefully (skip expiration check, rely on API rejection)
- [ ] Handle clock skew gracefully (allow small buffer before declaring expired)

### Edge Cases
- [ ] Credentials file exists but has no `expiresAt` field - skip expiration check
- [ ] `expiresAt` is malformed/unparseable - skip expiration check, log debug warning
- [ ] Token expires mid-workflow - provide clear guidance on how to resume

## Technical Approach

### New Functions in `src/core/auth.ts`

```typescript
interface TokenExpirationInfo {
  isExpired: boolean;
  expiresAt: Date | null;
  expiresInMs: number | null;
  source: string | null;
}

export function getTokenExpirationInfo(): TokenExpirationInfo {
  // Read from credentials file (all platforms) or keychain (macOS)
  // Return expiration status without attempting refresh
}

export function isTokenExpired(expiresAt: string): boolean {
  // Parse ISO date string, compare to now
  // Include small buffer (30 seconds) for clock skew
}

export function isTokenExpiringSoon(expiresAt: string, bufferMs: number = 5 * 60 * 1000): boolean {
  // Check if token expires within buffer period
}
```

### Integration Points

**In `src/core/client.ts` (runAgentQuery):**
```typescript
// Before API call:
const tokenInfo = getTokenExpirationInfo();
if (tokenInfo.isExpired) {
  throw new AuthenticationError(
    `OAuth token has expired. Please run \`claude login\` to refresh your credentials.`
  );
}
if (tokenInfo.expiresInMs && tokenInfo.expiresInMs < 5 * 60 * 1000) {
  console.warn('⚠️  OAuth token expires in less than 5 minutes. Consider running `claude login`.');
}
```

### Key Files
- `src/core/auth.ts` - Add expiration checking functions
- `src/core/client.ts` - Integrate expiration check before API calls
- `src/core/auth.test.ts` - Unit tests for expiration logic

## Testing Strategy

**Unit tests:**
- `isTokenExpired()` returns true for past dates
- `isTokenExpired()` returns false for future dates
- `isTokenExpired()` handles clock skew buffer correctly
- `isTokenExpiringSoon()` returns true when within buffer
- `isTokenExpiringSoon()` returns false when outside buffer
- `getTokenExpirationInfo()` handles missing `expiresAt` gracefully
- `getTokenExpirationInfo()` handles malformed dates gracefully

**Integration tests:**
- API call with expired token shows clear error message
- API call with expiring-soon token shows warning but proceeds
- API call with valid token proceeds without warnings

## Why Not Automatic Token Refresh?

This story explicitly does NOT implement automatic token refresh because:

1. **Unknown refresh endpoint** - Anthropic's OAuth refresh URL is not documented
2. **Unknown auth requirements** - Refresh may require client_id/client_secret we don't have
3. **Security responsibility** - We'd become responsible for secure token handling
4. **Maintenance burden** - Would need to track Anthropic's OAuth changes
5. **Separation of concerns** - Authentication is Claude Code CLI's responsibility

The Claude Code CLI already handles token refresh internally. This story provides a good user experience by detecting expiration and guiding users to the official refresh mechanism (`claude login`).

## Out of Scope

- Automatic token refresh (see rationale above)
- Token refresh endpoint discovery
- Credential storage/write-back
- Session persistence across token expiration

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
