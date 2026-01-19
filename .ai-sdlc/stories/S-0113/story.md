---
id: S-0113
title: getSourceCodeChanges compares HEAD~1 instead of base branch causing infinite recovery loops
priority: 2
status: backlog
type: bug
created: '2026-01-19'
labels:
  - critical
  - review-agent
  - infinite-loop
dependencies: []
---
# getSourceCodeChanges compares HEAD~1 instead of base branch causing infinite recovery loops

## User Story

As a **developer using ai-sdlc**, I want **the review agent to correctly detect source code changes across the entire branch**, so that **the implementation phase doesn't get stuck in infinite RECOVERY loops**.

## Problem Statement

The `getSourceCodeChanges()` function in `src/agents/review.ts` uses `git diff --name-only HEAD~1` to detect source code changes. This is incorrect because:

1. If implementation commits code in commit N, then commits only story metadata in commit N+1, the diff between HEAD and HEAD~1 only shows metadata changes
2. The review agent sees "no source code changes" and returns `ReviewDecision.RECOVERY`
3. This triggers implementation to run again, which commits more metadata
4. The loop continues indefinitely

**Observed behavior (S-0110):** 166 implement iterations ran before manual intervention, despite the actual code fix being committed in the branch history.

## Technical Context

**Location:** `src/agents/review.ts:730`

```typescript
// Current (incorrect) implementation
const result = spawnSync('git', ['diff', '--name-only', 'HEAD~1'], {
  cwd: workingDir,
  // ...
});
```

**Expected:** Should compare against the base branch (e.g., `main` or `origin/main`) to see ALL changes in the feature branch, not just the last commit.

## Root Cause Analysis

The `HEAD~1` comparison was likely chosen for simplicity, but it doesn't account for:
- Multi-commit feature branches
- Story metadata commits that happen between code commits
- The iterative nature of the SDLC workflow where multiple commits are made

## Acceptance Criteria

- [ ] `getSourceCodeChanges()` compares the current branch to the base branch (main/origin/main)
- [ ] Source code changes are detected even if the last commit only contains metadata
- [ ] The fix works in both worktree and main repo contexts
- [ ] Unit tests verify the correct git command is used
- [ ] Integration test confirms no infinite RECOVERY loop when code is committed early in the branch

## Proposed Solution

```typescript
// Proposed fix - compare to base branch
function getSourceCodeChanges(workingDir: string): string[] {
  // Determine the base branch (could be configurable)
  const baseBranch = 'main'; // or detect from git config

  const result = spawnSync('git', ['diff', '--name-only', baseBranch], {
    cwd: workingDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // ... rest of implementation
}
```

## Test Plan

1. Create a feature branch from main
2. Commit a code change (e.g., add a test)
3. Commit a metadata-only change (e.g., update story.md)
4. Run review agent
5. Verify it detects the code change from step 2, not just the metadata from step 3

## Notes

- This bug was discovered during S-0110 investigation
- The workaround is to manually squash commits or ensure the last commit contains code
- Priority is HIGH because this can cause runaway costs from infinite agent loops
