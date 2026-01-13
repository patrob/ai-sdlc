# Implementation Plan: Security Fixes for Daemon Block Max Retries Feature

## Overview

This plan addresses three security concerns in the daemon-block-max-retries feature: XSS/ANSI injection in review feedback display, log injection via unsanitized console output, and missing bounds checking on numeric values. The solution adds a centralized `sanitizeReasonText()` utility function and applies it consistently at all extraction, display, and storage points.

## FACTS Validation Summary

- **Feasibility**: All tasks use standard TypeScript/JavaScript string manipulation. No external dependencies required. The regex patterns for ANSI escape sequence removal are well-documented.
- **Atomicity**: Each task modifies a single function or adds a single test case. Tasks are completable in 5-15 minutes.
- **Clarity**: Code locations are specified with exact line numbers. The sanitization function implementation is fully specified in the research.
- **Testability**: Each code change has corresponding test cases. Tests cover edge cases like ANSI sequences, control characters, bounds violations, and Unicode normalization.
- **Scope**: Three focused phases, each representing a committable unit. Phase 1 adds the core utility, Phase 2 applies it throughout the codebase, Phase 3 adds comprehensive tests.

## Prerequisites

- Node.js and npm installed
- Project dependencies installed (`npm install`)
- Familiarity with vitest testing framework
- Understanding of ANSI escape sequences and control characters

---

## Phase 1: Add Core Sanitization Utility

**Goal**: Create the `sanitizeReasonText()` function in `story.ts` with comprehensive input sanitization.

**Committable State**: New exported utility function with unit tests; no behavioral changes to existing code yet.

- [x] Add `sanitizeReasonText()` function to `src/core/story.ts` after line 477 (after `snapshotMaxRetries` function)
- [x] Add unit tests for `sanitizeReasonText()` in `src/core/story.test.ts`:
  - [x] Test: returns empty string for null/undefined/empty input
  - [x] Test: removes ANSI escape sequences (e.g., `\x1B[31mred\x1B[0m` becomes `red`)
  - [x] Test: removes OSC sequences (e.g., `\x1B]0;title\x07`)
  - [x] Test: replaces newlines and tabs with spaces
  - [x] Test: removes backticks and pipe characters
  - [x] Test: removes control characters (0x00-0x1F, 0x7F-0x9F)
  - [x] Test: normalizes Unicode (NFC normalization)
  - [x] Test: truncates strings over 200 characters with ellipsis
  - [x] Test: trims leading/trailing whitespace
  - [x] Test: handles complex combined attack strings
- [x] Run `npm test` to verify new tests pass
- [x] Run `npm run build` to verify TypeScript compilation

---

## Phase 2: Apply Sanitization and Bounds Checking

**Goal**: Apply `sanitizeReasonText()` at all extraction points in `kanban.ts` and add bounds checking for numeric values.

**Committable State**: All user-controlled strings sanitized before logging/storage; numeric values validated with bounds.

### 2.1 Review Retry Blocking Path (lines 157-187 in kanban.ts)

- [x] Import `sanitizeReasonText` from `./story.js` in `src/core/kanban.ts` (update existing import on line 5)
- [x] Add bounds checking for `retryCount` at line 162: `Math.max(0, Math.min(Number(story.frontmatter.retry_count) || 0, 999))`
- [x] Add bounds checking for `maxRetries` at line 163: `Math.max(0, Math.min(Number(getEffectiveMaxRetries(story, config)) || 0, 999))`
- [x] Sanitize `lastFailureSummary` at line 165: wrap `latestReview?.feedback.substring(0, 100)` with `sanitizeReasonText()`
- [x] Sanitize console.log output at line 173: apply `sanitizeReasonText()` to the reason in the log message
- [x] Sanitize console.error fallback message at line 176

### 2.2 Refinement Blocking Path (lines 126-152 in kanban.ts)

- [x] Add bounds checking for `refinementCount` at line 128: `Math.max(0, Math.min(Number(story.frontmatter.refinement_count) || 0, 999))`
- [x] Add bounds checking for `maxAttempts` at line 129: `Math.max(0, Math.min(Number(value) || 0, 999))`
- [x] Sanitize console.log output at line 137
- [x] Sanitize console.error fallback message at line 140

### 2.3 Storage Point (moveToBlocked in story.ts)

- [x] Sanitize the `reason` parameter in `moveToBlocked()` at line 115 in `src/core/story.ts` before storing in frontmatter

### 2.4 Verification

- [x] Run `npm test` to verify existing tests still pass
- [x] Run `npm run build` to verify TypeScript compilation

---

## Phase 3: Add Security-Focused Tests

**Goal**: Add comprehensive security tests for the sanitization integration points.

**Committable State**: Full test coverage for security scenarios; all tests passing.

### 3.1 Unit Tests for kanban.ts Security (in `src/core/kanban.test.ts`)

- [x] Add test: markdown special characters in review feedback are handled
- [x] Add test: Negative retry_count values are clamped to 0
- [x] Add test: Extremely large retry_count values are clamped to 999
- [x] Add test: NaN retry_count defaults to 0

### 3.2 Integration Tests (in `tests/integration/kanban-max-retries.test.ts`)

- [x] Add test: Story with ANSI escape sequences in review feedback is blocked with sanitized reason
- [x] Add test: Story with markdown injection attempt (backticks, pipes) is blocked with sanitized reason
- [x] Add test: Story with control characters in feedback preserves readable text only
- [x] Add test: Blocked reason in frontmatter is properly sanitized after storage

### 3.3 Final Verification

- [x] Run `npm test` to verify all tests pass (389 tests passing)
- [x] Run `npm run build` to verify TypeScript compilation
- [x] Verify sanitization applied at all output points

---

## Validation Checklist

- [x] All tests passing (`npm test` exits with 0) - 389 tests pass
- [x] TypeScript compilation succeeds (`npm run build` exits with 0)
- [x] `sanitizeReasonText()` is exported and used consistently at all 5+ sanitization points
- [x] Bounds checking applied to all numeric values (`retry_count`, `max_retries`, `refinement_count`, `maxAttempts`)
- [x] No user-controlled strings reach console.log/console.error without sanitization
- [x] No user-controlled strings stored in frontmatter without sanitization
- [x] Existing functionality preserved (blocking behavior unchanged except for sanitized output)

---

## Key Code Reference

### sanitizeReasonText() Implementation (for `src/core/story.ts`)

```typescript
/**
 * Sanitize user-controlled text for safe display and storage.
 * Removes ANSI escape sequences, control characters, and potential injection vectors.
 * Truncates to 200 characters maximum.
 */
export function sanitizeReasonText(text: string): string {
  if (!text) return '';

  let sanitized = text
    // Remove ANSI CSI sequences (colors, cursor movement) - e.g., \x1B[31m
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    // Remove OSC sequences (hyperlinks, window titles) - terminated by BEL (\x07) or ST (\x1B\\)
    .replace(/\x1B\][^\x07]*\x07/g, '')
    .replace(/\x1B\][^\x1B]*\x1B\\/g, '')
    // Remove any remaining standalone escape characters
    .replace(/\x1B/g, '')
    // Replace newlines and tabs with spaces
    .replace(/[\n\r\t]/g, ' ')
    // Remove potential markdown injection characters
    .replace(/[`|>]/g, '')
    // Remove remaining control characters
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');

  // Normalize Unicode to prevent homograph attacks
  sanitized = sanitized.normalize('NFC');

  // Truncate to prevent storage bloat
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 197) + '...';
  }

  return sanitized.trim();
}
```

### Bounds Checking Pattern (inline)

```typescript
// Apply at extraction points for numeric values
const retryCount = Math.max(0, Math.min(Number(story.frontmatter.retry_count) || 0, 999));
const maxRetries = Math.max(0, Math.min(Number(getEffectiveMaxRetries(story, config)) || 0, 999));
```
