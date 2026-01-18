---
id: S-0058
title: Auto-complete after review approval missing PR creation and final commit
priority: 1
status: backlog
type: bug
created: '2026-01-17'
labels:
  - p0-critical
  - workflow
  - auto-complete
  - regression
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: auto-complete-missing-pr-creation
---
# Auto-complete after review approval missing PR creation and final commit

## User Story

**As a** developer using ai-sdlc in automated mode
**I want** stories that pass review to have their PRs created automatically
**So that** completed work doesn't get stranded in local worktrees without being submitted for merge

## Summary

When a story is reviewed and APPROVED with `autoCompleteOnApproval` enabled (from S-0052), the workflow marks the story as "done" but fails to:

1. Commit the final story changes (review notes added to `story.md`)
2. Push the branch to remote
3. Create a PR

This results in completed work being stranded in local worktrees with no visibility to the team.

## Bug Evidence

**Discovered in S-0056** (Build-before-test enforcement):

| Expected | Actual |
|----------|--------|
| Review notes committed | Uncommitted changes in worktree |
| Branch pushed to remote | Branch only exists locally |
| PR created | No PR created |
| Story truly "done" | Story marked done but code orphaned |

**Timeline from logs:**
```
23:47:37 - Implementation completed + committed
23:47:37 - Review started
23:48:34 - Review APPROVED
23:48:34 - Story "auto-completed" (marks status: done)
         - handleWorktreeCleanup returns early (non-interactive)
         - Workflow ENDS with no PR
```

## Root Cause Analysis

**Location:** `src/cli/commands.ts:1439-1455`

```typescript
// Auto-complete story if review was approved
if (result && result.success) {
  let story = parseStory(action.storyPath);
  story = await autoCompleteStoryAfterReview(story, config, reviewResult);

  if (reviewResult.decision === ReviewDecision.APPROVED && config.reviewConfig.autoCompleteOnApproval) {
    storyLogger?.log('INFO', `Story auto-completed after review approval`);

    if (story.frontmatter.worktree_path) {
      await handleWorktreeCleanup(story, config, c);  // Returns early in non-interactive
    }
  }
}
break;  // Review action ends - NO create_pr triggered
```

**Problem:** `autoCompleteStoryAfterReview()` marks status as "done" but the workflow flow doesn't continue to `create_pr` action.

**`handleWorktreeCleanup()` behavior** (`src/cli/commands.ts:2290-2293`):
```typescript
if (!process.stdin.isTTY) {
  console.log(c.dim(`  Worktree preserved (non-interactive mode): ${worktreePath}`));
  return;  // Early return - no PR, no push, no commit
}
```

## Acceptance Criteria

### Core Functionality
- [ ] After review APPROVED, final story changes (review notes) are committed
- [ ] Branch is pushed to remote after approval
- [ ] PR is created automatically after approval (if `autoCreatePR` enabled or in auto mode)
- [ ] Workflow state is updated to include `review` in `completedActions`

### Configuration
- [ ] Add `autoCreatePROnApproval` config option (default: true in auto mode)
- [ ] Respect existing `create_pr` stage gate if configured
- [ ] Allow skipping PR creation via config flag

### Edge Cases
- [ ] Handle case where branch already pushed (no error)
- [ ] Handle case where PR already exists (no duplicate)
- [ ] Handle remote push failures gracefully (retry or mark as blocked)
- [ ] Interactive mode still prompts for cleanup as before

### Quality
- [ ] `make verify` passes
- [ ] Unit tests for new auto-PR flow
- [ ] Integration test verifying full approval → PR flow

## Technical Notes

### Proposed Solution

**Option A: Trigger `create_pr` action after approval**
```typescript
// After autoCompleteStoryAfterReview in commands.ts
if (reviewResult.decision === ReviewDecision.APPROVED && config.reviewConfig.autoCompleteOnApproval) {
  // 1. Commit final changes
  await commitFinalChanges(story, workingDir);

  // 2. Push branch
  await pushBranch(story.frontmatter.branch);

  // 3. Create PR
  const { createPullRequest } = await import('../agents/review.js');
  await createPullRequest(action.storyPath, sdlcRoot);
}
```

**Option B: Add post-review action in runner**
```typescript
// In runner.ts handleReviewDecision
if (reviewResult.decision === ReviewDecision.APPROVED) {
  story = await autoCompleteStoryAfterReview(story, config, reviewResult);

  // New: auto-create PR if enabled
  if (config.reviewConfig.autoCreatePROnApproval) {
    await this.executeAction({ type: 'create_pr', storyId: story.frontmatter.id, ... });
  }
}
```

### Files to Modify
- `src/cli/commands.ts` - Add PR creation after approval in review case
- `src/cli/runner.ts` - Update `handleReviewDecision()` to include PR step
- `src/core/config.ts` - Add `autoCreatePROnApproval` config option
- `src/types/index.ts` - Update ReviewConfig type

### Files to Test
- `src/cli/commands.test.ts` - Test auto-PR flow
- `tests/integration/auto-completion-review.test.ts` - Update existing tests
- New integration test for full approval → PR → cleanup flow

## Out of Scope

- Auto-merge after PR creation (separate feature)
- Slack/Discord notifications on PR creation
- Multiple reviewer approval requirements
- PR template customization

## Definition of Done

- [ ] Review approval triggers final commit + push + PR creation
- [ ] Works in both `--auto` mode and non-interactive CI/CD
- [ ] Unit tests cover new functionality
- [ ] Integration test verifies full flow
- [ ] `make verify` passes
- [ ] Manual verification: run `ai-sdlc run --auto --story <id>` through review approval, verify PR created

## Related

- **S-0052**: Auto-mark stories as done after review approval (introduced the bug)
- **S-0056**: First story affected by this bug (used for investigation)

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
