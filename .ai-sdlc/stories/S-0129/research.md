---
*Generated: 2026-02-06*

Perfect! Now I have enough context. Let me compile the research findings in a comprehensive markdown format.

# Research Findings

## Problem Summary

The core requirement is to add a `--json` flag to the `ai-sdlc status` command that outputs the kanban board data as structured JSON instead of the default visual kanban board display. This enables programmatic access to board state for scripting, CI integration, and other automation workflows. The JSON output should include all story information organized by status columns (backlog, ready, in-progress, done) with column counts, while maintaining backward compatibility with the existing text-based output.

## Codebase Context

### Current Status Command Architecture

**Entry Point:** `src/index.ts` (lines 60-64)
- Defines the status command with current option: `--active` (hide done stories)
- Delegates to `status()` function in `src/cli/commands.ts`

**Status Implementation:** `src/cli/commands.ts` (lines 159-242)
- Current signature: `export async function status(options?: { active?: boolean }): Promise<void>`
- Retrieves board data via `assessState(sdlcRoot)` from `src/core/kanban.ts`
- Gets column counts via `getBoardStats(sdlcRoot)` 
- Supports two rendering modes:
  - **Kanban layout**: Side-by-side columns for wide terminals (via `shouldUseKanbanLayout()`)
  - **Vertical layout**: Stacked columns for narrow terminals
- Uses `renderKanbanBoard()` and `renderStories()` from `src/cli/table-renderer.ts` for visual output
- Shows recommended next actions after the board display

**Data Sources:** `src/core/kanban.ts`
- `assessState()` (line 261): Returns `StateAssessment` interface with story arrays by status
- `getBoardStats()` (line 518): Returns column counts as `Record<KanbanFolder, number>`
- `loadStoriesFromWorktrees()` (line 18): Loads stories from active git worktrees
- `mergeStories()` (line 82): Merges main repo + worktree stories (worktree takes precedence)

**Key Types:** `src/types/index.ts`
- `StoryStatus` (line 2): `'backlog' | 'ready' | 'in-progress' | 'done' | 'blocked'`
- `StoryFrontmatter` (line 193): Contains `id`, `title`, `status`, `priority`, `type`, `created`, etc.
- `Story` (line 299): `{ path: string; slug: string; frontmatter: StoryFrontmatter; content: string; }`
- `StateAssessment` (line 409): `{ backlogItems: Story[]; readyItems: Story[]; inProgressItems: Story[]; doneItems: Story[]; recommendedActions: Action[]; }`
- `KanbanFolder` (line 1074): Type alias for kanban folder names

### Existing Patterns for Optional Flags

**Pattern Used in Codebase:**
\`\`\`typescript
// src/index.ts examples:
.option('--active', 'Hide done stories from output')
.option('--dry-run', 'Show what would be done without executing')
.option('--quick', 'Skip project detection for faster initialization')

// Passed to command functions:
.action((options) => status(options));
\`\`\`

**Type Safety Pattern:**
Commands receive options objects with optional boolean/string properties and use TypeScript interfaces to ensure type safety.

### Story Data Structure

Based on `StoryFrontmatter` interface (lines 193-297 in types/index.ts), stories contain:
- **Core Fields**: `id`, `title`, `slug`, `priority`, `status`, `type`, `created`
- **Workflow Tracking**: `research_complete`, `plan_complete`, `implementation_complete`, `reviews_complete`
- **Optional Metadata**: `updated`, `assignee`, `labels`, `estimated_effort`, `dependencies`, `epic`
- **Git Integration**: `branch`, `worktree_path`, `pr_url`, `pr_merged`, `merge_sha`
- **Error Tracking**: `last_error`, `retry_count`, `refinement_count`, etc.

### Testing Infrastructure

**Existing Status Tests:**
- `tests/integration/status-kanban.test.ts`: Comprehensive kanban layout tests
- `tests/integration/status-active-flag.test.ts`: Tests for --active flag behavior

**Testing Pattern:**
\`\`\`typescript
// Mock console.log to capture output
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
// Call status
await status({ active: true });
// Verify output
const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
expect(output).toContain('expected text');
\`\`\`

## Files Requiring Changes

### 1. **Path**: `src/index.ts` (Line 60-64)
   - **Change Type**: Modify Existing
   - **Reason**: Add `--json` option to status command definition
   - **Specific Changes**: 
     - Add `.option('--json', 'Output board state as JSON')` after the existing `--active` option
   - **Dependencies**: None (can be done first)

### 2. **Path**: `src/cli/commands.ts` (Lines 159-242)
   - **Change Type**: Modify Existing
   - **Reason**: Implement JSON output logic in status function
   - **Specific Changes**:
     - Update function signature: `status(options?: { active?: boolean; json?: boolean })`
     - Add conditional logic after `getBoardStats()` call to check `options?.json`
     - If `--json` flag is set:
       - Skip all console.log visual rendering
       - Create JSON object with structure: `{ backlog: Story[], ready: Story[], inProgress: Story[], done: Story[] }`
       - Include column counts in the output
       - Output via `console.log(JSON.stringify(jsonData, null, 2))`
       - Return early (skip recommended actions display)
     - If not set, continue with existing visual rendering logic
   - **Dependencies**: Requires type updates first

### 3. **Path**: `src/types/index.ts` (Create new type or use inline type)
   - **Change Type**: Modify Existing (optional - can use inline type)
   - **Reason**: Define TypeScript interface for JSON output structure (optional but recommended)
   - **Specific Changes**:
     - Add interface for JSON status output (recommended for type safety):
       \`\`\`typescript
       export interface StatusJsonOutput {
         backlog: Story[];
         ready: Story[];
         inProgress: Story[];
         done: Story[];
         counts: {
           backlog: number;
           ready: number;
           inProgress: number;
           done: number;
         };
       }
       \`\`\`
   - **Dependencies**: None

### 4. **Path**: `tests/integration/status-json-output.test.ts`
   - **Change Type**: Create New
   - **Reason**: Add comprehensive test coverage for --json flag
   - **Specific Changes**:
     - Create test file following existing status test patterns
     - Test cases should cover:
       - Valid JSON output with stories in all columns
       - JSON structure validation (has expected keys)
       - Story objects contain required fields (id, title, status, priority, type, created)
       - Column counts are accurate
       - Combination with `--active` flag (should exclude done stories from JSON)
       - Empty board JSON output
       - Exit code is 0 on success
       - No visual output (console.log called only once with JSON string)
   - **Dependencies**: Requires implementation in commands.ts first

### 5. **Path**: `src/cli/commands.ts` (Story serialization)
   - **Change Type**: Modify Existing (within status function)
   - **Reason**: Map Story objects to JSON-safe representation
   - **Specific Changes**:
     - Create helper function to extract relevant story fields for JSON output:
       \`\`\`typescript
       function serializeStoryForJson(story: Story) {
         return {
           id: story.frontmatter.id,
           title: story.frontmatter.title,
           status: story.frontmatter.status,
           priority: story.frontmatter.priority,
           type: story.frontmatter.type,
           created: story.frontmatter.created,
           // Optional fields as needed
         };
       }
       \`\`\`
     - Apply this to all story arrays before outputting JSON
   - **Dependencies**: None (inline in status function)

## Testing Strategy

### Test Files to Modify
- `tests/integration/status-kanban.test.ts`: No changes needed (existing tests should pass)
- `tests/integration/status-active-flag.test.ts`: No changes needed (backward compatibility)

### New Tests Needed
Create `tests/integration/status-json-output.test.ts` with test cases:

1. **Happy Path - Valid JSON Output**
   - Create stories in all 4 columns
   - Call `status({ json: true })`
   - Verify output is valid JSON (can be parsed)
   - Verify structure has `backlog`, `ready`, `inProgress`, `done` keys
   - Verify `counts` object exists with accurate counts

2. **Story Object Validation**
   - Verify each story includes: `id`, `title`, `status`, `priority`, `type`, `created`
   - Verify story data matches source frontmatter

3. **JSON + Active Flag Combination**
   - Create stories including done stories
   - Call `status({ json: true, active: true })`
   - Verify done array is empty or excluded from output
   - Verify counts reflect active stories only

4. **Empty Board**
   - No stories created
   - Call `status({ json: true })`
   - Verify valid JSON with empty arrays
   - Verify counts are all 0

5. **No Visual Output**
   - Mock console.log
   - Call `status({ json: true })`
   - Verify console.log called exactly once (with JSON string)
   - Verify no kanban board rendering occurred

6. **Exit Code**
   - Verify status function completes without error
   - Verify exit code is 0

### Test Scenarios
- **Happy path**: Stories distributed across columns, valid JSON output
- **Edge cases**: Empty board, only backlog stories, only done stories
- **Error handling**: Invalid sdlc root (should still return valid JSON with error)
- **Flag combinations**: `--json` alone, `--json --active`, backward compat (no flags)

## Additional Context

### Relevant Patterns

**Existing JSON Output Pattern** (from codebase):
The codebase uses `JSON.stringify()` extensively for config and logging:
\`\`\`typescript
// src/index.ts line 253
console.log(JSON.stringify(config, null, 2));
\`\`\`

**Story Data Access Pattern**:
The `StateAssessment` object from `assessState()` already provides organized story arrays:
- `assessment.backlogItems`
- `assessment.readyItems`
- `assessment.inProgressItems`
- `assessment.doneIt