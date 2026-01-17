---
id: S-0053
title: Auto-retry transient API failures
priority: 5
status: backlog
type: feature
created: '2026-01-17'
labels:
  - p1-production
  - resilience
  - self-healing
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: auto-retry-transient-api-failures
---
# Auto-retry transient API failures

## User Story

**As a** developer using ai-sdlc
**I want** the system to automatically retry when LLM API calls fail due to transient issues
**So that** my workflow completes reliably without manual intervention for temporary glitches

## Summary

This is the highest value, lowest effort improvement for system reliability. API rate limits and network timeouts are the most common failure mode, yet the current system has zero retry logic in `src/core/client.ts`. This single change addresses ~70% of workflow interruptions.

## Acceptance Criteria

- [ ] Retry on 429 (rate limit) with exponential backoff: 2s, 4s, 8s
- [ ] Retry on 503 (service unavailable) with exponential backoff
- [ ] Retry on network errors (ETIMEDOUT, ECONNRESET, ENOTFOUND)
- [ ] Do NOT retry on permanent errors (400, 401, 403, 404)
- [ ] Maximum 3 retry attempts per API call
- [ ] Total retry duration capped at 60 seconds
- [ ] Update spinner text: `"Action (retry N/3 after rate limit)"`
- [ ] Log retry attempts at INFO level with error type and delay
- [ ] After max retries exhausted, fail with clear error message

## Technical Notes

**Location:** Single change in `src/core/client.ts:runAgentQuery()`

**Implementation approach:**
1. Add `classifyError()` function to determine if error is transient
2. Add `shouldRetry()` function based on error type and attempt count
3. Add `calculateBackoff()` for exponential backoff with jitter
4. Wrap existing SDK call with retry loop
5. Don't retry `AuthenticationError` (needs user action)

**Config addition:**
```typescript
api: {
  maxRetries: 3,
  initialDelay: 2000,
  maxDelay: 32000
}
```

**CLI UX:**
- Update ora spinner text during retry (non-intrusive)
- Show warning after 2nd retry: "Experiencing temporary issues..."
- On final failure, show attempt count and last error

**Complexity:** Small (4-6 hours including tests)

## Edge Cases

- Rate limit persists after max retries → Fail with "try again in X minutes"
- Multiple stories hit rate limit simultaneously → Jitter prevents thundering herd
- Timeout mid-response → Treat as complete failure, retry entire request

## Out of Scope

- Configurable retry strategies (hardcoded exponential backoff is fine)
- Retry for non-LLM operations (git, file system)
- UI for retry status beyond spinner text
- Respecting server's `Retry-After` header (future enhancement)

## Testing Strategy

**Unit tests:**
- `shouldRetry()` returns true for 429, 503, ETIMEDOUT
- `shouldRetry()` returns false for 400, 401, 403, 404
- `calculateBackoff()` returns correct delays: 2s, 4s, 8s
- `classifyError()` correctly identifies transient vs permanent

**Integration tests:**
- Mock API returns 429 twice, then success → Verify 2 retries, eventual success
- Mock API returns 401 → Verify no retry, immediate failure
- Verify spinner text updates during retry

## Definition of Done

- [ ] Retry logic added to `runAgentQuery()` in `src/core/client.ts`
- [ ] Unit tests for error classification and backoff logic
- [ ] Integration test verifying retry on 429 then success
- [ ] All existing tests pass
- [ ] `make verify` passes
- [ ] Manual verification: artificially trigger rate limit, observe retry
