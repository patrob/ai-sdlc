# Implementation Plan: Resume Work in Existing Worktree - Review Fixes

## Overview
This plan addresses the critical review findings from the unified collaborative review, focusing on:
1. **BLOCKER**: Creating integration tests (Phase 5 from original plan)
2. **CRITICAL**: Implementing missing acceptance criteria (auto-recreation, done story warnings, interactive recovery, story sync)
3. **MAJOR**: Fixing code duplication, security validation, and test gaps
4. **MINOR**: Improving consistency and documentation

---

## Phase 1: Critical Security & Validation Fixes

### T26: Add worktree path security validation
- [ ] **T26**: Add security validation for `worktree_path` to prevent directory traversal attacks
  - Files: `src/cli/commands.ts`
  - Dependencies: none
  - Add validation before line 1049 to ensure `existingWorktreePath` is within configured base directory
  - Use `path.resolve()` to get absolute paths and verify prefix match
  - Throw clear error if path is outside expected boundary
  - Add unit test for malicious paths (`/etc/hosts`, `../../../sensitive`, etc.)

### T27: Add divergence threshold constant
- [ ] **T27**: Extract magic number 10 to named constant with documentation
  - Files: `src/cli/commands.ts`
  - Dependencies: none
  - Add `const DIVERGENCE_WARNING_THRESHOLD = 10` at top of file with comment explaining rationale
  - Replace hardcoded values at lines 1121 and 1216 with constant
  - Consider moving to config file for user customization

---

## Phase 2: Automatic Worktree Recreation

### T28: Implement automatic worktree recreation logic
- [ ] **T28**: Add automatic recreation when directory missing but branch exists
  - Files: `src/cli/commands.ts`
  - Dependencies: T26
  - Modify validation failure handling (lines 1057-1065)
  - When `validation.requiresRecreation === true` AND branch exists, call `worktreeService.create()`
  - Log recreation event clearly: "Worktree directory was missing, automatically recreated"
  - Update `worktree_path` in story frontmatter if path changed
  - Only require manual intervention if BOTH directory AND branch are gone

### T29: Add recreation scenario to unit tests
- [ ] **T29**: Add test cases for automatic recreation
  - Files: `src/core/worktree.test.ts`
  - Dependencies: T28
  - Test case: directory deleted, branch exists → validates with `requiresRecreation: true`
  - Test case: both directory and branch deleted → validates with `canResume: false`
  - Test case: successful recreation updates frontmatter

---

## Phase 3: "Done" Story Worktree Warnings

### T30: Add done story worktree detection
- [ ] **T30**: Warn when resuming worktree for story with status='done'
  - Files: `src/cli/commands.ts`
  - Dependencies: none
  - Add check after line 1048: `if (targetStory.frontmatter.status === 'done' && existingWorktreePath)`
  - Display warning: "Story is marked as done but has an existing worktree. This may be stale."
  - Add `--force-resume` flag to allow explicit override
  - Without flag, prompt user: "Do you want to continue? (y/N)"
  - Log warning event

### T31: Add done story tests
- [ ] **T31**: Add test coverage for done story scenarios
  - Files: `src/core/worktree.test.ts` or integration test
  - Dependencies: T30
  - Test: done story with worktree → displays warning
  - Test: done story with --force-resume flag → proceeds without prompt
  - Test: done story, user declines → exits gracefully

---

## Phase 4: Interactive Recovery Options

### T32: Add helper function for interactive recovery prompts
- [ ] **T32**: Create `promptWorktreeRecovery()` helper function
  - Files: `src/cli/commands.ts` (extract to helper) or `src/core/worktree.ts`
  - Dependencies: none
  - Function signature: `promptWorktreeRecovery(validation: WorktreeResumeValidationResult, path: string): Promise<'recreate' | 'manual' | 'abort'>`
  - Display options: 1) Remove and recreate (warns about uncommitted changes), 2) Fix manually, 3) Abort
  - Use Node.js `readline` or existing prompt utility
  - Return user's choice

### T33: Integrate recovery prompts into validation failure handling
- [ ] **T33**: Replace error exits with recovery prompts
  - Files: `src/cli/commands.ts`
  - Dependencies: T32
  - Replace lines 1058-1064 with call to `promptWorktreeRecovery()`
  - Implement handlers for each option:
    - 'recreate': Remove worktree (`git worktree remove --force`), create new one
    - 'manual': Display instructions, exit gracefully
    - 'abort': Exit with code 0 (not an error)
  - Apply same pattern to lines 1156-1162

### T34: Add tests for interactive recovery
- [ ] **T34**: Test recovery prompt scenarios
  - Files: New file `src/core/worktree-recovery.test.ts`
  - Dependencies: T32, T33
  - Mock readline/prompt to simulate user choices
  - Test each recovery path: recreate, manual, abort
  - Verify git commands called correctly for 'recreate' option
  - Test that abort doesn't leave system in broken state

---

## Phase 5: Story File Sync to Main Branch

### T35: Implement story sync after phase completion
- [ ] **T35**: Add story file sync from worktree back to main branch
  - Files: `src/cli/runner.ts` or `src/cli/commands.ts`
  - Dependencies: none
  - After successful action execution in worktree, copy updated story file to main branch
  - Add function: `syncStoryToMain(storyId: string, worktreePath: string, mainPath: string)`
  - Use git to copy file: `git show main:.ai-sdlc/stories/S-XXXX/story.md > temp` then compare and update
  - Alternative: Use fs.copyFileSync with proper conflict detection
  - Log sync event: "Synced story updates from worktree to main branch"

### T36: Add sync validation and conflict detection
- [ ] **T36**: Handle conflicts when syncing story file
  - Files: Same as T35
  - Dependencies: T35
  - Before overwriting, check if main branch story has been modified (compare timestamps or hashes)
  - If conflict detected, prompt user: "Story file changed in both locations. Which to keep?"
  - Options: Keep worktree version, Keep main version, Merge manually
  - Fail safely: never lose data silently

### T37: Add story sync tests
- [ ] **T37**: Test story sync scenarios
  - Files: `tests/integration/worktree-story-sync.test.ts` (new file)
  - Dependencies: T35, T36
  - Test: successful sync after phase completion
  - Test: sync detects no changes (no-op scenario)
  - Test: sync detects conflict, prompts user
  - Test: sync updates completion flags correctly
  - Mock git and fs operations

---

## Phase 6: Code Quality - DRY Refactoring

### T38: Extract shared resumption logic into helper
- [ ] **T38**: Refactor duplicate resume code (lines 1047-1127 and 1145-1221)
  - Files: `src/cli/commands.ts`
  - Dependencies: none
  - Create helper function: `async function resumeInWorktree(params: ResumeWorktreeParams): Promise<ResumeWorktreeResult>`
  - Extract common logic: validation, phase detection, status display, divergence check, logging
  - Interface `ResumeWorktreeParams`: `{ worktreeService, worktreePath, branchName, targetStory, sdlcRoot, shouldSyncFrontmatter }`
  - Interface `ResumeWorktreeResult`: `{ success: boolean, updatedStory: Story, uncommittedChanges: boolean }`
  - Call helper from both locations (lines 1047 and 1145)

### T39: Standardize error messaging format
- [ ] **T39**: Unify validation error message format
  - Files: `src/cli/commands.ts`
  - Dependencies: T38
  - Extract error display into helper: `displayWorktreeValidationErrors(validation, worktreePath)`
  - Standardize format: "Cannot resume worktree at {path}:"
  - Use consistent color scheme and indentation
  - Remove format inconsistency between lines 1058 and 1156

---

## Phase 7: Integration Tests (BLOCKER Resolution)

### T40: Create integration test file structure
- [ ] **T40**: Set up `tests/integration/worktree-resume.test.ts`
  - Files: `tests/integration/worktree-resume.test.ts` (new file)
  - Dependencies: none
  - Copy test setup pattern from `worktree-workflow.test.ts`
  - Create helper functions:
    - `createMockStoryWithPhase(phase: string)` - Returns story at specific completion state
    - `simulateInterruptedWorkflow(phase: string)` - Sets up worktree environment
    - `simulateUncommittedChanges(files: string[])` - Mocks git status with changes
    - `mockWorktreeExists(path: string, valid: boolean)` - Configures fs and git mocks

### T41: Test happy path resume scenarios
- [ ] **T41**: Write tests for successful resume at each phase
  - Files: `tests/integration/worktree-resume.test.ts`
  - Dependencies: T40
  - Test: Resume after interrupted research phase → displays "Last completed: none, Next: research"
  - Test: Resume after completed research → displays "Last completed: research, Next: plan"
  - Test: Resume after completed plan → displays "Last completed: plan, Next: implement"
  - Test: Resume after completed implementation → displays "Last completed: implementation, Next: review"
  - Mock `run()` command, verify phase detection and display output
  - Verify `process.chdir()` called with worktree path

### T42: Test uncommitted changes preservation
- [ ] **T42**: Test that resume preserves uncommitted work
  - Files: `tests/integration/worktree-resume.test.ts`
  - Dependencies: T40, T41
  - Create scenario: worktree has 3 modified files and 2 untracked files
  - Mock git status to return these files
  - Call resume flow
  - Verify:
    - No `git reset` or `git clean` commands executed
    - Uncommitted changes displayed in output
    - Files list matches git status output
  - This addresses CRITICAL review finding about preservation testing

### T43: Test missing branch recreation
- [ ] **T43**: Test automatic recreation when branch missing
  - Files: `tests/integration/worktree-resume.test.ts`
  - Dependencies: T40, T28
  - Mock scenario: directory exists, branch deleted (`git rev-parse` fails)
  - Verify `worktreeService.create()` called to recreate
  - Verify frontmatter updated with new path
  - Verify success message includes "recreated"

### T44: Test missing directory handling
- [ ] **T44**: Test recreation when directory deleted
  - Files: `tests/integration/worktree-resume.test.ts`
  - Dependencies: T40, T28
  - Mock scenario: `fs.existsSync(worktreePath)` returns false, branch exists
  - Verify automatic recreation triggered
  - Verify no error exit
  - Verify new directory created

### T45: Test corrupted story file fallback
- [ ] **T45**: Test fallback when story file missing/corrupted in worktree
  - Files: `tests/integration/worktree-resume.test.ts`
  - Dependencies: T40
  - Mock: `findStoryById()` throws error or returns null
  - Verify: fallback to main branch story file
  - Verify: warning logged about corruption
  - Verify: workflow continues successfully

### T46: Test stale frontmatter sync
- [ ] **T46**: Test auto-sync when worktree_path is missing from frontmatter
  - Files: `tests/integration/worktree-resume.test.ts`
  - Dependencies: T40
  - Mock: story has `worktree_path: null` but `worktreeService.findByStoryId()` finds existing worktree
  - Verify: `updateStoryField()` called with correct path
  - Verify: `writeStory()` called to persist update
  - Verify: message includes "(Worktree path synced to story frontmatter)"

### T47: Test diverged branch warning
- [ ] **T47**: Test warning display when branch diverged significantly
  - Files: `tests/integration/worktree-resume.test.ts`
  - Dependencies: T40
  - Mock: `checkBranchDivergence()` returns `{ ahead: 15, behind: 12, diverged: true }`
  - Verify: warning message displayed with counts
  - Verify: suggestion to rebase included
  - Test threshold boundary: 10 commits should warn, 9 should not

### T48: Test done story warning
- [ ] **T48**: Test warning when story status is 'done' but worktree exists
  - Files: `tests/integration/worktree-resume.test.ts`
  - Dependencies: T40, T30
  - Mock: story with `status: 'done'` and `worktree_path` set
  - Verify: warning displayed about stale worktree
  - Verify: prompt for user confirmation
  - Test both user choices: proceed (y) and abort (N)

### T49: Test validation failure scenarios
- [ ] **T49**: Test error handling for invalid worktrees
  - Files: `tests/integration/worktree-resume.test.ts`
  - Dependencies: T40, T33
  - Test case: Both directory and branch missing → displays error, offers recovery
  - Test case: Story directory not accessible → displays error
  - Test case: Git command failures → graceful error handling
  - Verify recovery prompt called in each scenario

---

## Phase 8: Enhanced Unit Tests

### T50: Add test for implementation_complete with failing tests edge case
- [ ] **T50**: Test that failing tests prevent skipping to review phase
  - Files: `src/core/worktree.test.ts`
  - Dependencies: none
  - Test scenario: story has `implementation_complete: true` but tests failing
  - Current behavior: `getNextPhase()` returns 'review' (may be incorrect)
  - Expected behavior: Should detect test failures and return 'implement'
  - NOTE: This may reveal design gap - `getNextPhase()` doesn't check test status
  - If gap found, update function to accept test results parameter

### T51: Add worktree path security validation tests
- [ ] **T51**: Test security validation for malicious paths
  - Files: `src/cli/commands.test.ts` (new file or add to existing)
  - Dependencies: T26
  - Test cases:
    - Path outside base directory: `/etc/hosts` → rejected
    - Relative path traversal: `../../../sensitive` → rejected
    - Path within base directory: `/project/.ai-sdlc/worktrees/S-0001` → accepted
    - Symlink attacks (if applicable) → rejected
  - Verify error message clearly indicates security validation failure

---

## Phase 9: Testing & Verification

### T52: Run full test suite and fix failures
- [ ] **T52**: Execute `npm test` and address any failures
  - Files: Various (as needed)
  - Dependencies: T26-T51
  - Run tests locally, identify failures
  - Debug and fix each failure
  - Ensure new tests don't break existing tests
  - Verify test coverage for new code >80%

### T53: Run build and lint checks
- [ ] **T53**: Execute `npm run build` and linting
  - Files: Various (as needed)
  - Dependencies: T52
  - Fix TypeScript compilation errors
  - Address linting warnings (especially unused imports after refactoring)
  - Verify all new interfaces exported properly

### T54: Run make verify
- [ ] **T54**: Execute `make verify` to ensure all quality gates pass
  - Files: N/A
  - Dependencies: T53
  - Address any verification failures
  - Ensure code follows CLAUDE.md conventions
  - Check for temporary files created during testing

### T55: Manual end-to-end testing
- [ ] **T55**: Perform manual testing of resume scenarios
  - Files: N/A (manual testing)
  - Dependencies: T54
  - Test real workflow interruption (Ctrl+C during implementation)
  - Test resuming with real uncommitted changes
  - Test done story warning with actual completed story
  - Test diverged branch warning after making commits
  - Test recovery prompts with actual invalid worktrees
  - Document any unexpected behaviors

---

## Phase 10: Documentation & Cleanup

### T56: Update story file with final status
- [ ] **T56**: Update story document with implementation results
  - Files: `.ai-sdlc/stories/S-0063-resume-work-existing-worktree.md`
  - Dependencies: T55
  - Mark all acceptance criteria as completed
  - Document any deviations or discovered design gaps
  - Update frontmatter: `implementation_complete: true`, `reviews_complete: false`
  - Remove outdated "Implementation Complete" sections
  - Add "Final Implementation Notes" with summary of changes

### T57: Review code comments and documentation
- [ ] **T57**: Ensure all new code is properly documented
  - Files: `src/cli/commands.ts`, `src/core/worktree.ts`, test files
  - Dependencies: T56
  - Add JSDoc comments to new public functions
  - Document complex logic with inline comments
  - Update README if user-facing changes made
  - Document security validation rationale

---

## Summary

**Total Tasks**: 32 new tasks (T26-T57)
**Estimated Effort**: Large (addresses 1 BLOCKER, 4 CRITICAL, 5 MAJOR, 3 MINOR issues)

### Critical Path
T26 → T27 → T28 → T30 → T32 → T33 → T35 → T38 → T40 → T41 → T42 → [T43-T49 parallel] → T52 → T53 → T54 → T55 → T56

### Files to Create
- `tests/integration/worktree-resume.test.ts` - **BLOCKER resolution**
- `tests/integration/worktree-story-sync.test.ts` - Story sync testing
- `src/core/worktree-recovery.test.ts` - Recovery prompt testing
- `src/cli/commands.test.ts` - Security validation testing (if not exists)

### Files to Modify (Major Changes)
- `src/cli/commands.ts` - Security validation, auto-recreation, done story warnings, interactive recovery, refactoring for DRY
- `src/core/worktree.ts` - Helper functions for recovery
- `src/cli/runner.ts` or `src/cli/commands.ts` - Story sync to main branch
- `src/core/worktree.test.ts` - Enhanced unit tests

### Key Review Issues Addressed
✅ **BLOCKER**: Integration tests created (T40-T49)
✅ **CRITICAL #1**: Uncommitted changes preservation tested (T42)
✅ **CRITICAL #2**: Auto-recreation implemented (T28-T29)
✅ **CRITICAL #3**: Done story warnings implemented (T30-T31)
✅ **CRITICAL #4**: Interactive recovery options (T32-T34)
✅ **MAJOR #1**: Story sync to main (T35-T37)
✅ **MAJOR #2**: DRY refactoring (T38-T39)
✅ **MAJOR #3**: Test edge case coverage (T50)
✅ **MAJOR #4**: Security validation (T26, T51)
✅ **MAJOR #5**: Uncommitted changes conflicts - documented as follow-up
✅ **MINOR #1**: Error message consistency (T39)
✅ **MINOR #2**: Magic number extraction (T27)
✅ **MINOR #3**: Workflow state logging - documented as follow-up

### Out of Scope (Deferred to Future Stories)
- Automatic stashing of conflicting uncommitted changes (MAJOR #5) - Requires UX design
- .workflow-state.json timestamp tracking (MINOR #3) - workflow-state.json not fully defined yet
- Test status checking in getNextPhase() (T50) - May require architecture discussion
