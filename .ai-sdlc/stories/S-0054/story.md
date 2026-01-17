---
id: S-0054
title: Global recovery circuit breaker
priority: 6
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
slug: global-recovery-circuit-breaker
---
# Global recovery circuit breaker

## User Story

**As a** developer using ai-sdlc
**I want** protection against infinite recovery loops
**So that** buggy implementations don't waste hours of time and exhaust API quota

## Summary

While individual retry counters exist (`implementation_retry_count`, `retry_count`, `refinement_iterations`), there's no cross-phase circuit breaker. A story could loop through implementation → review → rework → implementation indefinitely within individual limits. This story adds a global counter that tracks ALL recovery attempts and blocks the story when a threshold is exceeded.

## Problem Statement

**Current state:**
- Implementation retries: max 3
- Review/RPIV cycle retries: max 3
- Refinement iterations: max 5

**Risk:** A story could theoretically consume 3 + 3 + 5 = 11+ recovery attempts across phases, looping for hours before finally failing. Worse, if each phase resets another phase's counter, infinite loops are possible.

**Solution:** Add `total_recovery_attempts` counter that tracks ALL recovery actions across all phases. Block story when total exceeds 10.

## Acceptance Criteria

- [ ] Add `total_recovery_attempts` field to story frontmatter
- [ ] Increment counter on ANY recovery action:
  - Implementation retry (increment in `implementation.ts`)
  - Rework triggered by review rejection (increment in `runner.ts`)
  - Refinement iteration (increment in `refinement.ts`)
  - API call retry from S-0053 (increment in `client.ts`)
- [ ] Check counter before any action; if >= 10, mark story as `blocked`
- [ ] Log circuit breaker activation with recovery history summary
- [ ] Error message shows timeline: "Tried: 3 impl retries, 2 rework cycles, 5 API retries"
- [ ] Counter resets only on manual `ai-sdlc unblock` command

## Technical Notes

**Files to modify:**
- `src/types/index.ts` - Add `total_recovery_attempts?: number` to StoryFrontmatter
- `src/core/story.ts` - Add helper functions:
  - `incrementTotalRecoveryAttempts(story)`
  - `isAtGlobalRecoveryLimit(story)`
  - `resetTotalRecoveryAttempts(story)` (for unblock command)
- `src/cli/runner.ts` - Check limit before executing any action
- `src/agents/implementation.ts` - Increment on implementation retry
- `src/agents/refinement.ts` - Increment on refinement iteration
- `src/core/client.ts` - Increment on API retry (after S-0053)

**Pattern:** Follow existing `implementation_retry_count` pattern in `src/core/story.ts`

**Complexity:** Small (3-4 hours including tests)

## Edge Cases

- Implementation retry + rework + refinement all contribute to total
- Story manually fixed and unblocked → Counter resets to 0
- Counter persists across CLI sessions (stored in frontmatter)
- Story at limit 9, triggers 2 recoveries simultaneously → Both should be blocked (race condition)

## Out of Scope

- Configurable global limit (hardcoded 10 is fine for now)
- Detailed per-phase tracking of recovery types (just total count)
- Automatic notifications when approaching limit
- Partial reset (e.g., reset only implementation retries but keep total)

## Testing Strategy

**Unit tests:**
- `incrementTotalRecoveryAttempts()` increases counter by 1
- `isAtGlobalRecoveryLimit()` returns true when >= 10
- Counter initializes to 0 for new stories

**Integration tests:**
- Story with 9 recoveries, one more triggers block
- Blocked story shows correct error message with recovery summary
- Unblock command resets counter to 0

## Definition of Done

- [ ] `total_recovery_attempts` field added to StoryFrontmatter type
- [ ] Helper functions in `src/core/story.ts`
- [ ] Counter incremented in all recovery paths
- [ ] Global limit check in runner before any action
- [ ] Unit and integration tests
- [ ] `make verify` passes
- [ ] Manual verification: artificially set counter to 9, trigger recovery, observe block
