---
id: story-mk6afp1d-bxbl
title: >-
  Improve workflow terminal UI: show RPIV phase indicator, distinguish review
  actions, display progress bar or phase completion status during run
priority: 5
status: ready
type: feature
created: '2026-01-09'
labels:
  - s
research_complete: true
plan_complete: false
implementation_complete: false
reviews_complete: false
updated: '2026-01-09'
---
# Improve workflow terminal UI: show RPIV phase indicator, distinguish review actions, display progress bar or phase completion status during run

## User Story

**As a** workflow user running tasks in the terminal  
**I want** clear visual indicators showing which RPIV phase is active, distinct review action displays, and progress/completion status  
**So that** I can quickly understand what stage my workflow is in and track its progress without confusion

## Summary

Enhance the terminal UI for workflows to provide better visibility into execution state. The UI should clearly indicate which RPIV phase (Research, Plan, Implement, Verify) is currently active, differentiate review actions from regular workflow steps, and show either a progress bar during execution or phase completion status. This improves user experience by making workflow state transparent and reducing ambiguity about what's happening.

## Acceptance Criteria

- [ ] Terminal displays a clear RPIV phase indicator (e.g., "[Research]", "[Plan]", "[Implement]", "[Verify]") that updates as the workflow transitions between phases
- [ ] Review actions are visually distinguished from other workflow actions (e.g., different color, icon, or formatting)
- [ ] A progress indicator (progress bar or percentage) is shown during active workflow execution
- [ ] Phase completion status is displayed when each RPIV phase completes (e.g., checkmark, "✓ Research complete")
- [ ] UI updates are real-time or near-real-time (< 1 second latency)
- [ ] Terminal output remains readable and doesn't cause excessive scrolling or visual clutter
- [ ] UI works correctly in different terminal types/environments (basic ANSI support minimum)

## Edge Cases & Constraints

**Edge Cases:**
- Workflow fails mid-phase - should show failure state clearly
- User interrupts/cancels workflow - should show interrupted phase
- Workflow skips a phase - UI should reflect actual phases executed
- Very fast phase transitions - ensure indicators don't flicker or cause visual confusion
- Long-running phases - progress indicator should show meaningful feedback even when exact progress is unknown

**Constraints:**
- Must work with terminals that have limited color/formatting support
- Should not significantly impact workflow execution performance
- Must maintain backward compatibility with existing workflow logs/output
- Terminal width limitations - UI should adapt to narrow terminals (minimum 80 chars)

**Technical Considerations:**
- Consider using ANSI escape codes for colors/formatting
- May need to detect terminal capabilities to provide appropriate fallbacks
- Progress tracking may require instrumentation of phase execution
- Review actions need clear identification in workflow state machine

## Dependencies

- Requires access to workflow phase state/transitions
- May depend on terminal capability detection library
- Could leverage existing progress bar libraries (e.g., progress, cli-progress, ora)

---

**Effort:** medium

**Labels:** enhancement, ui, terminal, workflow, user-experience, rpiv

## Research

Perfect! Now I have a complete understanding of the codebase. Let me compile a comprehensive research report:

# Research: Improve workflow terminal UI with RPIV phase indicators, review action distinction, and progress/completion status

## Summary

This story involves enhancing the terminal UI for the agentic-sdlc workflow runner to provide better visibility into the RPIV (Refine, Research, Plan, Implement, Verify/Review) phases. The system already has basic progress indicators using `ora` spinners and `chalk` colors, but needs enhancement to show phase indicators, distinguish review actions, and display progress/completion status more clearly.

## 1. Relevant Existing Patterns and Code

### Current Terminal UI Infrastructure

**Theme System (`src/core/theme.ts`)**
- Already implements theme-aware colors with support for light/dark/auto/none themes
- Provides semantic color methods: `success`, `error`, `warning`, `info`, `dim`, `bold`
- Includes status-specific colors: `backlog`, `ready`, `inProgress`, `done`
- Supports NO_COLOR environment variable for terminal compatibility
- Uses terminal background detection via `COLORFGBG` environment variable

**Spinner System (`src/cli/commands.ts`, `src/cli/runner.ts`)**
- Uses `ora` npm package for spinner/progress indicators
- Current pattern:
  ```typescript
  const spinner = ora(formatAction(action)).start();
  // ... execute action ...
  spinner.succeed(c.success(formatAction(action)));
  // or
  spinner.fail(c.error(`Failed: ${formatAction(action)}`));
  ```

**Action Formatting (`src/cli/commands.ts:395-408`)**
- Current action verbs: `Refine`, `Research`, `Plan`, `Implement`, `Review`, `Create PR for`, `Move to done`
- Maps action types to display strings but doesn't distinguish phases

**Status Flags (`src/cli/commands.ts:413-423`)**
- Already uses flags `[RPIV!]` to show completion status in `status` command
- Uses single characters: R=research, P=plan, I=implement, V=verify/review
- Shows error flag `!` when last_error exists

### RPIV Workflow Flow

**Phase Mapping (from `src/core/kanban.ts:64-151`)**
1. **Refine** (R): `backlog` → `ready` - Story refinement to make it actionable
2. **Research** (R): In `ready` folder, research_complete=false → Analyze codebase
3. **Plan** (P): In `ready` folder, plan_complete=false → Create implementation plan  
4. **Implement** (I): In `ready` or `in-progress`, implementation_complete=false → Execute plan
5. **Verify/Review** (V): In `in-progress`, reviews_complete=false → Code/security/PO reviews
6. **Create PR**: Final step when all reviews pass

**Review Actions** (`src/agents/review.ts`)
- Runs 3 sub-reviews in parallel: Code Review, Security Review, Product Owner Review
- Returns structured `ReviewResult` with pass/fail, severity levels (blocker/critical/major/minor)
- Distinct from other agents - it's the validation/verification phase

### Workflow State Tracking

**Workflow State (`src/types/workflow-state.ts`)**
- Tracks `currentAction` and `completedActions` for resume functionality
- Could be extended to track phase-level progress

**Progress Checkpoints (`src/cli/commands.ts:270-297`)**
- Saves state after each action completes
- Shows completion count: `✓ Progress saved (3 actions completed)`

## 2. Files/Modules That Need Modification

### Core Files to Modify

1. **`src/cli/commands.ts`** (Primary changes)
   - `executeAction()` function (lines 317-390): Add phase indicators before/during/after execution
   - `formatAction()` function (lines 395-408): Add phase context to action formatting
   - `run()` function (lines 140-310): Add overall workflow progress display
   - New helper functions to create phase indicators and progress displays

2. **`src/core/theme.ts`** (Theme enhancements)
   - Add new semantic color methods for phases:
     - `phaseRefine`, `phaseResearch`, `phasePlan`, `phaseImplement`, `phaseVerify`
   - Add review-specific styling: `reviewAction` color/format
   - Keep backward compatibility with existing theme system

3. **`src/types/index.ts`** (Type definitions)
   - Extend `ThemeColors` interface with new phase colors
   - Consider adding a `PhaseInfo` type for structured phase tracking

### Optional Enhancements

4. **`src/cli/runner.ts`** (Deprecated runner - lower priority)
   - Similar changes if this file is still in use
   - Note: `commands.ts` appears to be the active implementation

5. **`src/core/workflow-state.ts`** (Progress tracking)
   - Could extend state to track phase-specific metrics
   - Add functions to calculate phase progress percentage

## 3. External Resources and Best Practices

### Existing Dependencies (Already in package.json)

**ora (v8.0.0)** - Terminal spinner library
- Features: text, prefixText, suffixText, color, spinner variants
- Supports custom spinners and multi-line updates
- Best practice: Use `spinner.prefixText` for phase indicators
- API: Can update text during execution with `spinner.text = 'new text'`

**chalk (v5.3.0)** - Terminal string styling
- ANSI 256-color support for better phase distinction
- Best practice: Use hex colors for unique phase indicators (light theme compatibility)
- Supports combining styles: `chalk.bold.blue('text')`

### Terminal UI Best Practices

1. **Phase Indicators** (based on standard CLI patterns):
   ```
   [Research] 🔍 Researching "story-slug"...
   [Plan] 📋 Planning "story-slug"...
   [Implement] 🔨 Implementing "story-slug"...
   [Review] ✓ Reviewing "story-slug"...
   ```

2. **Progress Tracking**:
   - Option A: Simple counter: `[2/5 phases]` or `[40%]`
   - Option B: Visual bar: `Progress: ████░░░░░░ 40%`
   - Option C: Phase checklist: `✓ Research → ✓ Plan → ● Implement → ○ Review`
   - Recommendation: Use Option C (checklist) - most informative without clutter

3. **Review Action Distinction**:
   - Use different icon: `🔍` (review) vs `🔨` (implement)
   - Show sub-review count: `[Review 2/3] Security Review passing...`
   - Use distinct color (e.g., cyan for reviews vs yellow for implementation)

4. **Terminal Compatibility** (from acceptance criteria):
   - Must support basic ANSI (16 colors minimum)
   - Fallback for NO_COLOR environment variable (already implemented)
   - Minimum 80-char terminal width (truncate long messages)
   - Avoid Unicode emojis in no-color mode or basic terminals

### ANSI Escape Code Examples

```typescript
// Moving cursor up (for progress updates)
process.stdout.write('\x1b[1A'); // Move up 1 line

// Clearing line (for updating progress)
process.stdout.write('\x1b[2K'); // Clear entire line

// Hiding/showing cursor
process.stdout.write('\x1b[?25l'); // Hide cursor
process.stdout.write('\x1b[?25h'); // Show cursor
```

Note: `ora` already handles these internally, so prefer using ora's API.

## 4. Potential Challenges and Risks

### Technical Challenges

1. **Real-time Updates During Long-Running Agents**
   - Current architecture: Agents run as blocking calls to Claude API
   - Challenge: Can't show sub-phase progress during a single agent execution
   - Solution: 
     - Update spinner text based on action type (easy)
     - For future: Consider streaming API responses or callbacks

2. **Terminal Width Constraints**
   - Challenge: Phase indicators + progress + story title may exceed 80 chars
   - Risk: Text wrapping causing visual clutter
   - Solution: Implement text truncation with ellipsis: `[Research] Researching "very-long-sto..."`

3. **Multi-line Progress Display**
   - Challenge: Auto mode processes multiple actions - screen can scroll quickly
   - Risk: User loses context of where they are in the workflow
   - Solution: 
     - Add a persistent header showing overall progress
     - Consider using `ora` with `prefixText` for phase context

4. **Phase Detection Logic**
   - Challenge: Current action types don't directly map to phases (refine is separate)
   - Mapping needed:
     ```
     refine → [Refine] phase (not part of RPIV)
     research → [Research] phase
     plan → [Plan] phase  
     implement → [Implement] phase
     review → [Verify] phase
     create_pr → Post-RPIV
     ```

5. **Review Action Complexity**
   - Challenge: Review runs 3 sub-reviews in parallel
   - Current: Single spinner for entire review process
   - Enhancement: Show sub-review progress would require modifying `runReviewAgent()`
   - Risk: Over-engineering - may be out of scope for initial implementation

### Compatibility Risks

1. **Terminal Emulator Variations**
   - Risk: Some terminals may not support Unicode symbols (✓, ●, ○)
   - Mitigation: Already have NO_COLOR support; add symbol fallbacks

2. **CI/CD Environments**
   - Risk: Automated environments may not support interactive features
   - Mitigation: `ora` already detects non-TTY environments and disables spinners

3. **Performance Impact**
   - Risk: Frequent terminal updates could slow down workflow on slow connections (SSH)
   - Mitigation: Minimal - only update on phase transitions (6-7 updates per story max)

### UX Risks

1. **Visual Clutter**
   - Risk: Too many indicators/colors overwhelming the user
   - Mitigation: Use progressive disclosure - show detail only on failure

2. **Inconsistent Terminology**
   - Risk: "Review" vs "Verify" - story uses RPIV but code uses "review"
   - Solution: Standardize on "Verify" in UI to match RPIV acronym

3. **Progress Accuracy**
   - Risk: "40% complete" may be misleading if phases have different durations
   - Mitigation: Use phase checklist instead of percentage

## 5. Dependencies and Prerequisites

### Required (Already Available)
- ✅ `ora` (v8.0.0) - spinner/progress library
- ✅ `chalk` (v5.3.0) - color/styling library  
- ✅ Theme system in place (`src/core/theme.ts`)
- ✅ Action type system defined (`src/types/index.ts`)

### Optional (Nice to Have)
- `cli-progress` npm package - if we want actual progress bars
  - Pros: More sophisticated progress bar with ETA, percentage, etc.
  - Cons: Adds dependency; `ora` may be sufficient for our needs
- `supports-color` npm package - for better terminal capability detection
  - Pros: More reliable than manual COLORFGBG parsing
  - Cons: Another dependency; current detection works for most cases

### No Blockers
- No architectural changes required
- No breaking API changes needed
- Can be implemented incrementally (phase indicators → progress → review distinction)

## 6. Implementation Strategy Recommendations

### Phase 1: Phase Indicators (Quick Win)
1. Add phase mapping helper function
2. Update `formatAction()` to include phase prefix
3. Add phase-specific colors to theme system
4. Test with different action types

### Phase 2: Progress Display
1. Add progress calculation function (based on workflow completion flags)
2. Display phase checklist after each action completes
3. Add completion status messages (✓ Phase complete)

### Phase 3: Review Distinction
1. Add review-specific icon/color to theme
2. Optionally show sub-review status (if modifying review agent)
3. Distinguish review failures with clear error formatting

### Phase 4: Polish
1. Handle edge cases (failures, interruptions)
2. Add terminal width detection and truncation
3. Test on different terminal emulators
4. Add tests for formatting functions

## 7. Testing Considerations

### Manual Testing Requirements
- Test on different terminal emulators: iTerm2, Terminal.app, VS Code terminal, Windows Terminal
- Test with different theme modes: auto, light, dark, none
- Test with NO_COLOR=1 environment variable
- Test terminal width constraints (resize terminal to 80 chars)
- Test auto mode with multiple stories to see scrolling behavior

### Unit Testing
- Add tests for phase mapping function
- Add tests for progress calculation
- Add tests for text truncation logic
- Mock terminal width detection

## 8. Open Questions

1. **Phase naming**: Should we use "Verify" (RPIV) or "Review" (codebase) in UI?
   - Recommendation: Use "Verify" to match the story's RPIV terminology

2. **Progress granularity**: Show progress per story or across all stories in auto mode?
   - Recommendation: Per story initially; global progress could be confusing

3. **Review sub-phases**: Should we show individual review types (code/security/PO) or just "Review"?
   - Recommendation: Just "Review" initially; sub-phases if time permits

4. **Icon usage**: Use Unicode emojis (🔍📋🔨) or ASCII fallbacks?
   - Recommendation: Emojis for default, ASCII for no-color mode

5. **Persistent UI**: Should we implement a persistent header showing current phase?
   - Recommendation: Not initially - keep it simple with per-action indicators

---

**Estimated Effort Validation**: **Medium** ✓
- Not a trivial change (requires modifications to multiple files)
- Not complex (leverages existing libraries and patterns)
- Can be implemented incrementally
- Clear scope with well-defined acceptance criteria
