---
id: S-0057
title: Add pre-flight checks to implementation loop
priority: 4
status: backlog
type: enhancement
created: '2026-01-17'
labels:
  - implementation-agent
  - optimization
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: implementation-preflight-checks
---
# Add pre-flight checks to implementation loop

## User Story

**As a** developer using the ai-sdlc implementation agent
**I want** the agent to detect no-change situations before verification and remember previous fix attempts
**So that** I don't waste time in retry loops where nothing changes or the same fix is tried multiple times

## Summary

The implementation agent currently has two timing/context issues:

1. **No-change detection runs AFTER verification**: From `src/agents/implementation.ts:868-877`, the diff hash check happens after verification runs. This wastes a full verification cycle (~30 seconds) when the agent made no changes.

2. **No retry history context**: Each retry prompt tells the agent "this is attempt N of M" but doesn't explain what was tried in previous attempts. The agent may repeat the same failed fix.

## Business Value

- **Faster feedback**: Catch no-op iterations immediately (save ~30 seconds per cycle)
- **Smarter retries**: Agent can try different approaches when previous ones failed
- **Better debugging**: Retry history helps diagnose why implementation is stuck

## Acceptance Criteria

### No-Change Detection
- [ ] Before running verification, agent checks `git diff` to detect if any files changed
- [ ] If no files changed, agent immediately reports "No changes detected" without running verification
- [ ] Diff check is fast (< 1 second) and doesn't add significant overhead

### Retry History
- [ ] Retry prompt includes summary of previous fix attempts (what was tried, what failed)
- [ ] History shows: attempt number, primary error addressed, and outcome
- [ ] Retry history limited to last 3 attempts (prevent prompt bloat)
- [ ] Prompt includes guidance "Do NOT repeat the same fixes. Try a different approach."

### Integration
- [ ] Integration test verifies no-change detection prevents verification
- [ ] Integration test verifies retry history is passed to agent on subsequent attempts

## Technical Notes

**Files to modify:**
- `src/agents/implementation.ts` - Add pre-verification diff check + retry history tracking

**No-Change Detection:**
```typescript
// Before running verification
const currentDiffHash = await captureCurrentDiffHash(workingDir);
if (attemptNumber > 1 && lastDiffHash === currentDiffHash) {
  // Skip verification - agent made no changes
  return {
    success: false,
    error: 'No progress detected - agent made no file changes',
    story: parseStory(storyPath),
    changesMade: false,
  };
}

// Only run verification if there are actual changes
const verification = await verifyImplementation(...);
```

**Retry History Structure:**
```typescript
interface RetryAttempt {
  attemptNumber: number;
  errorsSeen: string[];  // First few errors from that attempt
  changesMade: string;   // Brief summary (e.g., "Modified src/foo.ts")
  outcome: 'failed_tests' | 'failed_build' | 'no_change';
}

// In buildRetryPrompt:
if (attemptHistory.length > 0) {
  prompt += `\n## Previous Attempts\n\n`;
  for (const prev of attemptHistory) {
    prompt += `Attempt ${prev.attemptNumber}: ${prev.changesMade} -> ${prev.outcome}\n`;
    prompt += `  Errors: ${prev.errorsSeen.slice(0, 2).join(', ')}\n`;
  }
  prompt += `\nDo NOT repeat the same fixes. Try a different approach.\n`;
}
```

**Open Questions:**
- Should retry history be stored in story metadata or just in-memory during execution?
- What's the right limit for history (3 attempts? 5?)?
- Should we track the specific file changes in each attempt?

## Out of Scope

- Persistent retry history across CLI sessions (in-memory is fine)
- AI-based analysis of retry patterns
- Automatic "step back and reassess" behavior
- Changes to max retry limits

## Testing Strategy

**Unit tests:**
- `captureCurrentDiffHash()` returns consistent hash for same diff
- Retry history correctly formats previous attempts
- History truncation works (keeps last N)

**Integration tests:**
- No-change detection short-circuits before verification
- Retry history passed correctly to agent prompt
- History resets for new implementation runs

## Definition of Done

- [ ] Pre-verification diff check implemented
- [ ] Retry history tracking and prompt formatting
- [ ] Unit tests for both features
- [ ] Integration tests verifying behavior
- [ ] `make verify` passes

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
