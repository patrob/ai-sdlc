---
id: S-0050
title: Pre-review code change gate with self-healing recovery
priority: 2
status: ready
type: feature
created: '2026-01-16'
labels:
  - review
  - self-healing
  - p0-mvp
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Pre-review code change gate with self-healing recovery

## User Story

**As a** developer using ai-sdlc,
**I want** the review phase to detect when no source code was modified and automatically trigger a recovery cycle,
**So that** documentation-only "implementations" are caught early and self-heal without manual intervention.

## Problem Statement

Currently, when an implementation agent writes only documentation/planning instead of actual code:
1. The review phase runs 3 parallel LLM reviews (code, security, PO)
2. All 3 reviews flag the same fundamental problem from different angles
3. This generates 45+ redundant issues that are overwhelming and confusing
4. The agent doesn't know where to start fixing

We observed this with S-0012 where the agent wrote 500 lines of research/planning, set `implementation_complete: true`, but modified zero source files.

## Summary

Add a pre-review gate that checks for actual source code changes before running LLM reviews. If no code changes are detected:

1. **Recoverable case**: Trigger a new implementation cycle to actually write the code
2. **Non-recoverable case**: Fail with clear blocker requiring user intervention

This converts 45 confusing issues into either automatic recovery or 1 clear actionable blocker.

## Acceptance Criteria

- [ ] Before running LLM reviews, check `git diff` for source file changes (`.ts`, `.js`, `.tsx`, `.jsx`)
- [ ] Exclude test files from the "must have changes" check (tests alone aren't implementation)
- [ ] Exclude story files (`.ai-sdlc/stories/`) from the check
- [ ] If no source changes detected AND retry count < max_retries:
  - [ ] Log clear message: "No source code changes detected. Triggering implementation recovery."
  - [ ] Set `implementation_complete: false`
  - [ ] Return action to re-run implementation phase (self-heal)
- [ ] If no source changes detected AND retry count >= max_retries:
  - [ ] Return single BLOCKER issue: "Implementation wrote documentation only. Manual intervention required."
  - [ ] Do NOT run the 3 LLM reviews (save tokens)
- [ ] If source changes ARE detected, proceed with normal review flow
- [ ] Add metric/log for "recovered from documentation-only implementation"

## Technical Notes

### Implementation Location

Modify `src/agents/review.ts` in the `runReviewAgent()` function, before the LLM review calls.

### Proposed Logic

```typescript
// In runReviewAgent(), after validation but before LLM reviews:

// Check for actual source code changes
const sourceChanges = getSourceCodeChanges(workingDir);

if (sourceChanges.length === 0) {
  const retryCount = story.frontmatter.implementation_retry_count || 0;
  const maxRetries = getEffectiveMaxRetries(story, config);

  if (retryCount < maxRetries) {
    // RECOVERABLE: Trigger implementation recovery
    logger.warn('review', 'No source code changes detected - triggering implementation recovery', {
      storyId: story.frontmatter.id,
      retryCount,
    });

    await updateStoryField(story, 'implementation_complete', false);
    await updateStoryField(story, 'last_restart_reason', 'No source code changes detected. Implementation wrote documentation only.');

    return {
      success: true,
      story: parseStory(storyPath),
      changesMade: ['Detected documentation-only implementation', 'Triggered implementation recovery'],
      passed: false,
      decision: ReviewDecision.RECOVERY,  // New decision type
      reviewType: 'pre-check',
      issues: [{
        severity: 'critical',
        category: 'implementation',
        description: 'No source code modifications detected. Re-running implementation phase.',
      }],
      feedback: 'Implementation recovery triggered - no source changes found.',
      needsImplementationRetry: true,  // Signal to runner
    };
  } else {
    // NON-RECOVERABLE: Max retries reached
    return {
      success: true,
      story: parseStory(storyPath),
      changesMade: ['Detected documentation-only implementation', 'Max retries reached'],
      passed: false,
      decision: ReviewDecision.FAILED,
      severity: ReviewSeverity.CRITICAL,
      reviewType: 'pre-check',
      issues: [{
        severity: 'blocker',
        category: 'implementation',
        description: 'Implementation phase wrote documentation/planning only - no source code was modified. This has occurred multiple times. Manual intervention required.',
        suggestedFix: 'Review the story requirements and implementation plan. The agent may be confused about what needs to be built. Consider simplifying the story or providing more explicit guidance.',
      }],
      feedback: 'Implementation failed to produce code changes after multiple attempts.',
    };
  }
}

// Source changes exist - proceed with normal review flow
```

### Helper Function

```typescript
function getSourceCodeChanges(workingDir: string): string[] {
  try {
    const diff = execSync('git diff --name-only HEAD~1', {
      cwd: workingDir,
      encoding: 'utf-8'
    });

    return diff
      .split('\n')
      .filter(f => f.trim())
      .filter(f => /\.(ts|tsx|js|jsx)$/.test(f))      // Source files only
      .filter(f => !f.includes('.test.'))              // Exclude test files
      .filter(f => !f.includes('.spec.'))              // Exclude spec files
      .filter(f => !f.startsWith('.ai-sdlc/'));        // Exclude story files
  } catch {
    // If git diff fails, assume there are changes (don't block on git errors)
    return ['unknown'];
  }
}
```

### New ReviewDecision Type

Add `RECOVERY` to the `ReviewDecision` enum in `src/types/index.ts`:

```typescript
export enum ReviewDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
  RECOVERY = 'RECOVERY',  // New: triggers implementation retry
}
```

### Runner Integration

The runner (`src/cli/runner.ts`) needs to handle the `RECOVERY` decision by re-queuing the implementation action instead of proceeding to rework.

## Out of Scope

- Detecting quality of code changes (just existence)
- Validating test coverage
- Checking if the right files were modified

## Definition of Done

- [ ] Pre-review gate implemented in `runReviewAgent()`
- [ ] `getSourceCodeChanges()` helper function with tests
- [ ] `ReviewDecision.RECOVERY` enum value added
- [ ] Runner handles RECOVERY decision correctly
- [ ] Unit tests for gate logic (no changes, recoverable, non-recoverable)
- [ ] Integration test showing recovery flow
- [ ] All existing tests pass
- [ ] Manual verification: documentation-only impl triggers recovery

## Why This Matters

**Before**: 45 confusing issues, wasted LLM tokens, developer confusion
**After**: Automatic recovery OR 1 clear blocker, zero wasted tokens

---

**Effort:** medium
**Risk:** low - additive change, doesn't break existing flow
