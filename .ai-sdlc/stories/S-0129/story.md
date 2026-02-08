---
id: S-0129
title: Add JSON output format to the status command via --json flag
slug: add-json-output-format-to-the-status-command-via-j
priority: 80
status: done
type: feature
created: '2026-02-06'
labels: []
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
content_type: code
worktree_path: >-
  /Users/probinson/Repos/on-par/pocs/ai-sdlc/.ai-sdlc/worktrees/S-0129-add-json-output-format-to-the-status-command-via-j
updated: '2026-02-06'
plan_review_iteration: 1
plan_review_complete: true
branch: ai-sdlc/add-json-output-format-to-the-status-command-via-j
last_test_run:
  passed: true
  failures: 0
  timestamp: '2026-02-06T03:00:36.767Z'
error_history: []
max_retries: 3
review_history:
  - timestamp: '2026-02-06T03:03:30.758Z'
    decision: APPROVED
    feedback: All reviews passed
    blockers: []
    codeReviewPassed: true
    securityReviewPassed: true
    poReviewPassed: true
pr_url: 'https://github.com/patrob/ai-sdlc/pull/37'
implementation_retry_count: 0
---
## Summary

The `ai-sdlc status` command displays a kanban board with columns (Backlog, Ready, In-Progress, Done). Adding a `--json` flag outputs the board data as structured JSON, enabling scripting, CI integration, and programmatic access to board state.

## Acceptance Criteria

- [ ] `ai-sdlc status --json` outputs valid JSON to stdout
- [ ] JSON includes columns with story arrays: `{ backlog: [...], ready: [...], inProgress: [...], done: [...] }`
- [ ] Each story object includes: `id`, `title`, `status`, `priority`, `type`, `created`
- [ ] Column counts are included in the output
- [ ] Existing text board output is unchanged without `--json`
- [ ] Exit code 0 on success


### Implementation Notes (2026-02-06)

Perfect! Let me provide a summary of the implementation:

## Implementation Complete ✅

I have successfully implemented the JSON output format for the `ai-sdlc status` command. Here's what was done:

### Files Modified:

1. **`src/types/index.ts`** - Added TypeScript interfaces:
   - `SerializedStory`: Defines the structure for story objects in JSON output (id, title, status, priority, type, created)
   - `StatusJsonOutput`: Defines the complete JSON output structure with backlog, ready, inProgress, done arrays and counts

2. **`src/index.ts`** - Added CLI flag:
   - Added `--json` option to the status command definition

3. **`src/cli/commands.ts`** - Implemented JSON output logic:
   - Added `serializeStoryForJson()` helper function to extract essential fields from Story objects
   - Updated `status()` function signature to accept `json?: boolean` option
   - Added early-return JSON output logic that:
     - Maps all story arrays using the serialization helper
     - Respects the `--active` flag (excludes done stories when combined)
     - Includes accurate column counts
     - Outputs formatted JSON with 2-space indentation

4. **`tests/integration/status-json-output.test.ts`** - Created comprehensive test suite:
   - Tests valid JSON output with stories in all columns
   - Tests story object field validation
   - Tests empty board scenario
   - Tests that no visual elements appear in JSON mode
   - Tests `--json` + `--active` flag combination
   - Tests edge cases (emojis, long titles, multiple stories)
   - Tests backward compatibility (default behavior unchanged)

### Key Features:

✅ **Valid JSON output** - Uses `JSON.stringify()` with 2-space indentation  
✅ **Correct structure** - Includes `backlog`, `ready`, `inProgress`, `done` arrays with story objects  
✅ **Complete story data** - Each story includes all required fields: id, title, status, priority, type, created  
✅ **Accurate counts** - Includes counts object with totals for each column  
✅ **Flag interaction** - Works correctly with `--active` flag (excludes done stories)  
✅ **Backward compatible** - Existing text board output unchanged without `--json`  
✅ **Early return** - JSON mode skips all visual rendering and recommended actions  
✅ **Type safe** - Full TypeScript typing with proper interfaces  

### Acceptance Criteria Status:

- ✅ `ai-sdlc status --json` outputs valid JSON to stdout
- ✅ JSON includes columns with story arrays: `{ backlog: [...], ready: [...], inProgress: [...], done: [...] }`
- ✅ Each story object includes: `id`, `title`, `status`, `priority`, `type`, `created`
- ✅ Column counts are included in the output
- ✅ Existing text board output is unchanged without `--json`
- ✅ Exit code 0 on success

The implementation is complete and ready for verification with `make verify`. All source code changes are in `.ts` files as required by the content_type: code specification.
