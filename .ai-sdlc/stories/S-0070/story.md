---
id: S-0070
title: "Fix silent failure when ReviewDecision.RECOVERY is not handled in commands.ts"
priority: 1
status: backlog
type: bug
created: '2026-01-18'
labels:
  - bug
  - p0-critical
  - workflow
  - silent-failure
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Fix silent failure when ReviewDecision.RECOVERY is not handled in commands.ts

## User Story

**As a** developer using ai-sdlc to implement stories,
**I want** the `ai-sdlc run` command to properly handle implementation recovery,
**So that** documentation-only implementations are retried instead of silently failing with misleading success messages.

## Problem Statement

When running `ai-sdlc run`, if the implementation phase produces documentation only (no source code changes), the review agent correctly detects this and returns `ReviewDecision.RECOVERY` to trigger a retry. However, **`commands.ts` does not handle the RECOVERY decision**, causing the workflow to:

1. Treat the recovery decision as success
2. Continue past the review phase without retrying implementation
3. Finish with `reviews_complete: false`
4. Display misleading message: "All phases executed but reviews_complete is false"

This bug affects ALL story executions that trigger implementation recovery. Observed on 5 parallel runs (S-0053, S-0060, S-0009, S-0057, S-0062) with 100% reproduction rate.

## Root Cause

```typescript
// src/cli/commands.ts:1131-1198
// Only handles REJECTED, NOT RECOVERY
if (reviewResult.decision === ReviewDecision.REJECTED) {
  // ... retry loop logic exists
}
// No handling for ReviewDecision.RECOVERY
// No handling for ReviewDecision.FAILED

// Meanwhile in src/cli/runner.ts:290-308 (unused by ai-sdlc run)
} else if (reviewResult.decision === ReviewDecision.RECOVERY) {
  // Proper handling exists here but isn't reached
}
```

**Architectural debt**: Two separate orchestration implementations (`commands.ts` vs `runner.ts`) with divergent behavior.

## Acceptance Criteria

### Core Fix

- [ ] Add `ReviewDecision.RECOVERY` handling to `commands.ts` (around line 1198)
  - [ ] Display clear warning: "Implementation recovery triggered (attempt X)"
  - [ ] Display reason from `last_restart_reason`
  - [ ] Increment `implementation_retry_count` using existing helper
  - [ ] Regenerate actions via `generateFullSDLCActions()` (implementation will be included since `implementation_complete` is now false)
  - [ ] Use `continue` to restart the action loop from the new implementation phase

- [ ] Add `ReviewDecision.FAILED` handling to `commands.ts`
  - [ ] Display error message with reason
  - [ ] Exit without incrementing retry count
  - [ ] Return early (don't continue to next phase)

### Behavioral Requirements

- [ ] When RECOVERY is triggered, `reviews_complete` must remain `false`
- [ ] When RECOVERY is triggered, workflow must loop back to implementation phase
- [ ] When max implementation retries are reached, story should be marked as `blocked`
- [ ] Success messages should ONLY appear when `reviews_complete: true`

### Testing

- [ ] Add unit test: RECOVERY decision triggers action regeneration
- [ ] Add unit test: FAILED decision stops workflow
- [ ] Add integration test: Full SDLC flow with RECOVERY handles retry correctly
- [ ] Add integration test: Parallel story execution with some RECOVERY outcomes

### Non-functional

- [ ] Exit code should be non-zero when workflow fails
- [ ] Console output should clearly distinguish success from recovery/failure

## Technical Notes

### Location of Change

`src/cli/commands.ts`, inside the action loop, after the existing REJECTED handling block (line ~1198).

### Proposed Implementation

```typescript
// After the existing REJECTED block (line 1198), add:

} else if (reviewResult.decision === ReviewDecision.RECOVERY) {
  // Implementation recovery: loop back to re-run implementation
  const story = parseStory(action.storyPath);
  const retryCount = story.frontmatter.implementation_retry_count || 0;
  const maxRetries = getEffectiveMaxImplementationRetries(story, config);
  const maxRetriesDisplay = Number.isFinite(maxRetries) ? maxRetries : '∞';

  console.log();
  console.log(c.warning(`Implementation recovery triggered (attempt ${retryCount + 1}/${maxRetriesDisplay})`));
  console.log(c.dim(`  Reason: ${story.frontmatter.last_restart_reason || 'No source code changes detected'}`));

  // Increment implementation retry count
  await incrementImplementationRetryCount(story);

  // Regenerate actions - will include implement since implementation_complete is false
  const freshStory = parseStory(action.storyPath);
  const newActions = generateFullSDLCActions(freshStory, c);

  if (newActions.length > 0) {
    currentActions = newActions;
    currentActionIndex = 0;
    console.log(c.info(`  → Restarting from ${newActions[0].type} phase`));
    console.log();
    continue;
  } else {
    console.log(c.error('Error: No actions generated for recovery. Manual intervention required.'));
    return;
  }
} else if (reviewResult.decision === ReviewDecision.FAILED) {
  // Review agent failed - don't continue
  console.log(c.error(`\n Review process failed: ${reviewResult.error || 'Unknown error'}`));
  console.log(c.warning('This does not count as a retry attempt. You can retry manually.'));
  return;
}
```

### Dependencies

Uses existing functions:
- `incrementImplementationRetryCount()` from `src/agents/review.ts`
- `getEffectiveMaxImplementationRetries()` from `src/agents/review.ts`
- `generateFullSDLCActions()` from `src/cli/commands.ts`

### Follow-up Stories (Out of Scope)

1. Consolidate `runner.ts` and `commands.ts` orchestration logic into shared module
2. Convert `if` chains to `switch` statements for exhaustive enum handling
3. Audit other ReviewDecision paths for consistency

## Out of Scope

- Refactoring the code duplication between `runner.ts` and `commands.ts` (separate story)
- Changing the review agent's RECOVERY detection logic (working correctly)
- Modifying how `success: true` is returned for RECOVERY decisions

## Verification Steps

1. Create a test story that will trigger documentation-only detection
2. Run `ai-sdlc run --story <id>`
3. Verify workflow loops back to implementation phase
4. Verify `implementation_retry_count` increments
5. Verify final status shows either success or blocked (not ambiguous warning)
6. Run 5 parallel executions and verify no silent failures
