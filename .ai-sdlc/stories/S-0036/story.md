---
id: S-0036
title: Pre-Flight Conflict Warning
priority: 3
status: backlog
type: feature
created: '2026-01-15'
labels:
  - concurrent-workflows
  - phase-2
  - ux
epic: concurrent-workflows
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: pre-flight-conflict-warning
---
# Pre-Flight Conflict Warning

## User Story

**As a** developer using ai-sdlc,
**I want** to be warned about potential conflicts before starting a story,
**So that** I can decide whether to proceed or wait for other stories to complete.

## Summary

When a user starts a story with `--worktree` while other stories are active, the system should check for potential conflicts and warn the user. This enables informed decision-making about concurrent execution.

## Context

This is the second story in **Phase 2: Concurrent Execution MVP** of the Concurrent Workflows epic.

**Depends on:** S-0035 (Conflict Detection Service)
**Blocks:** Phase 3 stories

**Reference:** `docs/ROADMAP_TO_CONCURRENT_WORK.md` (Section 5, Phase 2)

## Acceptance Criteria

- [ ] `run --worktree` checks for active stories before starting
- [ ] Conflict detection runs against all in-progress stories
- [ ] Warning displayed with conflict details and severity
- [ ] User prompted to confirm when conflicts detected (unless `--force`)
- [ ] `--force` flag bypasses conflict warning
- [ ] Clear messaging about which files may conflict
- [ ] Exit gracefully if user declines to proceed
- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)

## Technical Notes

### User Experience

```bash
# No conflicts
$ ai-sdlc run --worktree S-0002
✓ Conflict check: No overlapping files with active stories
✓ Starting in worktree: .ai-sdlc/worktrees/S-0002-feature-b/
[Agent output...]

# Conflicts detected
$ ai-sdlc run --worktree S-0002
⚠️  Potential conflicts detected:

   S-0002 may conflict with S-0001:
   - High: src/api/user.ts (modified by both)
   - Medium: src/api/ (same directory)

   Recommendation: Run sequentially to avoid merge conflicts.

   Continue anyway? [y/N] _

# Force flag
$ ai-sdlc run --worktree S-0002 --force
⚠️  Skipping conflict check (--force)
✓ Starting in worktree: .ai-sdlc/worktrees/S-0002-feature-b/
```

### Implementation Approach

```typescript
async function preFlightConflictCheck(
  storyId: string,
  options: { force?: boolean }
): Promise<{ proceed: boolean; warnings: string[] }> {
  if (options.force) {
    return { proceed: true, warnings: ['Skipping conflict check (--force)'] };
  }

  // Find active stories (in-progress status)
  const activeStories = await getStoriesByStatus('in-progress');

  if (activeStories.length === 0) {
    return { proceed: true, warnings: [] };
  }

  // Get the story we're about to run
  const targetStory = await getStoryById(storyId);
  const allStories = [...activeStories, targetStory];

  // Run conflict detection
  const result = await detectConflicts(allStories);

  if (result.safeToRunConcurrently) {
    console.log('✓ Conflict check: No overlapping files with active stories');
    return { proceed: true, warnings: [] };
  }

  // Display conflicts and prompt
  displayConflictWarning(result);

  const proceed = await promptUser('Continue anyway? [y/N]');
  return { proceed, warnings: result.conflicts.map(c => c.recommendation) };
}
```

### Integration Point

```typescript
// In run command handler
async function runCommand(storyId: string, options: RunOptions) {
  if (options.worktree) {
    const { proceed, warnings } = await preFlightConflictCheck(storyId, options);

    if (!proceed) {
      console.log('Aborting. Complete active stories first or use --force.');
      process.exit(0);
    }

    warnings.forEach(w => console.warn(`⚠️  ${w}`));
  }

  // Continue with normal execution...
}
```

### Files to Modify

- `src/cli/commands.ts` - Add pre-flight check to run command
- `src/index.ts` - Add `--force` flag to run command
- `src/cli/prompts.ts` - Add conflict confirmation prompt (or create if needed)

## Edge Cases

1. **No active stories**: Skip conflict check, proceed immediately
2. **Same story already running**: Error with clear message
3. **User declines**: Exit gracefully with helpful message
4. **Non-interactive terminal**: Default to declining (require --force)
5. **Conflict check fails**: Warn but allow proceeding

## Definition of Done

- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Manual test: Conflict warning appears for overlapping stories
- [ ] Manual test: --force bypasses warning
- [ ] Non-interactive fallback works correctly

---

**Effort:** small
**Dependencies:** S-0035
**Blocks:** Phase 3 stories
