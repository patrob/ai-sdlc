---
*Generated: 2026-01-28*

Perfect! Now I have a comprehensive understanding of the codebase. Let me compile the research findings.

---

# Research Findings: Add Ticket Fields to Story Schema

## Problem Summary

The story requires adding optional external ticketing fields to the `StoryFrontmatter` interface to enable linking ai-sdlc stories with external ticketing systems (GitHub Issues, Jira, Linear). This is the foundational change for the broader ticketing integration epic, providing metadata storage without changing any existing behavior.

**Core Goal:** Add four optional fields (`ticket_provider`, `ticket_id`, `ticket_url`, `ticket_synced_at`) that can store external ticket metadata while maintaining complete backward compatibility with existing stories.

---

## Codebase Context

### Current Architecture

The ai-sdlc system uses a **folder-per-story** structure where each story is stored as:
- Directory: `.ai-sdlc/stories/{story-id}/`
- Main file: `story.md` with YAML frontmatter + markdown content
- Section files (optional): `research.md`, `plan.md`, `review.md`

**Story Data Flow:**
1. **Parsing:** `parseStory()` in `src/core/story.ts` reads `.md` file → uses `gray-matter` to extract frontmatter → returns `Story` object
2. **Writing:** `writeStory()` in `src/core/story.ts` takes `Story` object → uses `gray-matter.stringify()` → writes to disk with file locking
3. **Type Safety:** `StoryFrontmatter` interface in `src/types/index.ts` defines all valid frontmatter fields

### Relevant Existing Patterns

**1. Optional Fields Pattern:**
The codebase already has many optional frontmatter fields that demonstrate the pattern to follow:

\`\`\`typescript
// From src/types/index.ts:158-245
export interface StoryFrontmatter {
  // Required core fields
  id: string;
  title: string;
  slug: string;
  priority: number;
  status: StoryStatus;
  type: StoryType;
  created: string;
  // ...
  
  // Optional metadata (examples of the pattern we'll follow)
  updated?: string;
  assignee?: string;
  estimated_effort?: EffortEstimate;
  dependencies?: string[];
  epic?: string;
  pr_url?: string;
  pr_merged?: boolean;
  merge_sha?: string;
  merged_at?: string;
  branch?: string;
  worktree_path?: string;
  last_error?: string;
  // ... many more optional fields
}
\`\`\`

**2. Parsing Behavior:**
- `parseStory()` (lines 26-62 in `src/core/story.ts`) uses `gray-matter` which automatically handles optional fields
- No explicit validation of optional fields - they're either present or undefined
- Backward compatibility: Missing fields become `undefined` in the returned object

**3. Writing Behavior:**
- `writeStory()` (lines 89-140 in `src/core/story.ts`) uses `matter.stringify()` which:
  - Serializes all defined frontmatter fields to YAML
  - Omits `undefined` fields from output
  - Uses file locking (`proper-lockfile`) for atomic updates

**4. Testing Pattern:**
From `src/core/story.test.ts`, the existing test structure shows:
- Tests use temporary directories created with `fs.mkdtempSync()`
- Helper functions create test stories with specific frontmatter
- Tests verify both parsing and persistence to disk
- Tests confirm backward compatibility (existing behavior unchanged)

---

## Files Requiring Changes

### 1. **Path**: `src/types/index.ts`
- **Change Type**: Modify Existing
- **Reason**: Add new optional fields to `StoryFrontmatter` interface (lines 158-245)
- **Specific Changes**: 
  - Add 4 new optional fields after line 245 (before the closing brace)
  - Use union type for `ticket_provider` to restrict to known providers
  - All fields are optional (`?:`) for backward compatibility
  - Add JSDoc comments explaining each field
- **Dependencies**: None - this is the foundational change
- **Example Location:**
  \`\`\`typescript
  // After line 245, before closing brace of StoryFrontmatter
  // External ticket integration (optional)
  ticket_provider?: 'github' | 'jira' | 'linear';
  ticket_id?: string;
  ticket_url?: string;
  ticket_synced_at?: string;
  \`\`\`

### 2. **Path**: `src/core/story.ts`
- **Change Type**: No modifications needed (verify behavior)
- **Reason**: `parseStory()` and `writeStory()` already handle optional fields correctly via `gray-matter`
- **Specific Changes**: None required - but tests will verify this works
- **Dependencies**: Depends on `src/types/index.ts` change
- **Verification Points:**
  - `parseStory()` (line 26): `gray-matter` automatically parses new fields if present
  - `writeStory()` (line 89): `matter.stringify()` automatically preserves new fields if defined

### 3. **Path**: `src/core/story.test.ts`
- **Change Type**: Modify Existing
- **Reason**: Add new test cases to verify ticket field handling
- **Specific Changes**:
  - Add new `describe('Story ticket fields', ...)` block
  - Test 1: Parse story WITH ticket fields → verify all 4 fields extracted correctly
  - Test 2: Parse story WITHOUT ticket fields → verify fields are undefined
  - Test 3: Write story WITH ticket fields → verify fields persisted to disk
  - Test 4: Write story WITHOUT ticket fields → verify existing behavior unchanged
- **Dependencies**: Depends on `src/types/index.ts` change
- **Placement**: Add tests after line 1346 (after `autoCompleteStoryAfterReview` describe block)

### 4. **Path**: `docs/configuration.md`
- **Change Type**: Modify Existing
- **Reason**: Document the new ticket fields for users
- **Specific Changes**:
  - Add new section: "Story Frontmatter Reference" (or similar) around line 836 (before "Additional Resources")
  - Document each ticket field with description, type, example
  - Note that fields are optional and intended for ticketing integration
  - Cross-reference S-0073+ stories for provider implementations
- **Dependencies**: Depends on `src/types/index.ts` change
- **Example Content:**
  \`\`\`markdown
  ### External Ticket Integration
  
  Story frontmatter supports optional fields for linking to external ticketing systems:
  
  - `ticket_provider`: Ticketing system type (`'github'`, `'jira'`, or `'linear'`)
  - `ticket_id`: External ticket identifier (e.g., `"123"` for GitHub, `"PROJ-456"` for Jira)
  - `ticket_url`: Full URL to the external ticket
  - `ticket_synced_at`: ISO 8601 timestamp of last synchronization
  
  These fields are populated by ticketing provider integrations (see S-0073+) and remain undefined for local-only stories.
  \`\`\`

---

## Testing Strategy

### Test Files to Modify
- **`src/core/story.test.ts`**: Add new test suite for ticket field handling

### New Tests Needed

**Test Suite**: `describe('Story ticket fields', ...)`

1. **Test: Parse story with all ticket fields**
   - **Scenario**: Story file contains all 4 ticket fields in frontmatter
   - **Expected**: `parseStory()` returns Story with all fields populated correctly
   - **Coverage**: Happy path for ticketing integration

2. **Test: Parse story with partial ticket fields**
   - **Scenario**: Story file has only `ticket_provider` and `ticket_id` (not `ticket_url` or `ticket_synced_at`)
   - **Expected**: Populated fields are present, missing fields are undefined
   - **Coverage**: Robustness for incomplete ticket data

3. **Test: Parse story without any ticket fields**
   - **Scenario**: Story file has no ticket fields (existing stories)
   - **Expected**: All 4 fields are undefined, story parses normally
   - **Coverage**: Backward compatibility verification (critical!)

4. **Test: Write story with ticket fields preserves them**
   - **Scenario**: Story object has ticket fields → write to disk → re-parse
   - **Expected**: Re-parsed story has identical ticket field values
   - **Coverage**: Round-trip persistence

5. **Test: Write story without ticket fields (existing behavior)**
   - **Scenario**: Story object has no ticket fields → write to disk → check file content
   - **Expected**: No ticket fields appear in YAML frontmatter
   - **Coverage**: Ensures `undefined` fields don't pollute output

6. **Test: Update story with ticket fields (via writeStory)**
   - **Scenario**: Start with story without ticket fields → add ticket fields → call `writeStory()`
   - **Expected**: Updated story has ticket fields persisted
   - **Coverage**: Linking operation simulation

### Existing Tests
- **Run full test suite**: All 69 existing `story.test.ts` tests must pass unchanged
- **Critical tests to monitor**:
  - `parseStory` tests (lines 313-447): Verify no regression in parsing
  - `writeStory` file locking tests (lines 792-937): Verify locking still works
  - `createStory` tests (lines 1066-1134): Verify story creation unaffected

### Integration Testing Strategy
While this story doesn't require integration tests (it's pure schema change), the related stories (S-0073+) will need:
- Mock ticketing providers that populate these fields
- CLI commands that display ticket fields
- Round-trip sync tests (write to GitHub → read from GitHub → verify fields match)

---

## Additional Context

### Relevant Patterns

**1. Union Types for Enums:**
The codebase uses TypeScript union types instead of enums for configuration values:
\`\`\`typescript
// Example from src/types/index.ts:2-4
export type StoryStatus = 'backlog' | 'ready' | 'in-progress' | 'done' | 'blocked';
export type StoryType = 'feature' | 'bug' | 'chore' | 'spike';
export type EffortEstimate = 'small' | 'medium' | 'large';
\`\`\`
**Apply to:** `ticket_provider` should follow this pattern (not an enum)

**2. ISO Timestamp Format:**
The codebase consistently uses ISO 8601 format for timestamps:
\`\`\`typescript
// Examples from story.ts
created: new Date().toISOString().split('T')[0]  // Date only: "2024-01-15"
blocked_at: new Date().toISOString()             // Full: "2024-01-15T10:00:00.000Z"
\`\`\`
**Apply to:** `ticket_synced_at` should store full ISO timestamp (not just date)

**3. Field Naming Convention:**
All frontmatter fields use `snake_case` (not camelCase):
\`\`\`typescript
research_complete, plan_complete, implementation_complete  // ✅ Correct
researchComplete, planComplete             