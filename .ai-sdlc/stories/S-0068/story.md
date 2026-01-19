---
id: S-0068
title: Resume After User Resolution
priority: 18
status: backlog
type: feature
created: '2026-01-18'
labels:
  - automation
  - resume
  - ux
  - epic-backlog-processor
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: resume-after-user-resolution
dependencies:
  - S-0065
  - S-0067
---
# Resume After User Resolution

## User Story

**As a** developer who resolved a blocking condition
**I want** to resume batch processing from where it stopped
**So that** I don't have to restart from the beginning or manually track progress

## Summary

After the user resolves a blocking condition (updates requirements, fixes code, gets approval), they need a way to resume batch processing. This story implements the resume capability that:
1. Detects the last processing state
2. Validates the blocking condition is resolved
3. Resumes processing from the blocked story (not from the beginning)

## Technical Context

**State Recovery:**
- Read from `.ai-sdlc/.backlog-processor-state.json`
- Check blocked stories in `.ai-sdlc/blocked-queue.json`
- Validate story status has changed from 'blocked'

**Resume Logic:**
1. Load processor state
2. Find first blocked story
3. Check if it's still blocked (status in frontmatter)
4. If unblocked, resume processing from that story
5. If still blocked, notify user and exit

## Acceptance Criteria

- [ ] Detect existing processor state from `.ai-sdlc/.backlog-processor-state.json`
- [ ] On resume, check if previously blocked story is still blocked:
  - If `status: blocked` in frontmatter → Notify user, don't resume
  - If status changed → Clear from blocked queue, resume processing
- [ ] Resume from the correct story (not restart from beginning)
- [ ] Display resume context:
  ```
  Resuming batch processing...
  Previously completed: 3 stories
  Previously blocked: S-0042 (now resolved)
  Remaining: 6 stories

  Continuing from: S-0042 - Add user authentication
  ```
- [ ] Support `--skip` flag to skip the blocked story and continue to next:
  ```
  npm run agent process --resume --skip
  ```
- [ ] Update processor state after successful resume
- [ ] Clear resolved stories from blocked queue
- [ ] Handle case where all blocked stories are now resolved
- [ ] Support resuming specific story: `npm run agent process --resume --story S-0042`

## Validation Logic

```typescript
async function canResume(storyId: string): Promise<{
  canResume: boolean;
  reason?: string;
}> {
  const story = await storyService.read(storyId);

  if (story.frontmatter.status === 'blocked') {
    return {
      canResume: false,
      reason: `Story is still blocked: ${story.frontmatter.blocked_reason}`
    };
  }

  return { canResume: true };
}
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/cli/backlog-processor.ts` | Modify | Add resume() method |
| `src/core/blocked-queue.ts` | Create | Manage blocked queue file |
| `tests/unit/resume.test.ts` | Create | Unit tests |
| `tests/integration/resume.test.ts` | Create | Integration tests |

## User Workflow

1. User starts batch processing: `npm run agent process`
2. Story S-0042 gets blocked (requirements unclear)
3. Processor pauses, notifies user
4. User updates S-0042's acceptance criteria in the story file
5. User changes S-0042's status from `blocked` to `ready`
6. User runs: `npm run agent process --resume`
7. Processor validates S-0042 is unblocked
8. Processing continues from S-0042

## Edge Cases

- No processor state exists → "No previous session to resume"
- Processor state is stale (> 24 hours) → Warn but allow resume
- Story was deleted while blocked → Skip it, continue to next
- All stories completed while paused → "All stories already completed"
- Multiple stories blocked → Resume from first blocked, process sequentially
- User manually moved story to 'done' → Respect that, skip it

## Out of Scope

- Automatic unblocking (user must manually update story status)
- Parallel resume of multiple blocked stories
- Undo/rollback of completed stories

## Definition of Done

- [ ] Resume logic implemented in BacklogProcessor
- [ ] Blocked queue management working
- [ ] Validation of unblocked status working
- [ ] --skip flag implemented
- [ ] --story flag for specific story resume
- [ ] Unit and integration tests pass
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual test: block → resolve → resume workflow works
