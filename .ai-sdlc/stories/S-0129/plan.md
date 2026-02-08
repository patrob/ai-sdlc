---
*Generated: 2026-02-06*

Perfect! I have all the context I need from the research document and codebase exploration. Now I'll create a comprehensive implementation plan.

# Implementation Plan: Add JSON Output Format to Status Command

## Phase 1: Setup and Type Definitions

- [ ] **T1**: Add TypeScript interface for JSON output structure
  - Files: `src/types/index.ts`
  - Dependencies: none
  - Define `StatusJsonOutput` interface with `backlog`, `ready`, `inProgress`, `done` arrays and `counts` object
  - Define `SerializedStory` interface for JSON-safe story representation

## Phase 2: CLI Flag Integration

- [ ] **T2**: Add `--json` flag to status command definition
  - Files: `src/index.ts`
  - Dependencies: none
  - Add `.option('--json', 'Output board state as JSON')` to status command (line ~63)
  - Update action handler to pass json option to status function

## Phase 3: Core Implementation

- [ ] **T3**: Create helper function to serialize Story objects for JSON output
  - Files: `src/cli/commands.ts`
  - Dependencies: T1
  - Implement `serializeStoryForJson()` function that extracts required fields (`id`, `title`, `status`, `priority`, `type`, `created`)
  - Place function near the top of the file with other utility functions

- [ ] **T4**: Update status function signature to accept json option
  - Files: `src/cli/commands.ts`
  - Dependencies: T1
  - Change signature from `status(options?: { active?: boolean })` to `status(options?: { active?: boolean; json?: boolean })`

- [ ] **T5**: Implement JSON output logic in status function
  - Files: `src/cli/commands.ts`
  - Dependencies: T3, T4
  - Add conditional check for `options?.json` after `getBoardStats()` call
  - Build JSON object with serialized stories organized by column
  - Include column counts in output
  - Handle `--active` flag interaction (exclude done stories when active=true)
  - Output via `console.log(JSON.stringify(jsonData, null, 2))`
  - Return early to skip visual rendering

## Phase 4: Test Implementation (TDD approach)

- [ ] **T6**: Create test file structure and setup
  - Files: `tests/integration/status-json-output.test.ts`
  - Dependencies: T2, T5
  - Follow pattern from `status-kanban.test.ts`
  - Set up test fixtures, beforeEach/afterEach hooks
  - Mock console.log to capture output

- [ ] **T7**: Write test for valid JSON output with stories in all columns
  - Files: `tests/integration/status-json-output.test.ts`
  - Dependencies: T6
  - Create stories in backlog, ready, in-progress, done
  - Call `status({ json: true })`
  - Verify output is parseable JSON
  - Verify structure has required keys (backlog, ready, inProgress, done, counts)

- [ ] **T8**: Write test for story object field validation
  - Files: `tests/integration/status-json-output.test.ts`
  - Dependencies: T6
  - Create story with known frontmatter values
  - Call `status({ json: true })`
  - Parse JSON output
  - Verify each story includes: id, title, status, priority, type, created
  - Verify values match source frontmatter

- [ ] **T9**: Write test for JSON + --active flag combination
  - Files: `tests/integration/status-json-output.test.ts`
  - Dependencies: T6
  - Create stories including done stories
  - Call `status({ json: true, active: true })`
  - Verify done array is excluded or empty
  - Verify counts reflect only active stories
  - Verify summary behavior

- [ ] **T10**: Write test for empty board scenario
  - Files: `tests/integration/status-json-output.test.ts`
  - Dependencies: T6
  - Initialize kanban without creating stories
  - Call `status({ json: true })`
  - Verify valid JSON with empty arrays
  - Verify all counts are 0

- [ ] **T11**: Write test to verify no visual output in JSON mode
  - Files: `tests/integration/status-json-output.test.ts`
  - Dependencies: T6
  - Mock console.log
  - Call `status({ json: true })`
  - Verify console.log called exactly once with JSON string
  - Verify output doesn't contain visual elements (═══, │, etc.)

- [ ] **T12**: Write test for exit code success
  - Files: `tests/integration/status-json-output.test.ts`
  - Dependencies: T6
  - Call `status({ json: true })`
  - Verify function completes without throwing
  - Verify no error output

## Phase 5: Edge Cases and Error Handling

- [ ] **T13**: Add test for stories with worktrees in JSON output
  - Files: `tests/integration/status-json-output.test.ts`
  - Dependencies: T6
  - Create story in worktree (following pattern from status-kanban.test.ts lines 543-627)
  - Mock GitWorktreeService.list()
  - Verify worktree story appears in correct column in JSON output

- [ ] **T14**: Add test for stories with emojis in titles
  - Files: `tests/integration/status-json-output.test.ts`
  - Dependencies: T6
  - Create story with emoji in title (e.g., "🚀 Deploy feature")
  - Verify JSON output correctly serializes emoji characters

- [ ] **T15**: Add test for very long story titles
  - Files: `tests/integration/status-json-output.test.ts`
  - Dependencies: T6
  - Create story with long title (100+ characters)
  - Verify full title is included in JSON (no truncation like visual mode)

## Phase 6: Backward Compatibility Verification

- [ ] **T16**: Run existing status tests to verify backward compatibility
  - Files: `tests/integration/status-kanban.test.ts`, `tests/integration/status-active-flag.test.ts`
  - Dependencies: T5
  - Execute `make test` or run vitest on status tests
  - Verify all existing tests pass without modification
  - Verify visual output unchanged when --json not provided

## Phase 7: Integration Verification

- [ ] **T17**: Manual CLI testing of --json flag
  - Files: N/A (CLI testing)
  - Dependencies: T5
  - Build project: `npm run build` or `make build`
  - Test: `ai-sdlc status --json` on real board
  - Verify valid JSON output to stdout
  - Test: `ai-sdlc status --json --active`
  - Verify combined flag behavior

- [ ] **T18**: Verify JSON can be piped and parsed
  - Files: N/A (CLI testing)
  - Dependencies: T17
  - Test: `ai-sdlc status --json | jq '.backlog'`
  - Test: `ai-sdlc status --json > output.json`
  - Verify JSON is parseable by standard tools

## Phase 8: Pre-Commit Verification

- [ ] **T19**: Run full verification suite
  - Files: N/A (verification)
  - Dependencies: T16, T17, T18
  - Execute: `make verify`
  - Fix any linting, type checking, or test failures
  - Ensure all tests pass

## Acceptance Criteria Verification

After all tasks complete, verify each acceptance criterion:

- [ ] ✓ `ai-sdlc status --json` outputs valid JSON to stdout (T7, T17)
- [ ] ✓ JSON includes columns with story arrays: `{ backlog: [...], ready: [...], inProgress: [...], done: [...] }` (T5, T7)
- [ ] ✓ Each story object includes: `id`, `title`, `status`, `priority`, `type`, `created` (T3, T8)
- [ ] ✓ Column counts are included in the output (T5, T7)
- [ ] ✓ Existing text board output is unchanged without `--json` (T16)
- [ ] ✓ Exit code 0 on success (T12, T17)

## Implementation Notes

### Key Design Decisions

1. **JSON Output Format**: Use camelCase for JSON keys (`inProgress` vs `in-progress`) to follow JavaScript conventions
2. **Story Serialization**: Only include essential fields in JSON output to keep it clean and focused
3. **Active Flag Interaction**: When `--json --active` both provided, exclude done stories from output entirely
4. **Error Handling**: Maintain existing error behavior; JSON mode doesn't change error handling
5. **Output Method**: Single `console.log()` call with formatted JSON (2-space indent for readability)

### Testing Strategy

- **Unit Tests**: None needed (integration tests sufficient for CLI command)
- **Integration Tests**: Comprehensive coverage in new test file (T6-T15)
- **Backward Compatibility**: Verified by running existing tests without modification (T16)
- **Manual Testing**: CLI verification with real data (T17-T18)

### Files Summary

**Modified (3 files)**:
- `src/index.ts` - Add --json flag
- `src/cli/commands.ts` - Implement JSON output logic
- `src/types/index.ts` - Add TypeScript interfaces

**Created (1 file)**:
- `tests/integration/status-json-output.test.ts` - Comprehensive test coverage

**Total Changes**: 4 files