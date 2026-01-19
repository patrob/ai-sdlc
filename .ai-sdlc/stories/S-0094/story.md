---
id: S-0094
title: Sequential Batch Processing with --batch flag
priority: 5
status: backlog
type: feature
created: '2026-01-19'
labels:
  - cli
  - automation
  - batch-processing
  - epic-batch-automation
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: sequential-batch-processing
dependencies: []
---
# Sequential Batch Processing with --batch flag

## User Story

**As a** developer using ai-sdlc
**I want** to process multiple stories sequentially with a single command
**So that** I can automate processing an ordered list of stories without manual intervention

## Summary

Add a `--batch` flag to the `run` command that accepts a comma-separated list of story IDs and processes them sequentially in the specified order. Each story completes its full SDLC cycle before the next begins.

## Technical Context

**Current State:**
- `ai-sdlc run --auto --story S-001` processes a single story to completion
- `ai-sdlc run --watch` daemon mode processes whatever is next (not a specific list)
- No way to specify "process these N stories in order"

**Target State:**
- `ai-sdlc run --batch S-001,S-002,S-003` processes stories sequentially
- Each story runs through full SDLC (refine → research → plan → implement → review → PR)
- Clear progress reporting and error handling between stories

## Acceptance Criteria

### CLI Interface

- [ ] Add `--batch <story-ids>` option to `run` command
  - Accepts comma-separated story IDs: `--batch S-001,S-002,S-003`
  - Validates all story IDs exist before starting
  - Validates story ID format matches existing pattern

- [ ] Flag validation:
  - [ ] `--batch` conflicts with `--story` (mutually exclusive)
  - [ ] `--batch` conflicts with `--watch` (mutually exclusive)
  - [ ] `--batch` conflicts with `--continue` (not supported for batch)
  - [ ] `--batch` can combine with `--dry-run`, `--force`, `--worktree`

### Sequential Processing

- [ ] Process stories in the exact order specified
- [ ] Each story completes full SDLC before next story begins
- [ ] Respect `--worktree` flag (create worktree per story if specified)
- [ ] Support `--dry-run` to preview actions for all stories

### Progress Reporting

- [ ] Display batch progress header: `[1/3] Processing: S-001 - Story Title`
- [ ] Show completion summary after each story
- [ ] Final summary shows: total, succeeded, failed, skipped

### Error Handling

- [ ] If a story fails:
  - [ ] In interactive mode: prompt "Continue to next story? [y/N]"
  - [ ] In non-interactive mode (no TTY): abort batch and report
- [ ] Track and report all errors in final summary
- [ ] Return non-zero exit code if any story failed

### Edge Cases

- [ ] Single story in batch works like `--story`
- [ ] Empty batch string shows helpful error
- [ ] Duplicate story IDs are deduplicated (process once)
- [ ] Story already in `done` status is skipped with message

## Files to Modify

| File | Change |
|------|--------|
| `src/index.ts` | Add `--batch` option to run command (~line 86-99) |
| `src/cli/commands.ts` | Add batch validation and processing logic |

## Files to Create

| File | Purpose |
|------|---------|
| `src/cli/batch-processor.ts` | Encapsulate batch processing logic |
| `tests/integration/batch-processing.test.ts` | Integration tests for batch mode |

## Implementation Notes

```typescript
// src/cli/batch-processor.ts
export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{ storyId: string; error: string }>;
}

export async function processBatch(
  storyIds: string[],
  sdlcRoot: string,
  options: { dryRun?: boolean; worktree?: boolean; force?: boolean }
): Promise<BatchResult>
```

## Testing Requirements

- [ ] Unit tests for batch ID parsing and validation
- [ ] Unit tests for duplicate story detection
- [ ] Integration test: 3 stories processed in order
- [ ] Integration test: story 2 fails, user continues (interactive mock)
- [ ] Integration test: `--batch` with `--dry-run`
- [ ] Integration test: flag conflict validation
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Out of Scope

- Parallel processing (covered in S-0095)
- Epic label filtering (covered in S-0095)
- Resumable batch state (can be added later)

## Definition of Done

- [ ] `--batch` flag implemented and documented in help
- [ ] Sequential processing works for 1-10 stories
- [ ] Error handling works in both interactive and non-interactive modes
- [ ] All tests pass
- [ ] `make verify` passes
