---
id: S-0057
title: Add pre-flight checks to implementation loop
priority: 4
status: in-progress
type: enhancement
created: '2026-01-17'
labels:
  - implementation-agent
  - optimization
  - s
research_complete: true
plan_complete: true
implementation_complete: false
reviews_complete: false
slug: implementation-preflight-checks
worktree_path: >-
  /Users/probinson/Repos/on-par/pocs/ai-sdlc/.ai-sdlc/worktrees/S-0057-implementation-preflight-checks
updated: '2026-01-19'
branch: ai-sdlc/implementation-preflight-checks
last_test_run:
  passed: true
  failures: 0
  timestamp: '2026-01-19T01:04:02.851Z'
implementation_retry_count: 0
---
# Add pre-flight checks to implementation loop

## User Story

**As a** developer using the ai-sdlc implementation agent  
**I want** the agent to detect no-change situations before running verification and provide context about previous fix attempts  
**So that** I avoid wasting time on redundant verification cycles and prevent the agent from repeatedly trying the same unsuccessful fixes

## Summary

The implementation agent currently runs verification before checking if any code changed, wasting ~30 seconds per no-op iteration. Additionally, retry prompts lack context about what was already attempted, causing the agent to repeat failed approaches.

This story adds two optimizations:
1. **Pre-flight diff check**: Detect no-change situations before verification runs
2. **Retry history context**: Provide the agent with summaries of previous attempts to guide different approaches

## Business Value

- **Faster feedback loop**: Save ~30 seconds per no-op iteration by short-circuiting verification
- **Higher success rate**: Reduce retry failures by helping the agent avoid repeating unsuccessful fixes
- **Better observability**: Retry history aids in debugging stuck implementation loops

## Acceptance Criteria

### Pre-Flight No-Change Detection
- [ ] Before running verification, capture a diff hash of the current working directory state
- [ ] If `attemptNumber > 1` and the diff hash matches the previous attempt, skip verification entirely
- [ ] Return a clear error: `"No progress detected - agent made no file changes"`
- [ ] Set `changesMade: false` in the return result
- [ ] Diff hash computation completes in < 1 second (no performance regression)

### Retry History Context
- [ ] Track retry attempts in memory with: attempt number, errors encountered, changes made summary, and outcome
- [ ] Include retry history in the agent prompt on subsequent attempts (attempts 2+)
- [ ] Format shows: `Attempt N: <changes> -> <outcome>` with first 2 errors listed
- [ ] Limit history to last 3 attempts to prevent prompt bloat
- [ ] Add explicit instruction: `"Do NOT repeat the same fixes. Try a different approach."`
- [ ] Reset retry history when starting a new implementation run (not carried across stories)

### Edge Cases & Constraints
- [ ] If diff hash computation fails, log warning and proceed with verification (fail-safe behavior)
- [ ] Handle case where git is not available (fallback to always running verification)
- [ ] Ensure diff hash only considers tracked + staged files (ignore untracked temp files)
- [ ] If verification is skipped due to no changes, still update `lastDiffHash` for next iteration

## Technical Notes

**Files to modify:**
- `src/agents/implementation.ts` - Add `captureCurrentDiffHash()`, retry history tracking, pre-flight check before verification

**Diff Hash Implementation:**
```typescript
async function captureCurrentDiffHash(workingDir: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git diff HEAD', { cwd: workingDir });
    return createHash('sha256').update(stdout).digest('hex');
  } catch (error) {
    console.warn('Failed to capture diff hash:', error);
    return null; // Fail-safe: null means "always run verification"
  }
}
```

**Retry History Structure:**
```typescript
interface RetryAttempt {
  attemptNumber: number;
  errorsSeen: string[];        // First 2-3 error messages
  changesSummary: string;      // e.g., "Modified src/foo.ts, src/bar.ts"
  outcome: 'failed_tests' | 'failed_build' | 'no_change';
}

let attemptHistory: RetryAttempt[] = []; // In-memory, resets per story
```

**Pre-Flight Check Logic:**
```typescript
// In runImplementationLoop, before verification:
const currentDiffHash = await captureCurrentDiffHash(workingDir);

if (attemptNumber > 1 && lastDiffHash && currentDiffHash === lastDiffHash) {
  console.warn('⚠️  No changes detected since last attempt');
  return {
    success: false,
    error: 'No progress detected - agent made no file changes',
    story: parseStory(storyPath),
    changesMade: false,
  };
}

lastDiffHash = currentDiffHash;

// Proceed with verification...
const verification = await verifyImplementation(...);
```

**Open Questions:**
- ✅ Storage: In-memory during execution (not persisted)
- ✅ History limit: 3 attempts
- ✅ Change tracking: Summary of filenames, not full diffs

## Out of Scope

- Persisting retry history to disk or story metadata
- AI-driven analysis of retry patterns to suggest fixes
- Automatic escalation after N identical attempts
- Changing maximum retry limits
- Tracking detailed line-by-line diffs in history

## Edge Cases to Consider

1. **Git not available**: Diff hash returns `null`, verification always runs (safe fallback)
2. **First attempt**: No previous hash exists, always run verification
3. **Agent modified then reverted files**: Diff hash will be the same, correctly detected as no-change
4. **Untracked files created**: `git diff HEAD` ignores untracked files (correct behavior)
5. **Hash computation failure**: Log warning, proceed with verification (fail-safe)

## Testing Strategy

**Unit tests (`src/agents/implementation.test.ts`):**
- `captureCurrentDiffHash()` returns consistent hash for identical diffs
- `captureCurrentDiffHash()` returns different hashes for different diffs
- `captureCurrentDiffHash()` handles git errors gracefully (returns null)
- Retry history correctly formats attempts with truncation
- Retry history limited to last 3 attempts

**Integration tests (`tests/integration/implementation-preflight.test.ts`):**
- No-change detection skips verification on attempt 2+ when diff unchanged
- Verification still runs on attempt 1 (no previous hash)
- Retry history included in agent prompt on attempt 2+
- History resets between different story implementations
- Verification runs when diff hash changes between attempts

## Definition of Done

- [ ] `captureCurrentDiffHash()` function implemented with error handling
- [ ] Pre-verification diff check added to implementation loop
- [ ] Retry history tracking (in-memory) with 3-attempt limit
- [ ] Retry history formatting added to agent prompt
- [ ] Unit tests written and passing (5+ tests)
- [ ] Integration tests written and passing (3+ tests)
- [ ] `npm test` passes with 0 failures
- [ ] `npm run build` succeeds
- [ ] `make verify` passes
- [ ] No temporary files or scripts created during implementation

## Research

<!-- Populated by research agent -->

Perfect! Now I have a comprehensive understanding of the codebase. Let me compile my research findings:

## Research

### Problem Summary

The implementation agent currently runs the full verification suite (build + tests, ~30 seconds) before detecting no-change situations where the agent made no file modifications between retry attempts. Additionally, when retries occur, the agent lacks context about previous failed attempts, often repeating the same unsuccessful fixes. This story adds:

1. **Pre-flight diff check**: Compare git diff hash before verification to detect no-change scenarios early
2. **Retry history context**: Track previous attempts and include them in retry prompts to guide different approaches

### Codebase Context

#### Current Implementation Flow

**File: `src/agents/implementation.ts`**

The implementation agent has a retry loop in `attemptImplementationWithRetries()` (lines 723-929):

1. **Existing no-change detection** (lines 836-878): Already implemented! The code captures diff hashes using `captureCurrentDiffHash()` and checks for identical changes between attempts
2. **Existing retry prompt** (lines 756-774): Uses `buildRetryPrompt()` to construct prompts with test/build output on retry attempts
3. **Verification flow** (lines 806-830): Runs `verifyImplementation()` after agent completes, then checks results

**Key finding**: The current implementation already has:
- `captureCurrentDiffHash()` function (lines 1226-1249) - hashes `git diff HEAD` output
- `hasChangesOccurred()` function (lines 1257-1259) - compares hashes
- No-change detection logic (lines 871-878) - exits early when identical hashes detected
- `AttemptHistoryEntry` interface (lines 705-711) - tracks test/build failures per attempt
- `attemptHistory` array (lines 732) - stores attempt history in memory

**What's missing**:
- Pre-flight check happens AFTER verification, not before (line 836 - after line 807 verification)
- Retry history is tracked but NOT included in the agent prompt
- History structure doesn't include changes summary or outcome enum

#### Verification Process

**File: `src/agents/verification.ts`**

- `verifyImplementation()` (lines 164-249): Runs build + tests with ~30 second overhead
- Checks dependencies, runs build, then tests (fail-fast if build fails)
- Returns `VerificationResult` with passed/failures/output

#### Testing Patterns

**Existing tests**: `tests/integration/implementation-retry.test.ts`
- Tests retry count persistence (lines 99-160)
- Tests no-change detection (lines 216-249)
- Uses mock `spawnSync` to control git diff output
- Tests per-story config overrides (lines 251-300)

**Unit tests**: `src/agents/implementation.test.ts`
- Tests `captureCurrentDiffHash()` and helper functions
- Uses `vi.mock('child_process')` pattern

### Files Requiring Changes

#### **1. `src/agents/implementation.ts`** (Modify Existing)
- **Change Type**: Modify Existing
- **Reason**: Move diff check before verification, enhance retry history
- **Specific Changes**:
  - **Lines 836-878 (no-change detection)**: Move diff hash capture to BEFORE verification call (before line 807)
  - **Lines 705-711 (AttemptHistoryEntry interface)**: Add fields:
    - `changesSummary: string` - e.g., "Modified src/foo.ts, src/bar.ts"
    - `outcome: 'failed_tests' | 'failed_build' | 'no_change'` - explicit outcome
  - **Lines 756-774 (retry prompt building)**: Add `buildRetryHistorySection()` to format attempt history
  - **Lines 1357-1456 (buildRetryPrompt)**: Add retry history parameter and call to `buildRetryHistorySection()`
  - **Security**: Existing `validateWorkingDir()` already sanitizes paths for git operations
- **Dependencies**: None - self-contained changes

#### **2. `src/agents/implementation.test.ts`** (Modify Existing)
- **Change Type**: Modify Existing
- **Reason**: Add unit tests for new retry history logic
- **Specific Changes**:
  - Add test: `buildRetryPrompt` includes retry history when provided
  - Add test: `buildRetryHistorySection` formats attempts correctly
  - Add test: Retry history limited to last 3 attempts
  - Add test: Pre-flight check prevents verification when no changes detected
- **Dependencies**: Implementation changes in `implementation.ts`

#### **3. `tests/integration/implementation-preflight.test.ts`** (Create New)
- **Change Type**: Create New
- **Reason**: Integration tests for pre-flight checks and retry history
- **Specific Changes**:
  - Test: Verification skipped when diff hash unchanged on attempt 2+
  - Test: Verification runs on attempt 1 (no previous hash to compare)
  - Test: Retry history included in agent prompt on attempt 2+
  - Test: History resets between different story implementations (in-memory only)
  - Test: Diff hash failure falls back to running verification
- **Dependencies**: Implementation changes must be complete

### Testing Strategy

**Test Files to Modify**:
- `src/agents/implementation.test.ts` - Add 5+ unit tests for retry history formatting

**New Tests Needed**:
- `tests/integration/implementation-preflight.test.ts` - 5+ integration tests

**Test Scenarios**:

**Unit tests**:
- `captureCurrentDiffHash()` returns null when git unavailable (already exists)
- Retry history correctly formats 3 attempts with truncation
- Retry history limited to last 3 attempts
- `buildRetryHistorySection()` formats with attempt number, changes, outcome
- `buildRetryPrompt()` includes history section when attempts > 1

**Integration tests**:
- No-change detection skips verification on attempt 2+ (moves existing test verification)
- Verification runs on attempt 1 even without previous hash
- Retry history included in prompt text on attempt 2+
- History is in-memory only (resets per function call, not persisted)
- Pre-flight check completes in < 1 second (no performance regression)

### Additional Context

#### Relevant Patterns

1. **Git operations pattern** (`implementation.ts:1226-1249`):
   \`\`\`typescript
   const result = spawnSync('git', ['diff', 'HEAD'], {
     cwd: workingDir,
     shell: false,
     encoding: 'utf-8',
     stdio: ['ignore', 'pipe', 'pipe'],
   });
   return createHash('sha256').update(result.stdout as string).digest('hex');
   \`\`\`

2. **Retry prompt pattern** (`implementation.ts:1357-1456`):
   - Detects missing dependencies
   - Classifies TypeScript errors
   - Provides targeted guidance based on failure type
   - Should follow this pattern for retry history section

3. **Test mocking pattern** (`tests/integration/implementation-retry.test.ts:48-54`):
   \`\`\`typescript
   mockSpawnSync.mockImplementation((cmd: string, args?: string[]) => {
     if (cmd === 'git' && args?.[0] === 'diff') {
       diffCallCount++;
       return { status: 0, stdout: `diff-${diffCallCount}`, ...};
     }
   });
   \`\`\`

#### Potential Risks

1. **Pre-flight check timing**: Moving diff capture before verification changes the control flow - must ensure error handling still works correctly
2. **Empty diff hash handling**: If git fails, must fall back to always running verification (fail-safe behavior already implemented)
3. **Retry history prompt bloat**: Limiting to 3 attempts prevents excessive prompt size (requirement specifies this)
4. **Test isolation**: Retry history is in-memory per function call - tests must verify this doesn't leak between stories

#### Performance Considerations

- **Diff hash computation**: Current implementation uses `spawnSync` (blocking) - already fast (~100ms)
- **Verification skip**: Saves ~30 seconds per no-op iteration (primary benefit)
- **Acceptance criteria**: Diff hash must complete in < 1 second - current implementation already meets this

#### Security Implications

- **Path validation**: `validateWorkingDir()` already prevents command injection via path traversal
- **Shell safety**: All git commands use `shell: false` with argument arrays (no injection risk)
- **Output sanitization**: `sanitizeTestOutput()` already removes ANSI codes from test output included in prompts

### Open Questions (Resolved by Story)

✅ **Storage**: In-memory during execution (not persisted) - confirmed by requirements  
✅ **History limit**: 3 attempts - specified in acceptance criteria  
✅ **Change tracking**: Summary of filenames, not full diffs - specified in requirements  
✅ **Pre-flight timing**: Before verification runs - acceptance criteria confirms this

---

**Implementation Strategy**:

1. **Phase 1**: Update `AttemptHistoryEntry` interface with new fields
2. **Phase 2**: Implement `buildRetryHistorySection()` function
3. **Phase 3**: Move diff hash capture before verification call
4. **Phase 4**: Integrate history section into `buildRetryPrompt()`
5. **Phase 5**: Write unit tests for formatting logic
6. **Phase 6**: Write integration tests for pre-flight flow
7. **Phase 7**: Run `make verify` to ensure all tests pass

**Critical observation**: Much of the requested functionality already exists! The main work is:
- Moving the diff check earlier (before verification)
- Formatting retry history for the prompt
- Adding explicit instruction text to guide different approaches

## Implementation Plan

<!-- Populated by planning agent -->

# Implementation Plan: Add Pre-Flight Checks to Implementation Loop

## Overview

This implementation enhances the existing retry logic in the implementation agent by:
1. Moving the diff hash check to run **before** verification (saving ~30 seconds per no-op iteration)
2. Adding retry history to agent prompts to prevent repeated failed approaches

**Key Discovery**: Much of the requested functionality already exists! The main work involves restructuring existing code and adding prompt enhancements.

---

## Phase 1: Enhance Retry History Data Structure

### Tasks

- [ ] **T1**: Extend `AttemptHistoryEntry` interface with new fields
  - Files: `src/agents/implementation.ts`
  - Dependencies: none
  - Add `changesSummary: string` field
  - Add `outcome: 'failed_tests' | 'failed_build' | 'no_change'` field
  - Keep existing `testFailures` and `buildErrors` fields

- [ ] **T2**: Update attempt history population logic
  - Files: `src/agents/implementation.ts`
  - Dependencies: T1
  - Modify lines ~880-920 where `attemptHistory` is populated
  - Extract changed file names from git diff for `changesSummary`
  - Determine `outcome` based on verification result
  - Format: `"Modified src/foo.ts, src/bar.ts"` or `"No changes detected"`

---

## Phase 2: Implement Retry History Formatting

### Tasks

- [ ] **T3**: Create `extractChangedFiles()` helper function
  - Files: `src/agents/implementation.ts`
  - Dependencies: none
  - Parse `git diff HEAD --name-only` output
  - Return comma-separated list of changed files
  - Handle empty diffs (return `"No changes detected"`)
  - Handle git errors gracefully (return `"Unable to determine changes"`)

- [ ] **T4**: Create `buildRetryHistorySection()` function
  - Files: `src/agents/implementation.ts`
  - Dependencies: T1
  - Accept `attemptHistory: AttemptHistoryEntry[]` parameter
  - Limit to last 3 attempts
  - Format each attempt: `"Attempt N: <changes> -> <outcome>"`
  - Include first 2 errors from `testFailures` or `buildErrors`
  - Add instruction: `"Do NOT repeat the same fixes. Try a different approach."`
  - Return formatted string for inclusion in prompt

---

## Phase 3: Move Pre-Flight Check Before Verification

### Tasks

- [ ] **T5**: Refactor diff hash capture timing
  - Files: `src/agents/implementation.ts`
  - Dependencies: none
  - Move `captureCurrentDiffHash()` call from line ~836 to BEFORE verification call (~line 807)
  - Move `hasChangesOccurred()` check to immediately after hash capture
  - If no changes detected on attempt 2+, return early with error:
    - `success: false`
    - `error: "No progress detected - agent made no file changes"`
    - `changesMade: false`
  - Skip verification entirely when no changes detected
  - Update `lastDiffHash` for next iteration before returning

- [ ] **T6**: Preserve fail-safe behavior
  - Files: `src/agents/implementation.ts`
  - Dependencies: T5
  - If `captureCurrentDiffHash()` returns `null` (git failure), proceed with verification
  - Log warning when diff hash computation fails
  - Ensure verification always runs on attempt 1 (no previous hash to compare)

---

## Phase 4: Integrate Retry History into Agent Prompts

### Tasks

- [ ] **T7**: Update `buildRetryPrompt()` function signature
  - Files: `src/agents/implementation.ts`
  - Dependencies: T4
  - Add `attemptHistory: AttemptHistoryEntry[]` parameter
  - Update function call sites to pass `attemptHistory`

- [ ] **T8**: Include retry history in retry prompts
  - Files: `src/agents/implementation.ts`
  - Dependencies: T4, T7
  - In `buildRetryPrompt()` (lines ~1357-1456), add call to `buildRetryHistorySection()`
  - Insert history section after existing error analysis
  - Only include if `attemptHistory.length > 0`
  - Format for readability with clear section heading

---

## Phase 5: Unit Tests

### Tasks

- [ ] **T9**: Write unit tests for `extractChangedFiles()`
  - Files: `src/agents/implementation.test.ts`
  - Dependencies: T3
  - Test: Returns comma-separated list for multiple files
  - Test: Returns single filename for one changed file
  - Test: Returns "No changes detected" for empty diff
  - Test: Handles git errors gracefully

- [ ] **T10**: Write unit tests for `buildRetryHistorySection()`
  - Files: `src/agents/implementation.test.ts`
  - Dependencies: T4
  - Test: Formats single attempt correctly
  - Test: Formats multiple attempts with truncation to 2 errors each
  - Test: Limits history to last 3 attempts when more exist
  - Test: Returns empty string when no history provided
  - Test: Includes "Do NOT repeat" instruction text

- [ ] **T11**: Write unit tests for `buildRetryPrompt()` with history
  - Files: `src/agents/implementation.test.ts`
  - Dependencies: T8
  - Test: Includes retry history section when attempts > 0
  - Test: Omits retry history section when attempts = 0
  - Test: History appears after error analysis in prompt text

- [ ] **T12**: Write unit tests for pre-flight check logic
  - Files: `src/agents/implementation.test.ts`
  - Dependencies: T5
  - Test: Verification skipped when hash unchanged on attempt 2+
  - Test: Returns error message when no changes detected
  - Test: Sets `changesMade: false` in result
  - Test: Verification runs on attempt 1 (no previous hash)
  - Test: Verification runs when hash changes between attempts

---

## Phase 6: Integration Tests

### Tasks

- [ ] **T13**: Create integration test file
  - Files: `tests/integration/implementation-preflight.test.ts`
  - Dependencies: none
  - Set up test structure with mocked git/spawn
  - Import necessary test utilities from existing integration tests
  - Mock `spawnSync` for git operations

- [ ] **T14**: Write integration test for no-change detection flow
  - Files: `tests/integration/implementation-preflight.test.ts`
  - Dependencies: T5, T13
  - Test: Full flow from agent completion → diff check → early exit
  - Mock git diff to return identical hashes on attempts 2+
  - Verify verification never called on attempt 2
  - Verify error message matches expected format

- [ ] **T15**: Write integration test for retry history in prompts
  - Files: `tests/integration/implementation-preflight.test.ts`
  - Dependencies: T8, T13
  - Test: Retry attempt includes formatted history in agent prompt
  - Mock failed verification on attempt 1
  - Verify attempt 2 prompt contains history section
  - Verify history shows attempt 1 outcome

- [ ] **T16**: Write integration test for history reset between stories
  - Files: `tests/integration/implementation-preflight.test.ts`
  - Dependencies: T8, T13
  - Test: History array is in-memory only (scoped to function call)
  - Call `attemptImplementationWithRetries()` twice for different stories
  - Verify second call doesn't see first call's history

- [ ] **T17**: Write integration test for performance requirement
  - Files: `tests/integration/implementation-preflight.test.ts`
  - Dependencies: T5, T13
  - Test: Pre-flight check completes in < 1 second
  - Measure time from diff capture to early exit decision
  - Assert elapsed time < 1000ms

---

## Phase 7: Verification & Cleanup

### Tasks

- [ ] **T18**: Run unit tests
  - Files: N/A
  - Dependencies: T9-T12
  - Execute: `npm test src/agents/implementation.test.ts`
  - Verify all new unit tests pass
  - Fix any failing tests before proceeding

- [ ] **T19**: Run integration tests
  - Files: N/A
  - Dependencies: T14-T17
  - Execute: `npm test tests/integration/implementation-preflight.test.ts`
  - Verify all new integration tests pass
  - Fix any failing tests before proceeding

- [ ] **T20**: Run full test suite
  - Files: N/A
  - Dependencies: T18, T19
  - Execute: `npm test`
  - Verify 0 test failures across entire codebase
  - Ensure no regressions in existing tests

- [ ] **T21**: Verify TypeScript compilation
  - Files: N/A
  - Dependencies: T1-T8
  - Execute: `npm run build`
  - Verify build succeeds with no type errors
  - Check that new interfaces are properly typed

- [ ] **T22**: Run make verify
  - Files: N/A
  - Dependencies: T20, T21
  - Execute: `make verify`
  - Ensure all checks pass (lint, format, tests, build)
  - Fix any issues before marking complete

- [ ] **T23**: Code review and cleanup
  - Files: All modified files
  - Dependencies: T22
  - Remove any debug logging added during development
  - Verify no temporary files created
  - Check that all changed files follow project conventions
  - Ensure commit includes only necessary changes

---

## Success Criteria

Implementation is complete when:

✅ Pre-flight diff check runs BEFORE verification (saves ~30s per no-op)  
✅ Retry history tracked with `changesSummary` and `outcome` fields  
✅ Retry history formatted and included in agent prompts on attempts 2+  
✅ History limited to last 3 attempts  
✅ "Do NOT repeat" instruction included in retry prompts  
✅ All unit tests pass (5+ new tests)  
✅ All integration tests pass (5+ new tests)  
✅ `npm test` passes with 0 failures  
✅ `npm run build` succeeds  
✅ `make verify` passes  
✅ No temporary files or scripts created  

---

## Notes

- **Existing functionality**: ~60% of requested features already exist in the codebase
- **Main work**: Restructuring control flow and enhancing prompts
- **Performance impact**: Pre-flight check should add minimal overhead (<100ms) while saving ~30s on no-op iterations
- **Fail-safe behavior**: All git operations have error handling to prevent blocking the implementation loop

## Review Notes

<!-- Populated by review agents -->

---

**Effort:** medium  
**Labels:** performance, implementation-agent, retry-logic, optimization


### Implementation Notes (2026-01-19)

I need to read the files to begin implementation. Let me wait for permission to access these files.
