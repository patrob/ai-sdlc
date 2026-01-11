---
id: story-mk6ycppl-an1t
title: >-
  Add --story flag to run command: target a specific story by ID or slug,
  optionally with --step to run a specific phase (refine, research, plan,
  implement, review)
priority: 1
status: done
type: feature
created: '2026-01-09'
labels:
  - s
research_complete: true
plan_complete: true
implementation_complete: true
reviews_complete: true
updated: '2026-01-09'
---
# Add --story flag to run command: target a specific story by ID or slug, optionally with --step to run a specific phase

## User Story

**As a** developer using the story management system  
**I want** to run a specific story by ID or slug with optional phase targeting  
**So that** I can execute individual stories or specific phases without processing the entire backlog

## Summary

Enable the `run` command to accept a `--story` flag that targets a specific story by its ID or slug identifier. Additionally, support a `--step` flag to execute only a specific phase of the story workflow (refine, research, plan, implement, or review), allowing for granular control over story execution.

## Acceptance Criteria

- [ ] `--story` flag accepts both numeric IDs (e.g., `--story 123`) and string slugs (e.g., `--story add-auth-feature`)
- [ ] When `--story` is provided without `--step`, all phases of that story are executed in order
- [ ] `--step` flag accepts valid phase names: `refine`, `research`, `plan`, `implement`, `review`
- [ ] When both `--story` and `--step` are provided, only the specified phase executes for that story
- [ ] Command fails gracefully with clear error message if story ID/slug is not found
- [ ] Command fails gracefully with clear error message if invalid step name is provided
- [ ] Command respects existing story state (e.g., doesn't re-run completed phases unless forced)
- [ ] Help text (`--help`) documents both flags with examples
- [ ] Command output clearly indicates which story and phase(s) are being executed
- [ ] Exit codes appropriately reflect success/failure of the targeted story execution

## Edge Cases & Constraints

**Edge Cases:**
- Story slug contains special characters or spaces
- Story exists but has no content in the specified phase
- Multiple stories match a slug (should this error or select first match?)
- Story is in a blocked or archived state
- User attempts to run a phase that depends on previous phases not yet completed
- Story ID is provided as a string number (e.g., `--story "123"`)

**Constraints:**
- Must maintain backward compatibility with existing `run` command behavior (no flags = run all stories)
- Phase execution order dependencies must be respected unless explicitly overridden
- Story lookups should be case-insensitive for slugs
- Should integrate with existing logging and error handling patterns

## Technical Considerations

- Consider adding a `--force` flag to re-run already completed phases
- Validate phase dependencies before execution (e.g., can't implement without a plan)
- Cache story lookups if command will support multiple `--story` flags in future
- Consider supporting `--story all --step research` to run one phase across all stories

## Examples

```bash
# Run all phases for story ID 42
npm run story -- run --story 42

# Run only the research phase for a specific story
npm run story -- run --story auth-implementation --step research

# Run only the implement phase
npm run story -- run --story 15 --step implement
```

---

**Effort:** medium  
**Labels:** enhancement, cli, story-execution, phase-control

## Research

Now I have enough information to provide comprehensive research findings. Let me compile the research:

# Research: Add --story and --step flags to run command

## 1. Relevant Existing Patterns and Code to Reference

### Command Structure Pattern (src/index.ts)
The codebase uses **Commander.js** for CLI argument parsing. Current `run` command implementation:
```typescript
program
  .command('run')
  .description('Run the workflow (process next action)')
  .option('--auto', 'Process all pending actions')
  .option('--dry-run', 'Show what would be done without executing')
  .option('--continue', 'Resume workflow from last checkpoint')
  .action((options) => {
    if (!options.dryRun) {
      checkApiKey();
    }
    return run(options);
  });
```

### Story Lookup Functions (src/core/kanban.ts)
Already implemented story lookup utilities:
- `findStoryById(sdlcRoot: string, storyId: string): Story | null` (line 42-49)
- `findStoryBySlug(sdlcRoot: string, slug: string): Story | null` (line 54-61)

Both functions:
- Search across all kanban folders (backlog, ready, in-progress, done)
- Return `Story | null`
- Are **case-sensitive** currently (need enhancement for case-insensitive slugs)

### Story ID Format
Story IDs follow pattern: `story-{timestamp}-{random}` (generated in `src/core/story.ts` line 74-76)

### Action Type Definitions (src/types/index.ts)
Valid action types already defined:
```typescript
export type ActionType =
  | 'refine'
  | 'research'
  | 'plan'
  | 'implement'
  | 'review'
  | 'rework'
  | 'create_pr'
  | 'move_to_done';
```

### Current Workflow Runner (src/cli/runner.ts)
The `WorkflowRunner` class contains the orchestration logic:
- `executeAction(action: Action)` - executes individual actions (line 162-224)
- `runSingleAction(action: Action)` - runs one action with spinner feedback (line 132-157)
- Imports all agent functions dynamically based on action type

### Details Command Pattern (src/cli/commands.ts)
The `details` command (line 429-543) shows a good pattern for:
- ID/slug lookup with fallback
- Case-insensitive normalization: `normalizedInput = idOrSlug.toLowerCase().trim()`
- Clear error messages when story not found
- Graceful handling of edge cases

## 2. Files/Modules That Need Modification

### Primary Changes:

1. **src/index.ts** (Lines 57-68)
   - Add `.option('--story <id-or-slug>', 'Target specific story by ID or slug')`
   - Add `.option('--step <phase>', 'Run specific phase (refine, research, plan, implement, review)')`
   - Update action handler to pass new options to `run()`

2. **src/cli/commands.ts** (Function `run`, Lines 140-310)
   - Add `story?: string` and `step?: string` to options interface
   - Implement story lookup logic before assessment
   - Implement step validation
   - Filter actions based on story and step flags
   - Add validation and error handling

3. **src/core/kanban.ts** (Optional enhancement)
   - Make `findStoryBySlug` case-insensitive (line 54-61)
   - Consider adding `findStory(idOrSlug: string)` utility that tries both ID and slug

### Secondary Changes:

4. **src/cli/runner.ts** (Optional)
   - May need to update `RunOptions` interface (line 15-19) if passing story/step info through

5. **Help Text / Documentation**
   - Update command description with flag examples
   - Document valid step names

## 3. External Resources and Best Practices

### Commander.js Best Practices:
- Use `.option()` with angle brackets for required values: `<value>`
- Use `.option()` with square brackets for optional values: `[value]`
- Options are automatically camelCased (e.g., `--step` becomes `options.step`)
- Validation should happen in action handler, not in option definition
- Use descriptive error messages with examples

### CLI Design Patterns:
- **Fail fast**: Validate inputs before executing expensive operations
- **Clear feedback**: Show what story/step is being executed
- **Exit codes**: Return appropriate codes (0 = success, 1 = error)
- **Backward compatibility**: Preserve default behavior when flags aren't provided

### Commander.js Documentation:
- Options: https://github.com/tj/commander.js#options
- Variadic options: For future support of multiple `--story` flags

## 4. Potential Challenges and Risks

### Challenge 1: Story Slug Ambiguity
**Issue**: Slug might match multiple stories if duplicates exist across folders
**Current State**: `findStoryBySlug` returns first match found
**Risk**: Low - slugs are generated from titles and should be unique
**Mitigation**: Document behavior; consider logging warning if duplicates detected

### Challenge 2: Case Sensitivity
**Issue**: Story lookup is currently case-sensitive
**Risk**: Medium - user frustration if exact casing required
**Solution**: Make slug matching case-insensitive (already done in `details` command pattern)

### Challenge 3: Phase Dependencies
**Issue**: User might try to run `--step implement` on story without completed research/plan
**Risk**: High - could cause agent failures or incomplete work
**Solution Options**:
  1. Validate phase prerequisites and error if not met
  2. Add `--force` flag to skip validation
  3. Let agent fail naturally with clear error message (simplest)

**Recommendation**: Start with option 3, add option 1 in follow-up if needed

### Challenge 4: Story State Management
**Issue**: Running a specific phase might bypass state checks (e.g., re-running completed phases)
**Risk**: Medium - could overwrite work or confuse workflow
**Solution**: 
  - Check completion flags before execution
  - Add `--force` flag for intentional re-runs
  - Clearly document that `--step` respects existing state

### Challenge 5: Invalid Step Names
**Issue**: Typos in step names (e.g., "implment" instead of "implement")
**Risk**: Low - easy to detect and fix
**Solution**: Validate against `ActionType` union, suggest closest match

### Challenge 6: Story in Wrong Folder
**Issue**: User tries to run `--step research` on story in `backlog` (needs refinement first)
**Risk**: Medium - workflow order violation
**Solution**: 
  - Allow execution but warn about potential issues
  - OR validate story is in correct folder for requested step
  - Document folder expectations for each phase

### Challenge 7: Backward Compatibility
**Issue**: Changes shouldn't break existing `run` command behavior
**Risk**: Low - new options are additive
**Validation**: Ensure `run` without flags still works as before

## 5. Dependencies and Prerequisites

### Code Dependencies:
- ✅ Commander.js (already installed, v12.0.0)
- ✅ Story lookup functions (already implemented)
- ✅ Action execution infrastructure (already exists)
- ✅ Themed chalk for error messages (already integrated)

### Type System Updates:
- Add `story?: string` to `RunOptions` interface or command options
- Add `step?: string` to same interface
- Optional: Create `PhaseStep` type for valid step names

### Testing Needs:
- Story lookup by ID
- Story lookup by slug (case-insensitive)
- Invalid story ID/slug handling
- Invalid step name handling
- Phase execution for specific story
- Edge cases: story with special characters, numeric ID as string, etc.

### Documentation Updates:
- Help text for `--story` flag with examples
- Help text for `--step` flag with valid values
- README updates with new usage patterns
- Behavior documentation (respects state, requires prerequisites, etc.)

## 6. Implementation Strategy

### Phase 1: Basic Story Targeting
1. Add `--story` flag to command definition
2. Implement story lookup with ID/slug fallback
3. Filter assessment actions to target story only
4. Add error handling for story not found

### Phase 2: Step Targeting
1. Add `--step` flag to command definition
2. Validate step name against allowed values
3. Filter actions by type to match requested step
4. Handle case where step doesn't apply (e.g., already complete)

### Phase 3: Validation & Edge Cases
1. Add prerequisite checking (optional, can defer)
2. Implement `--force` flag (optional, can defer)
3. Improve error messages with suggestions
4. Add warning for unusual states

### Phase 4: Polish
1. Update help text with examples
2. Add verbose logging for debugging
3. Update exit codes
4. Documentation updates

## 7. Recommended Approach

### Minimal Viable Implementation:
```typescript
// In src/index.ts
.option('--story <id-or-slug>', 'Target specific story by ID or slug')
.option('--step <phase>', 'Run specific phase: refine, research, plan, implement, review')

// In src/cli/commands.ts, run() function
interface RunOptions {
  auto?: boolean;
  dryRun?: boolean;
  continue?: boolean;
  story?: string;       // NEW
  step?: string;        // NEW
}

// Add validation and filtering logic:
1. If --story provided:
   - Use findStoryById/findStoryBySlug with case-insensitive slug
   - Error if not found with helpful message
   - Filter actions to only this story
   
2. If --step provided:
   - Validate against valid action types
   - Error if invalid with list of valid values
   - Filter actions to only this step type
   
3. If both provided:
   - Apply both filters
   - Create specific action if needed
```

### Error Message Templates:
```
Error: Story not found: "auth-feature"
  Searched for ID: auth-feature
  Searched for slug: auth-feature
  
Tip: Use 'agentic-sdlc status' to see all available stories.

---

Error: Invalid step: "implment"
  Valid steps: refine, research, plan, implement, review
  
Did you mean: implement?

---

Error: Story "add-auth" is in backlog and needs refinement first.
  Run without --step to follow normal workflow, or use --force to override.
```

### Integration with Existing Workflow:
- Preserve checkpoint/continue behavior
- Respect `--auto` flag (process all matching actions)
- Respect `--dry-run` flag (show what would run)
- Maintain stage gate checks
- Keep action priority sorting

## 8. Testing Scenarios

### Happy Path:
- ✅ `run --story 42` (by ID)
- ✅ `run --story my-feature` (by slug)
- ✅ `run --story my-feature --step research`
- ✅ `run --story MY-FEATURE --step research` (case insensitive)

### Edge Cases:
- ❌ Story ID doesn't exist → clear error
- ❌ Story slug doesn't exist → clear error  
- ❌ Invalid step name → error with suggestions
- ⚠️  Story already has research complete + `--step research` → skip or warn
- ⚠️  Story in backlog + `--step research` → warn about skipping refinement
- ✅ Numeric ID as string: `--story "123"`

### Backward Compatibility:
- ✅ `run` (no flags) → works as before
- ✅ `run --auto` → works as before
- ✅ `run --continue` → works as before

---

## Summary

This feature is **well-scoped and low-risk** because:
1. Required infrastructure already exists (story lookup, action execution)
2. Changes are additive (new optional flags)
3. Follows established patterns (details command, existing options)
4. Clear failure modes with good error messages

**Estimated effort**: Medium (aligns with story estimate)

**Key success factors**:
- Case-insensitive slug matching
- Clear error messages with actionable feedback
- Validation of step names
- Preservation of existing workflow behavior

---

## Sources

- Commander.js documentation: https://github.com/tj/commander.js
- Existing codebase patterns in src/index.ts, src/cli/commands.ts, src/core/kanban.ts
- CLI design best practices from Commander.js community
