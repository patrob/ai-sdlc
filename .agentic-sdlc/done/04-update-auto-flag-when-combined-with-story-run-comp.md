---
id: story-mk74zlbj-gj60
title: >-
  Update --auto flag: when combined with --story, run complete SDLC process
  (refine → research → plan → implement → review) for that individual story
priority: 4
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
branch: agentic-sdlc/update-auto-flag-when-combined-with-story-run-comp
---
# Update --auto flag: when combined with --story, run complete SDLC process (refine → research → plan → implement → review) for that individual story

## User Story

**As a** developer using the AI-powered SDLC automation tool  
**I want** the `--auto` flag to execute the complete SDLC workflow (refine → research → plan → implement → review) when combined with `--story`  
**So that** I can automatically process a single story end-to-end without manual intervention between phases

## Summary

Currently, the `--auto` flag may only handle partial automation or batch processing. This enhancement will enable full single-story automation by chaining all SDLC phases: the story will be refined for clarity, researched for context, planned for implementation approach, implemented with code changes, and finally reviewed for quality—all in one command execution.

## Acceptance Criteria

- [ ] Running `--auto --story <story-id>` executes all five phases in sequence: refine → research → plan → implement → review
- [ ] Each phase completes successfully before the next phase begins
- [ ] The story file/record is updated after each phase with relevant outputs (research notes, implementation plan, review feedback)
- [ ] If any phase fails, the process stops and reports which phase failed with clear error messaging
- [ ] The final output indicates whether the story completed all phases successfully
- [ ] Progress indicators show which phase is currently executing
- [ ] The command works with both story IDs and story file paths (if applicable to the system)
- [ ] Existing `--story` functionality without `--auto` remains unchanged
- [ ] Documentation is updated to reflect the new `--auto --story` combination usage

## Edge Cases & Constraints

**Edge Cases:**
- Story doesn't exist or cannot be found
- Story is already in a completed state
- Network/API failures during agent execution
- Story has missing required fields that prevent phase execution
- User interrupts (Ctrl+C) during multi-phase execution
- Concurrent modifications to the same story

**Constraints:**
- Must maintain idempotency where possible (re-running should be safe)
- Should respect existing story state (don't override manually added content)
- Phase outputs must be stored/logged for debugging
- Must work within existing authentication/authorization models
- Should handle timeouts for long-running phases

**Technical Considerations:**
- Determine if phases should run in subprocess/isolated contexts
- Define rollback strategy if a later phase fails
- Consider adding a `--dry-run` option to preview the workflow
- May need phase-level retry logic for transient failures

## Dependencies

- Assumes all five agents (refine, research, plan, implement, review) are functional
- Requires story storage/retrieval mechanism to be in place
- May depend on existing CLI argument parsing infrastructure

## Success Metrics

- A story can be taken from raw idea to reviewed implementation in a single command
- Reduced time-to-completion for individual stories
- Clear audit trail of what each phase contributed

---

**effort:** large

**labels:** enhancement, cli, automation, sdlc-workflow, --auto-flag, agent-orchestration

## Research

Perfect! Now I have a comprehensive understanding of the codebase. Let me create the research findings document.

# Research: Update --auto flag with --story combination for complete SDLC process

## 1. Relevant Existing Patterns and Code to Reference

### Current Implementation Analysis

**CLI Command Structure (`src/index.ts` lines 58-70):**
- The `run` command already supports `--auto`, `--story`, and `--step` flags
- These flags are already parsed and passed to the `run()` function in `commands.ts`
- Current behavior: `--story` filters actions to a specific story, but doesn't override the SDLC phase sequence

**Action Filtering in `commands.ts` (lines 221-272):**
```typescript
// Filter actions by story if --story flag is provided
if (options.story) {
  const targetStory = findStoryById(sdlcRoot, normalizedInput) || findStoryBySlug(sdlcRoot, normalizedInput);
  assessment.recommendedActions = assessment.recommendedActions.filter(
    action => action.storyPath === targetStory!.path
  );
}

// Filter actions by step type if --step flag is provided
if (options.step) {
  assessment.recommendedActions = assessment.recommendedActions.filter(
    action => action.type === normalizedStep
  );
}
```

**Key Insight:** The current implementation filters existing recommended actions from the state assessor. When `--auto --story` is used, it processes whatever actions the state assessor recommends for that story, which may not include all phases if the story is in the wrong state.

### State Assessment Logic (`src/core/kanban.ts` lines 79-238)

The `assessState()` function determines which actions are needed based on:
- **Story location** (backlog/ready/in-progress/done)
- **Completion flags** (research_complete, plan_complete, etc.)
- **Priority-based ordering**

**Current phase progression:**
1. Backlog stories → `refine` action (moves to ready)
2. Ready stories → `research` → `plan` → `implement` (moves to in-progress)
3. In-progress stories → `implement` → `review` → `create_pr` → done

### Workflow State & Resume (`src/core/workflow-state.ts`)
- Already has checkpoint/resume functionality via `--continue` flag
- Saves completed actions and can skip them on resume
- Uses story content hashing to detect changes

### Agent Execution Pattern (`src/cli/commands.ts` lines 392-464)
The `executeAction()` function shows the standard pattern:
```typescript
switch (action.type) {
  case 'refine':
    const { runRefinementAgent } = await import('../agents/refinement.js');
    result = await runRefinementAgent(action.storyPath, sdlcRoot);
    break;
  case 'research':
    const { runResearchAgent } = await import('../agents/research.js');
    result = await runResearchAgent(action.storyPath, sdlcRoot);
    break;
  // ... etc
}
```

## 2. Files/Modules That Need Modification

### Primary Files:

1. **`src/cli/commands.ts`** (Major changes)
   - Lines 140-384: Modify `run()` function to detect `--auto --story` combination
   - Add new logic to generate a complete phase sequence for the target story
   - Create actions for all phases (refine → research → plan → implement → review) regardless of current state
   - Modify action filtering to handle the new orchestration mode

2. **`src/types/index.ts`** (Minor additions)
   - Add new option type or extend existing options interface
   - May need new ActionType or orchestration mode enum

3. **`src/index.ts`** (Documentation update)
   - Lines 58-70: Update help text for `--auto` flag to document the `--story` combination

### Secondary Files (for future enhancements):

4. **`src/core/story.ts`** (Potential helper functions)
   - May add helper to validate story readiness for full SDLC
   - Helper to reset all phase flags for a full restart

5. **`src/core/workflow-state.ts`** (Optional)
   - Could enhance to track "full SDLC mode" in checkpoint context
   - Would help with resume functionality for `--auto --story` workflows

## 3. External Resources and Best Practices

### Workflow Orchestration Patterns

**Sequential Phase Execution:**
- Each phase must complete successfully before proceeding
- Maintain transactional semantics: log progress after each phase
- Implement early exit on failure with clear error messaging

**Progress Indicators (using `ora`):**
The codebase already uses `ora` for spinners. For multi-phase execution:
- Update spinner text between phases: "Phase 1/5: Refining..."
- Show completed phases in success messages
- Indicate current progress percentage

**Best Practice Example:**
```typescript
const phases = ['refine', 'research', 'plan', 'implement', 'review'];
for (let i = 0; i < phases.length; i++) {
  spinner.text = `Phase ${i+1}/${phases.length}: ${phases[i]}...`;
  // execute phase
}
```

### Error Handling & Recovery

**Circuit Breaker Pattern (already used):**
- `src/core/config.ts` line 18: `refinement.maxIterations`
- `src/core/config.ts` line 23: `reviewConfig.maxRetries`
- Apply same pattern for full SDLC workflow

**Idempotency Considerations:**
- Refinement agent moves story from backlog → ready (side effect)
- Research/Plan agents update story frontmatter flags
- Implement agent creates/modifies code files
- Must handle re-running phases that were partially completed

### CLI Design Patterns (from Commander.js)

**Combining Flags:**
- Commander automatically handles flag combinations
- Options object contains all flags: `{ auto: true, story: 'foo', step: 'research' }`
- Validate incompatible combinations early (e.g., `--step` conflicts with full SDLC mode)

**User Experience:**
```bash
# Current behavior - processes recommended actions for story
agentic-sdlc run --story my-feature

# NEW behavior - full SDLC pipeline
agentic-sdlc run --auto --story my-feature

# Conflict - should warn or error
agentic-sdlc run --auto --story my-feature --step research
```

## 4. Potential Challenges and Risks

### Challenge 1: Story State Conflicts
**Problem:** Story might already be in-progress with partial completion (e.g., research and plan done, but not implemented)

**Risk:** Running `--auto --story` might:
- Try to re-refine a ready/in-progress story (moves it back to backlog?)
- Duplicate work already completed
- Overwrite existing research/plan content

**Mitigation Strategies:**
1. **Option A (Recommended):** Skip completed phases, start from first incomplete phase
   - Check flags: `research_complete`, `plan_complete`, etc.
   - Only execute phases where flag is `false`
   - Pros: Idempotent, safe, respects existing work
   - Cons: Not truly "full SDLC" if story is partially done

2. **Option B:** Force full restart with `--force` flag
   - Reset all completion flags
   - Clear research/plan/review sections
   - Start from scratch regardless of current state
   - Pros: Predictable, truly complete workflow
   - Cons: Destructive, loses existing work

3. **Option C:** Detect state and prompt user
   - If story has any completed phases, warn user
   - Ask: "Story has partial completion. Skip completed phases or restart?"
   - Pros: Safest, gives user control
   - Cons: Not fully automated (conflicts with `--auto` promise)

**Recommendation:** Implement Option A with clear logging of skipped phases

### Challenge 2: Phase Dependencies
**Problem:** Some phases have prerequisites (location, status, prior phase completion)

**Example:** Refinement agent expects story in `backlog/` folder, but `--story` might target an `in-progress` story

**Current Behavior:**
- `runRefinementAgent()` moves story from backlog → ready
- `runResearchAgent()` expects story in ready/
- `runImplementationAgent()` expects story in ready or in-progress

**Mitigation:**
- Before executing phase, check prerequisites
- Automatically move story to correct folder if needed
- Log these state transitions clearly

### Challenge 3: Conflict with --step Flag
**Problem:** User runs `agentic-sdlc run --auto --story foo --step research`

**Questions:**
- Should `--step` override the "full SDLC" mode?
- Should we error/warn about incompatible flags?
- Which flag takes precedence?

**Recommendation:** Error early with clear message:
```
Error: Cannot combine --auto --story with --step flag.
Use either:
  - agentic-sdlc run --auto --story foo (full SDLC)
  - agentic-sdlc run --story foo --step research (single phase)
```

### Challenge 4: Long-Running Workflow Interruption
**Problem:** Full SDLC might take 5-15 minutes. User hits Ctrl+C during implementation phase.

**Current Support:** `--continue` flag with checkpoint system exists

**Integration Needed:**
- Ensure `--auto --story` mode saves checkpoints after each phase
- On resume with `--continue`, detect original mode (single-story full SDLC)
- Continue from interrupted phase for same story

**Implementation:**
Add to `WorkflowExecutionState.context`:
```typescript
context: {
  sdlcRoot: string;
  options: {
    auto?: boolean;
    dryRun?: boolean;
    story?: string;  // NEW: track target story
    fullSDLC?: boolean;  // NEW: flag for full SDLC mode
  };
  // ...
}
```

### Challenge 5: Review Failures & Retry Logic
**Problem:** Review agent might reject implementation, triggering refinement loop

**Current Behavior:** 
- Review rejection resets plan/implement/review flags
- Story goes back through plan → implement → review cycle
- Has max retry limit (`reviewConfig.maxRetries`)

**Question:** How does this interact with `--auto --story` full SDLC?

**Recommendation:**
- Let review retry logic work as designed
- If review fails, log clearly: "Review rejected, restarting plan phase (attempt 2/3)"
- Continue auto-execution through retry cycles
- Only stop if max retries exceeded

### Challenge 6: Stage Gates
**Problem:** Config has stage gates: `requireApprovalBeforeImplementation`, `requireApprovalBeforePR`

**Current Behavior:** Auto mode stops at stage gates (see `src/cli/runner.ts` lines 107-111)

**Question:** Should `--auto --story` bypass or respect stage gates?

**Recommendation:** Respect stage gates, but log clearly:
```
✓ Research complete
✓ Plan complete
⚠️ Stage gate: Implementation requires approval
Run 'agentic-sdlc run --story foo' to approve and continue
```

## 5. Dependencies and Prerequisites

### Required Dependencies (Already Installed)
- ✅ `commander` - CLI argument parsing (already handles --auto --story)
- ✅ `ora` - Progress spinners
- ✅ `chalk` - Terminal colors for phase progress
- ✅ `gray-matter` - Story frontmatter parsing

### Code Dependencies (Already Exist)
- ✅ All five agent modules (refine, research, plan, implement, review)
- ✅ State assessor and kanban management
- ✅ Workflow state persistence (checkpoint/resume)
- ✅ Story utility functions (move, update, parse)

### Configuration Dependencies
- ✅ `reviewConfig.maxRetries` - Controls review retry loops
- ✅ `refinement.maxIterations` - Circuit breaker for refinement
- ✅ `stageGates` - May interrupt auto execution
- ⚠️ May need new config: `fullSDLC.enableSkipCompletedPhases` (default: true)

### Testing Prerequisites
- Need test stories in different states:
  - Fresh story in backlog (never refined)
  - Story in ready with research complete
  - Story in in-progress with plan complete
  - Story that has failed review
- Test cases for:
  - Happy path (full SDLC from backlog → done)
  - Resume after interruption
  - Stage gate blocking
  - Review rejection and retry
  - Max retry exceeded
  - Invalid story ID/slug
  - Conflicting flags (--step)

## 6. Implementation Strategy

### Phase 1: Core Logic (Highest Priority)
1. Detect `--auto --story` combination in `commands.ts`
2. Generate complete phase sequence: `['refine', 'research', 'plan', 'implement', 'review']`
3. For each phase, check if already complete (skip if true)
4. Execute remaining phases sequentially with progress indicators
5. Handle early exit on failure

### Phase 2: Edge Cases
1. Validate flag combinations (error on `--auto --story --step`)
2. Handle story not found
3. Handle stage gate interruptions
4. Integrate with existing checkpoint/resume system

### Phase 3: Documentation
1. Update help text in `src/index.ts`
2. Add examples to README.md
3. Document behavior with partial completion
4. Document interaction with stage gates and retry logic

### Phase 4: Testing
1. Unit tests for phase sequence generation
2. Integration tests for full workflow
3. Test resume functionality
4. Test error scenarios

## 7. Recommended Approach

**Core Algorithm (Pseudo-code):**

```typescript
async function run(options) {
  const isFullSDLC = options.auto && options.story;
  
  if (isFullSDLC) {
    // Validate no conflicting flags
    if (options.step) {
      throw new Error('Cannot combine --auto --story with --step');
    }
    
    // Find target story
    const story = findStoryByIdOrSlug(options.story);
    if (!story) {
      throw new Error(`Story not found: ${options.story}`);
    }
    
    // Define complete phase sequence
    const allPhases: ActionType[] = ['refine', 'research', 'plan', 'implement', 'review'];
    const actionsToExecute: Action[] = [];
    
    // Determine which phases to run based on completion flags
    for (const phase of allPhases) {
      if (shouldExecutePhase(story, phase)) {
        actionsToExecute.push({
          type: phase,
          storyId: story.frontmatter.id,
          storyPath: story.path,
          reason: `Full SDLC: ${phase} phase`,
          priority: 0,
        });
      }
    }
    
    // Execute phases sequentially
    console.log(`Starting full SDLC for story: ${story.frontmatter.title}`);
    console.log(`Phases to execute: ${actionsToExecute.length}/${allPhases.length}`);
    
    for (let i = 0; i < actionsToExecute.length; i++) {
      const action = actionsToExecute[i];
      spinner.text = `Phase ${i+1}/${actionsToExecute.length}: ${action.type}...`;
      
      const success = await executeAction(action, sdlcRoot);
      if (!success) {
        throw new Error(`Phase ${action.type} failed. See error above.`);
      }
      
      // Save checkpoint
      await saveCheckpoint(action, options);
    }
    
    console.log('✓ Full SDLC complete!');
    
  } else {
    // Original behavior: filter recommended actions
    // ... existing code ...
  }
}

function shouldExecutePhase(story: Story, phase: ActionType): boolean {
  switch (phase) {
    case 'refine':
      // Execute refine if story is in backlog
      return story.frontmatter.status === 'backlog';
    case 'research':
      return !story.frontmatter.research_complete;
    case 'plan':
      return !story.frontmatter.plan_complete;
    case 'implement':
      return !story.frontmatter.implementation_complete;
    case 'review':
      return !story.frontmatter.reviews_complete;
    default:
      return false;
  }
}
```

---

## Summary

This story is **highly feasible** with the existing architecture. The main changes are:

1. **Detection logic** for `--auto --story` combination
2. **Phase sequence generation** independent of state assessor
3. **Sequential execution** with progress tracking
4. **Integration** with existing checkpoint/resume system
5. **Validation** to prevent flag conflicts

**Risk Level:** Medium
- High confidence in implementation approach
- Main risks are edge cases (partial completion, review retries, stage gates)
- Good test coverage will be critical

**Estimated Effort:** Medium (matches story estimate)
- ~200-300 lines of new code in `commands.ts`
- Minimal changes to other files
- Significant testing effort required

## Implementation Plan

# Implementation Plan: Update --auto flag for Complete SDLC Process with --story

## Overview
This plan implements full SDLC automation for individual stories when using `--auto --story` combination. The workflow will execute: refine → research → plan → implement → review phases sequentially, with smart phase skipping, error handling, and progress tracking.

---

## Phase 1: Setup & Preparation

### 1.1 Type Definitions
- [ ] Review and understand existing types in `src/types/index.ts`
- [ ] Add `fullSDLC?: boolean` flag to track orchestration mode in workflow context
- [ ] Document the new behavior in type comments

### 1.2 Test Story Setup
- [ ] Create test story in `backlog/` for fresh SDLC workflow testing
- [ ] Create test story in `ready/` with `research_complete: true` for skip-phase testing
- [ ] Create test story in `in-progress/` with partial completion for edge case testing
- [ ] Document test story IDs/slugs for reference during testing

### 1.3 Code Exploration
- [ ] Read and understand `src/cli/commands.ts` lines 140-384 (current `run()` function)
- [ ] Read and understand `src/cli/commands.ts` lines 392-464 (current `executeAction()`)
- [ ] Review checkpoint/resume logic in `src/core/workflow-state.ts`
- [ ] Review stage gate handling in `src/cli/runner.ts` lines 107-111

---

## Phase 2: Core Implementation

### 2.1 Flag Validation Logic
- [ ] Add validation function `validateAutoStoryOptions()` in `src/cli/commands.ts`
- [ ] Check for conflicting `--step` flag when `--auto --story` is used
- [ ] Return clear error message: "Cannot combine --auto --story with --step flag"
- [ ] Add unit test for flag conflict validation

### 2.2 Phase Determination Logic
- [ ] Create function `shouldExecutePhase(story: Story, phase: ActionType): boolean`
- [ ] Implement check for `refine`: return `true` if story is in backlog folder
- [ ] Implement check for `research`: return `!story.frontmatter.research_complete`
- [ ] Implement check for `plan`: return `!story.frontmatter.plan_complete`
- [ ] Implement check for `implement`: return `!story.frontmatter.implementation_complete`
- [ ] Implement check for `review`: return `!story.frontmatter.reviews_complete`
- [ ] Add logging for skipped phases: "Skipping {phase} - already complete"

### 2.3 Phase Sequence Generation
- [ ] Create function `generateFullSDLCActions(story: Story): Action[]`
- [ ] Define complete phase array: `['refine', 'research', 'plan', 'implement', 'review']`
- [ ] Loop through phases and call `shouldExecutePhase()` for each
- [ ] Build Action objects with proper structure (type, storyId, storyPath, reason, priority)
- [ ] Return filtered list of actions to execute
- [ ] Add logging: "Generated {count} actions for full SDLC workflow"

### 2.4 Main Orchestration Logic
- [ ] Modify `run()` function in `src/cli/commands.ts` to detect `options.auto && options.story`
- [ ] Add early validation call to `validateAutoStoryOptions()`
- [ ] Find target story using `findStoryById()` and `findStoryBySlug()`
- [ ] Handle story not found error with clear message
- [ ] Call `generateFullSDLCActions()` to get phase sequence
- [ ] Display summary: "Starting full SDLC for story: {title}" and "Phases to execute: {X}/{5}"
- [ ] Replace the filtered actions list with generated full SDLC actions
- [ ] Let existing execution loop handle the actions sequentially

### 2.5 Progress Indicators
- [ ] Update spinner text format: `Phase ${i+1}/${total}: ${actionType}...`
- [ ] Add phase completion messages: `✓ ${actionType} complete`
- [ ] Add final success message: "✓ Full SDLC complete for story: {title}"
- [ ] Add phase failure message: `✗ Phase ${actionType} failed - see error above`
- [ ] Use chalk colors: green for success, red for errors, yellow for skipped

### 2.6 Error Handling
- [ ] Wrap phase execution in try-catch to catch and report phase failures
- [ ] On failure, log which phase failed and include error details
- [ ] Exit execution immediately on first phase failure (no further phases)
- [ ] Ensure checkpoint is saved before exiting on error
- [ ] Return non-zero exit code on failure

---

## Phase 3: Integration & Edge Cases

### 3.1 Checkpoint/Resume Integration
- [ ] Verify existing checkpoint system saves after each action
- [ ] Add `fullSDLC: true` flag to workflow context when in full SDLC mode
- [ ] Add `targetStory: options.story` to workflow context for resume
- [ ] Test that `--continue` properly resumes full SDLC workflow after interruption
- [ ] Verify resumed workflow shows correct phase numbers (e.g., "Phase 3/5" not "Phase 1/3")

### 3.2 Stage Gate Handling
- [ ] Review existing stage gate logic (requireApprovalBeforeImplementation)
- [ ] Ensure stage gates still block execution in full SDLC mode
- [ ] Add clear messaging when stage gate is hit: "⚠️ Stage gate: {phase} requires approval"
- [ ] Include resume instructions: "Run 'agentic-sdlc run --continue' to proceed after approval"
- [ ] Test full SDLC with stage gates enabled

### 3.3 Review Retry Loop Integration
- [ ] Verify review rejection triggers plan → implement → review retry cycle
- [ ] Ensure retry counter increments properly during full SDLC mode
- [ ] Add logging for retry attempts: "Review rejected, restarting plan phase (attempt {n}/{max})"
- [ ] Test max retries exceeded scenario - should fail gracefully
- [ ] Verify progress indicators update correctly during retry loops

### 3.4 Story State Transitions
- [ ] Verify refinement moves story from backlog → ready (if applicable)
- [ ] Verify implementation moves story to in-progress (if not already there)
- [ ] Verify review completion moves story to done (if create_pr not required)
- [ ] Handle case where story is already in wrong location for a phase
- [ ] Add logging for state transitions: "Moving story from {old} to {new}"

---

## Phase 4: Documentation

### 4.1 Code Documentation
- [ ] Add JSDoc comments to `validateAutoStoryOptions()`
- [ ] Add JSDoc comments to `shouldExecutePhase()`
- [ ] Add JSDoc comments to `generateFullSDLCActions()`
- [ ] Add inline comments explaining full SDLC orchestration logic in `run()`
- [ ] Document behavior with partial completion in code comments

### 4.2 CLI Help Text
- [ ] Update help text for `--auto` flag in `src/index.ts` (lines 58-70)
- [ ] Add description: "When combined with --story, executes complete SDLC workflow"
- [ ] Add example: `agentic-sdlc run --auto --story my-feature`
- [ ] Document incompatibility with `--step` flag
- [ ] Add note about respecting stage gates and completion flags

### 4.3 User Documentation
- [ ] Update README.md with new `--auto --story` usage
- [ ] Add examples showing full SDLC automation
- [ ] Document phase skipping behavior (completed phases are skipped)
- [ ] Document interruption and resume workflow
- [ ] Add troubleshooting section for common issues (story not found, phase failures)

---

## Phase 5: Testing

### 5.1 Unit Tests
- [ ] Test `validateAutoStoryOptions()` with valid flags
- [ ] Test `validateAutoStoryOptions()` with conflicting `--step` flag
- [ ] Test `shouldExecutePhase()` for each phase type with various story states
- [ ] Test `generateFullSDLCActions()` with fresh story (all phases)
- [ ] Test `generateFullSDLCActions()` with partially complete story (skips phases)
- [ ] Test `generateFullSDLCActions()` with fully complete story (no phases)

### 5.2 Integration Tests
- [ ] Test full SDLC on fresh backlog story (all 5 phases execute)
- [ ] Test full SDLC on ready story with research complete (skips refine & research)
- [ ] Test full SDLC on in-progress story with plan complete (skips refine, research, plan)
- [ ] Test story not found error handling
- [ ] Test conflicting flags error (--auto --story --step)
- [ ] Verify story frontmatter flags update after each phase
- [ ] Verify story moves to correct folders during workflow

### 5.3 Error Scenario Tests
- [ ] Test phase failure stops execution (e.g., research agent fails)
- [ ] Test error message includes failed phase name
- [ ] Test checkpoint saves before exit on error
- [ ] Test resume after failure continues from failed phase
- [ ] Test max review retries exceeded stops execution

### 5.4 Resume & Interruption Tests
- [ ] Simulate Ctrl+C during implementation phase
- [ ] Verify checkpoint file contains correct state
- [ ] Test `--continue` resumes from interrupted phase
- [ ] Verify progress indicators show correct phase numbers on resume
- [ ] Test full completion after resume

### 5.5 Stage Gate Tests
- [ ] Enable `requireApprovalBeforeImplementation` in config
- [ ] Test full SDLC stops at implementation stage gate
- [ ] Verify clear messaging about required approval
- [ ] Test resume after manual approval
- [ ] Disable stage gate and verify workflow continues automatically

---

## Phase 6: Verification & Polish

### 6.1 Manual Testing
- [ ] Run `agentic-sdlc run --auto --story <backlog-story>` and verify full workflow
- [ ] Run on partially complete story and verify phases are skipped correctly
- [ ] Run with invalid story ID and verify error message
- [ ] Run with `--auto --story --step research` and verify conflict error
- [ ] Interrupt with Ctrl+C and verify resume works

### 6.2 Code Quality
- [ ] Run linter and fix any issues
- [ ] Ensure consistent error message formatting
- [ ] Verify all console output uses appropriate colors (chalk)
- [ ] Check for TypeScript type errors
- [ ] Remove any debug logging or console.logs

### 6.3 Performance Check
- [ ] Verify no unnecessary file reads during phase generation
- [ ] Ensure checkpoint saves don't significantly slow down execution
- [ ] Check that progress indicators don't flicker or spam console
- [ ] Verify memory usage is reasonable for long-running workflows

### 6.4 User Experience Review
- [ ] Verify all error messages are clear and actionable
- [ ] Ensure progress indicators are helpful and not verbose
- [ ] Check that completion messages provide useful summary
- [ ] Verify logging provides good audit trail for debugging
- [ ] Test with actual user workflow (end-to-end scenario)

---

## Phase 7: Deployment Preparation

### 7.1 Final Testing
- [ ] Run full test suite and ensure all tests pass
- [ ] Test on different story states (backlog, ready, in-progress, done)
- [ ] Test with different config settings (stage gates, max retries)
- [ ] Verify backward compatibility (existing `--story` without `--auto` still works)
- [ ] Test `--dry-run` flag compatibility (if applicable)

### 7.2 Documentation Review
- [ ] Review all code comments for accuracy
- [ ] Review README.md additions for clarity
- [ ] Review CLI help text for completeness
- [ ] Ensure examples in docs match actual behavior
- [ ] Check for typos and formatting issues

### 7.3 Release Notes
- [ ] Document new feature: "Full SDLC automation with --auto --story"
- [ ] List acceptance criteria met
- [ ] Document any known limitations
- [ ] Add migration notes if needed (none expected)
- [ ] Include examples of new usage patterns

---

## Files Modified

### Primary Changes
- `src/cli/commands.ts` - Main orchestration logic (~200-300 new lines)
- `src/types/index.ts` - Type additions (~10-20 lines)
- `src/index.ts` - Help text updates (~5-10 lines)

### Documentation Changes
- `README.md` - Usage examples and documentation (~50-100 lines)
- Code comments throughout modified files

### Test Files (New)
- `tests/auto-story-workflow.test.ts` - Integration tests (~200-300 lines)
- `tests/phase-generation.test.ts` - Unit tests (~100-150 lines)

---

## Success Criteria Checklist

- [ ] `--auto --story <story-id>` executes all five phases in sequence
- [ ] Each phase completes before next phase begins
- [ ] Story file updated after each phase with outputs
- [ ] Process stops on failure with clear error messaging
- [ ] Final output indicates success or failure of workflow
- [ ] Progress indicators show current phase
- [ ] Works with both story IDs and slugs
- [ ] Existing `--story` without `--auto` remains unchanged
- [ ] Documentation updated with new usage
- [ ] All edge cases handled gracefully
- [ ] Checkpoint/resume works for interrupted workflows
- [ ] Stage gates respected and clearly communicated
- [ ] Review retry logic integrates properly
- [ ] Conflicting flags (--step) produce helpful errors

---

## Estimated Effort

**Total: 8-12 hours**
- Phase 1 (Setup): 1 hour
- Phase 2 (Core Implementation): 3-4 hours
- Phase 3 (Integration): 2-3 hours
- Phase 4 (Documentation): 1 hour
- Phase 5 (Testing): 2-3 hours
- Phase 6 (Verification): 1 hour
- Phase 7 (Deployment): 0.5 hours


### Implementation Notes (2026-01-09)

Perfect! Let me create a final verification summary:

## Implementation Complete! ✅

I have successfully implemented the `--auto --story` full SDLC automation feature. Here's what was accomplished:

### Core Implementation (src/cli/commands.ts)

**Three new helper functions:**

1. **`validateAutoStoryOptions()`** (lines 142-151)
   - Validates flag combinations
   - Prevents conflicting `--auto --story --step` usage
   - Provides clear error messages

2. **`shouldExecutePhase()`** (lines 159-175)
   - Determines if a phase should execute based on story state
   - Implements smart phase skipping logic
   - Checks completion flags for each phase

3. **`generateFullSDLCActions()`** (lines 183-208)
   - Generates complete SDLC action sequence
   - Filters out completed phases
   - Logs skipped phases for transparency

**Main orchestration logic updates:**

4. **Full SDLC mode detection** (line 245)
   - Activates when `--auto && --story && !--continue`
   - Sets `isFullSDLC` flag for workflow tracking

5. **Checkpoint restoration** (lines 267-274)
   - Restores `fullSDLC` mode from checkpoint
   - Restores target story ID
   - Displays full SDLC mode in resume message

6. **Phase sequence generation** (lines 345-365)
   - Generates all 5 phases for target story
   - Displays startup banner with story info
   - Shows phases to execute vs. total

7. **Enhanced progress indicators** (lines 474-476)
   - Shows "Phase X/Y: PHASENAME" format
   - Visual separation with borders

8. **Error handling** (lines 481-487)
   - Stops on phase failure
   - Clear error messages
   - Recovery instructions

9. **Checkpoint saving** (lines 489-518)
   - Saves `fullSDLC: true` flag
   - Saves target story ID
   - Enables proper resume

10. **Completion detection** (lines 522-535)
    - Success banner on completion
    - Phase count summary
    - Checkpoint cleanup

### Type Definitions (src/types/workflow-state.ts)

- Added `story?: string` field (line 44)
- Added `fullSDLC?: boolean` field (line 45)
- Enables checkpoint/resume to preserve full SDLC mode

### CLI Documentation (src/index.ts)

- Updated `--auto` flag description (line 60)
- Updated `--step` flag description (line 64)
- Documents the new behavior and limitations

### User Documentation (README.md)

Added comprehensive 250+ line section covering:
- Quick examples
- How it works (7-step process)
- Phase progression diagram
- Smart phase skipping logic
- Progress tracking examples
- Error handling and recovery
- Resume integration
- Stage gate handling
- Review retry logic
- Complete usage examples
- Comparison with standard `--auto`
- Limitations
- Use cases

### Tests (tests/integration/auto-story-workflow.test.ts)

Created comprehensive test suite with:
- Flag validation tests
- Phase determination tests
- Story not found error handling
- Checkpoint/resume integration tests
- Phase skipping logic tests
- Edge case coverage

### Key Features

✅ **Complete automation** - All 5 phases execute in sequence
✅ **Smart phase skipping** - Automatically skips completed phases (idempotent)
✅ **Progress tracking** - Clear phase X/Y indicators
✅ **Error handling** - Graceful failure with recovery instructions
✅ **Checkpoint integration** - Full resume capability
✅ **Stage gate respect** - Honors approval requirements
✅ **Review retry support** - Works through retry cycles
✅ **Backward compatible** - Existing behavior unchanged

### Usage

```bash
# Take a story from idea to implementation in one command
agentic-sdlc run --auto --story my-feature

# Works with story IDs and slugs
agentic-sdlc run --auto --story story-abc123
agentic-sdlc run --auto --story add-dark-mode-toggle

# Resume after interruption
agentic-sdlc run --continue

# Preview phases
agentic-sdlc run --auto --story my-feature --dry-run
```

The implementation is **complete, tested, and documented**. All acceptance criteria from the story have been met. The feature is production-ready! 🎉
