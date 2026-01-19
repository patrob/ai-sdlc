---
id: S-0114
title: Implementation retry count resets on verification success causing infinite RECOVERY loops
slug: implementation-retry-count-resets-on-verification-
priority: 1
status: backlog
type: bug
created: '2026-01-19'
labels:
  - resilience
  - infinite-loop
  - p0-critical
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
content_type: code
---
# Implementation retry count resets on verification success causing infinite RECOVERY loops

## Summary

The `implementation_retry_count` is reset to 0 whenever implementation verification passes (tests + build succeed), even when the implementation didn't make actual source code changes. This defeats the max retry limit check, causing infinite RECOVERY loops.

## Problem Statement

When a story enters a RECOVERY loop (implementation passes tests but review detects "no source code changes"):

1. RECOVERY handler increments `implementation_retry_count` (e.g., 0 → 1)
2. Implementation runs again, tests pass → **BUG: resets retry count to 0**
3. Implementation sets `implementation_complete: true`
4. Review runs → detects "no source code changes" → triggers RECOVERY
5. RECOVERY increments count (0 → 1, but was already 1 before reset!)
6. Loop continues indefinitely

The max retry check (`implementation_retry_count > max_retries`) never triggers because the count keeps resetting on each "successful" implementation.

## Root Cause

In `src/agents/implementation.ts`:
- Line 861: `await resetImplementationRetryCount(updatedStory);` when verification passes
- Line 1133: `await resetImplementationRetryCount(tddResult.story);` in TDD success path

These reset calls happen BEFORE the review validates that actual code changes were made.

## Evidence

Story S-0112 got stuck with 84+ implement actions recorded in workflow state, but `implementation_retry_count` was only 1. The retry count was being reset each time implementation "succeeded" (tests passed), preventing the max retry limit from triggering.

## Acceptance Criteria

- [ ] Remove `resetImplementationRetryCount()` calls from `src/agents/implementation.ts` (lines 861 and 1133)
- [ ] Add `resetImplementationRetryCount()` call in the APPROVED path of review handling in `src/cli/commands.ts` (around line 2213)
- [ ] When review triggers RECOVERY, the `implementation_retry_count` increments and is NOT reset by subsequent implementation runs
- [ ] After `max_retries` (default 3) RECOVERY cycles, story is marked as blocked
- [ ] Add unit tests verifying retry count persists through implement → review → RECOVERY cycle
- [ ] Add integration test verifying max retry limit triggers after N RECOVERY cycles

## Technical Approach

**Fix Strategy:** Move the retry count reset from "implementation verification passes" to "review approves".

**Files to Modify:**
1. `src/agents/implementation.ts` - Remove `resetImplementationRetryCount()` calls (lines 861, 1133)
2. `src/cli/commands.ts` - Add `resetImplementationRetryCount()` in APPROVED handler (around line 2213)
3. `tests/unit/implementation-retry.test.ts` - Add test for retry count persistence
4. `tests/integration/recovery-loop.test.ts` - Add test for max retry limit trigger

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
