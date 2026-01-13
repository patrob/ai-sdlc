---
title: Add incremental commits during implementation phase
priority: 1
status: backlog
type: feature
created: '2026-01-13'
labels:
  - implementation
  - git
  - safety
  - workflow
---
# Add incremental commits during implementation phase

## Summary

**As a** developer using ai-sdlc
**I want** the implementation agent to commit changes incrementally as tasks complete
**So that** work is not lost on crashes/timeouts, I can use git bisect for debugging, and I have granular commit history

Currently, the implementation agent makes all changes without any commits. A single monolithic commit only happens in the review phase after all reviews pass. This means 10+ minutes of work can be lost if the process crashes or times out.

## Acceptance Criteria

- [ ] Branch is created before any commits are made (existing behavior - verify preserved)
- [ ] After each TDD cycle completes successfully (RED→GREEN→REFACTOR), changes are committed
- [ ] After each standard implementation task completes, changes are committed IF all tests pass
- [ ] Commit only happens when **all tests pass** (full test suite), not just related tests
- [ ] Commit messages follow format: `feat(<story-slug>): <description>`
- [ ] Review phase handles existing commits gracefully (no duplicate commits)
- [ ] Implementation continues normally if commit fails (log warning, don't block)
- [ ] Existing "Do NOT commit" instruction removed from implementation prompt

## Out of Scope (Future Considerations)

The following are explicitly out of scope but should be kept in mind for modularity:

- **Emergency checkpoint commits**: On graceful shutdown (SIGTERM/SIGINT), commit WIP even if tests don't pass
- **Catastrophic failure recovery**: Save progress on unhandled exceptions
- **Configurable commit strategy**: Let users choose between incremental vs monolithic commits
- **Commit on timeout warning**: If approaching max execution time, checkpoint work

These may be addressed in future stories. The implementation should remain modular to support these patterns later.

## Technical Notes

### Current Behavior (to change)

1. `implementation.ts` line 77: "Do NOT commit changes - that happens in the review phase"
2. `review.ts` lines 898-905: Single commit of all changes after reviews pass

### Proposed Changes

1. **Add commit helper** to `implementation.ts`:
```typescript
async function commitIfAllTestsPass(
  workingDir: string,
  message: string,
  testTimeout: number
): Promise<{ committed: boolean; reason?: string }> {
  // Check for uncommitted changes
  const status = execSync('git status --porcelain', { ... });
  if (!status.trim()) return { committed: false, reason: 'nothing to commit' };

  // Run FULL test suite
  const testResult = await runAllTests(workingDir, testTimeout);
  if (!testResult.passed) {
    return { committed: false, reason: 'tests failed' };
  }

  // Commit
  execSync('git add -A', { ... });
  execSync(`git commit -m "${escapeShellArg(message)}"`, { ... });
  return { committed: true };
}
```

2. **Call commit after TDD cycle** (~line 537):
```typescript
// After REFACTOR phase passes
changesMade.push('REFACTOR: All tests still pass');
const commitResult = await commitIfAllTestsPass(
  workingDir,
  `feat(${storySlug}): ${testDescription}`,
  testTimeout
);
if (commitResult.committed) {
  changesMade.push(`Committed: ${testDescription}`);
}
```

3. **Update review.ts** to handle pre-existing commits:
```typescript
// Only commit if there are uncommitted changes (already handles this)
const status = execSync('git status --porcelain', { ... });
if (status.trim()) {
  // Commit remaining changes
}
```

4. **Remove line 77** instruction from `IMPLEMENTATION_SYSTEM_PROMPT`

### Modularity Considerations

Keep the commit logic as a separate, injectable helper:
- `commitIfAllTestsPass()` - current story
- Future: `commitWIP()` - for emergency checkpoints
- Future: `commitStrategy` config option

This allows future stories to add emergency/WIP commits without refactoring.

## Definition of Done

- [ ] Implementation agent commits after each successful TDD cycle
- [ ] Implementation agent commits after each task when all tests pass
- [ ] All 498+ existing tests still pass
- [ ] New tests cover: commit on success, skip on test failure, skip on nothing to commit
- [ ] Manual verification: run a story, verify multiple commits appear on branch
- [ ] Review phase still works correctly with pre-committed changes

## References

- Investigation: Tech lead analysis of commit workflow gap
- Files: `src/agents/implementation.ts`, `src/agents/review.ts`
- Related: Rework agent may also benefit from this pattern (future story)
