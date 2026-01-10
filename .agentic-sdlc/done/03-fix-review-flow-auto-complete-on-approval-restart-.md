---
id: story-mk69q4nc-m3vp
title: >-
  Fix review flow: auto-complete on approval, restart RPIV on rejection, with
  configurable max retries (default 3)
priority: 3
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
branch: agentic-sdlc/fix-review-flow-auto-complete-on-approval-restart-
---
# Fix review flow: auto-complete on approval, restart RPIV on rejection, with configurable max retries (default 3)

## User Story

**As a** development team using an automated review workflow  
**I want** the review process to automatically complete when approved and restart the review-plan-implement-verify (RPIV) cycle when rejected, with a configurable retry limit  
**So that** I can maintain code quality through iterative improvements while preventing infinite retry loops

## Summary

This story addresses the review flow automation to handle two critical paths:
1. **Approval path**: Automatically mark the story/task as complete when review passes
2. **Rejection path**: Trigger a new RPIV cycle to address feedback, with safeguards against infinite loops

The system should support configurable maximum retries (defaulting to 3) to balance iteration flexibility with resource constraints.

## Acceptance Criteria

- [x] When a review is approved, the system automatically transitions the story/task to "completed" status
- [x] When a review is rejected, the system automatically initiates a new RPIV cycle starting from the planning phase
- [x] Maximum retry limit is configurable via a system setting or environment variable
- [x] Default maximum retry limit is set to 3 attempts
- [x] After reaching the maximum retry limit, the system halts automatic retries and flags the story for manual intervention
- [x] Review rejection feedback is persisted and made available to subsequent RPIV cycles
- [x] The current retry count is visible in the story/task metadata
- [x] System logs all review decisions (approval/rejection) with timestamps and retry counts
- [x] Edge case: If review agent fails or times out, it counts as neither approval nor rejection and allows manual retry
- [x] Configuration changes to max retries apply to new review cycles, not in-progress ones

## Edge Cases & Constraints

**Edge Cases:**
- Review agent crashes or becomes unavailable mid-review
- Multiple concurrent reviews on the same story (race conditions)
- Review feedback is empty or malformed
- Max retries set to 0 or negative value (should validate and reject)
- Max retries changed while a story is mid-cycle

**Constraints:**
- Must preserve review history across all retry attempts for audit purposes
- Should not auto-restart if the rejection reason indicates a fundamental requirement issue (consider severity levels)
- Retry counter must persist across system restarts
- Maximum configurable retry limit should have an upper bound (suggest: 10) to prevent resource exhaustion

**Dependencies:**
- Assumes RPIV workflow is already implemented
- Requires review agent capability to return structured approval/rejection responses
- May need database schema updates to track retry counts and review history

## Technical Considerations

- Consider adding a "rejection severity" field to distinguish between minor fixes (auto-retry) and major issues (require human review)
- Implement circuit breaker pattern if review service shows repeated failures
- Add metrics/monitoring for retry rates and success patterns

---

**Effort:** medium  
**Labels:** workflow-automation, review-process, configuration, error-handling, RPIV

## Research

Perfect! Now I have enough information to provide comprehensive research findings. Let me compile the research report:

# Research Findings: Fix Review Flow with Auto-complete, RPIV Restart, and Configurable Retries

## 1. Relevant Existing Patterns and Code

### Current Review Flow Architecture
The review agent (`src/agents/review.ts`) currently implements a basic approval/rejection detection mechanism:

```typescript
// Lines 74-83 in src/agents/review.ts
const allPassed = !codeReview.toLowerCase().includes('block') &&
                  !securityReview.toLowerCase().includes('critical') &&
                  !poReview.toLowerCase().includes('reject');

if (allPassed) {
  updateStoryField(story, 'reviews_complete', true);
  changesMade.push('Marked reviews_complete: true');
} else {
  changesMade.push('Reviews flagged issues - manual review required');
}
```

**Key observations:**
- Simple keyword-based detection (not structured)
- Only sets `reviews_complete: true` on approval
- No auto-transition to done on approval
- No retry mechanism or cycle restart on rejection
- No tracking of retry attempts or review history

### Workflow State Management
The system has robust workflow state persistence (`src/core/workflow-state.ts`) used for the `--continue` feature:

```typescript
export interface WorkflowExecutionState {
  version: WorkflowStateVersion;
  workflowId: string;
  timestamp: string;
  currentAction: CurrentActionContext | null;
  completedActions: CompletedActionRecord[];
  context: {
    sdlcRoot: string;
    options: { auto?: boolean; dryRun?: boolean; };
    storyContentHash?: string;
  };
}
```

**Pattern to leverage:**
- Atomic file writes with `write-file-atomic`
- Version-aware state persistence
- Timestamped action records
- Hash-based change detection

### Story Frontmatter Structure
Stories track workflow progress via boolean flags (`src/types/index.ts`):

```typescript
export interface StoryFrontmatter {
  id: string;
  title: string;
  research_complete: boolean;
  plan_complete: boolean;
  implementation_complete: boolean;
  reviews_complete: boolean;
  pr_url?: string;
  branch?: string;
  last_error?: string;
  // ... other fields
}
```

**Missing fields needed:**
- `retry_count`: number
- `max_retries`: number (optional, defaults to config)
- `review_history`: array of review attempts
- `rejection_reason`: string (latest)

### Workflow Runner Pattern
The `WorkflowRunner` class (`src/cli/runner.ts`) orchestrates action execution:

```typescript
private async executeAction(action: Action) {
  switch (action.type) {
    case 'review':
      return runReviewAgent(action.storyPath, this.sdlcRoot);
    case 'create_pr':
      return createPullRequest(action.storyPath, this.sdlcRoot);
    // ... other cases
  }
}
```

**Integration point:**
- After `review` action completes, check result and trigger next action
- On approval: trigger `create_pr` → move to done
- On rejection: reset workflow flags and trigger new RPIV cycle

### Configuration System
The config system (`src/core/config.ts`) supports stage gates and JSON-based configuration:

```typescript
export interface Config {
  sdlcFolder: string;
  stageGates: StageGateConfig;
  defaultLabels: string[];
  theme: ThemePreference;
}
```

**Extension needed:**
- Add `reviewConfig` section with `maxRetries: number` (default 3)
- Support environment variable override: `AGENTIC_SDLC_MAX_RETRIES`

## 2. Files/Modules That Need Modification

### Critical Files (Must Modify)

1. **`src/types/index.ts`**
   - Add `retry_count`, `max_retries`, and `review_history` to `StoryFrontmatter`
   - Add `ReviewAttempt` interface for history tracking
   - Add `ReviewDecision` enum: `APPROVED | REJECTED | FAILED`

2. **`src/agents/review.ts`**
   - Restructure to return structured `ReviewDecision` instead of just boolean
   - Implement review history persistence to story
   - Extract rejection feedback for next RPIV cycle
   - Check retry limits before executing review

3. **`src/cli/runner.ts` (WorkflowRunner class)**
   - Add post-review decision logic in `executeAction()` or new `handleReviewDecision()`
   - On approval: auto-trigger story completion (move to done)
   - On rejection: reset RPIV flags, increment retry count, restart cycle
   - On max retries: flag for manual intervention, halt auto-retries

4. **`src/core/config.ts`**
   - Add `ReviewConfig` interface with `maxRetries` field
   - Extend `Config` interface to include `reviewConfig`
   - Support loading from `.agentic-sdlc.json`
   - Add environment variable support: `process.env.AGENTIC_SDLC_MAX_RETRIES`
   - Validation: ensure maxRetries is 0-10 (reject negative/invalid values)

5. **`src/core/kanban.ts` (assessState function)**
   - Update logic to handle stories at max retries differently
   - Stories at max retry limit should generate a special `manual_intervention` action
   - Don't recommend `review` action for stories that have exceeded retry limit

### Supporting Files (Should Modify)

6. **`src/core/story.ts`**
   - Add helper function: `resetRPIVCycle(story)` to clear workflow flags except research
   - Add helper function: `incrementRetryCount(story)` 
   - Add helper function: `appendReviewHistory(story, attempt: ReviewAttempt)`
   - Add helper function: `isAtMaxRetries(story, config)`

7. **`src/agents/state-assessor.ts`**
   - Update to consider retry counts in action prioritization
   - Detect stories blocked by max retries

### Optional Enhancement Files

8. **`src/cli/commands.ts`**
   - Update `status` command to show retry indicators (e.g., "🔄×2" for 2 retries)
   - Update `details` command to display review history
   - Add `reset-retries <story-id>` command for manual intervention

9. **`templates/story.md`**
   - Add `retry_count: 0` to template frontmatter
   - Add `## Review History` section placeholder

## 3. External Best Practices and Resources

### Retry Pattern Best Practices

1. **Exponential Backoff** (Optional for future enhancement)
   - Not applicable for manual review workflows
   - Could apply if review agent itself has transient failures

2. **Circuit Breaker Pattern**
   - After N consecutive failures, open circuit (halt retries)
   - Require manual reset before allowing more attempts
   - **Reference:** Martin Fowler's Circuit Breaker pattern
   - **Application:** Implement in `WorkflowRunner` to detect systemic review issues

3. **Structured Logging for Audit Trail**
   - Log every review decision with timestamp, decision, and reason
   - Create `.agentic-sdlc/logs/review-history.jsonl` for queryable history
   - **Standard:** JSON Lines format for easy parsing

4. **Idempotency**
   - Ensure RPIV cycle restart is idempotent
   - Safe to retry even if partially completed
   - Use transaction-like semantics: update all flags atomically

### Review Workflow Best Practices

1. **Structured Review Responses**
   - Instead of keyword detection, use structured prompts
   - Ask review agent to respond with YAML/JSON:
     ```yaml
     decision: APPROVED | REJECTED | NEEDS_REVISION
     severity: LOW | MEDIUM | HIGH | CRITICAL
     feedback: "..."
     blockers: ["list", "of", "issues"]
     ```

2. **Severity-Based Auto-Retry Logic**
   - `LOW/MEDIUM`: Auto-retry (cosmetic, minor fixes)
   - `HIGH`: Auto-retry with caution (design issues)
   - `CRITICAL`: Manual intervention required (fundamental problems)
   - **Standard:** OWASP severity ratings

3. **Review Checkpoints**
   - Persist review state after each sub-review (code, security, PO)
   - Allow partial retry if only one sub-review failed
   - Reduces redundant work

4. **Configuration Hierarchy**
   ```
   Environment Variable > .agentic-sdlc.json > Default
   ```
   - `AGENTIC_SDLC_MAX_RETRIES` env var (highest priority)
   - Project-level config file
   - Hardcoded default: 3

## 4. Potential Challenges and Risks

### Technical Challenges

1. **Race Conditions**
   - **Risk:** Multiple concurrent reviews on same story (in distributed/parallel scenarios)
   - **Mitigation:** File-based locking or state version checks (already has state versioning)
   - **Priority:** Low (current architecture is single-process)

2. **Partial RPIV Reset**
   - **Risk:** Resetting flags mid-cycle could corrupt workflow state
   - **Challenge:** Determining which flags to reset (reset all except research? include research?)
   - **Decision needed:** Should research be re-run on rejection?
   - **Recommendation:** Keep research, reset plan/implementation/review flags

3. **Review History Size Growth**
   - **Risk:** Story frontmatter becomes bloated with review history
   - **Mitigation:** Store detailed history in separate file, keep summary in frontmatter
   - **Alternative:** Store in `.agentic-sdlc/reviews/<story-id>.json`

4. **Backward Compatibility**
   - **Risk:** Existing stories without `retry_count` field
   - **Mitigation:** Default to 0 if field missing, migrate on first access
   - **Migration:** Add `retry_count: 0` to all existing stories on load

5. **Configuration Changes Mid-Cycle**
   - **Risk:** Story has `max_retries: 5` from old config, config now says 3
   - **Requirement:** "Configuration changes apply to new review cycles, not in-progress ones"
   - **Solution:** Store `max_retries` in story frontmatter when review starts (snapshot config)

### Workflow/UX Challenges

1. **False Positives in Keyword Detection**
   - **Current issue:** Keyword matching is fragile ("reject" in different context)
   - **Solution:** Structured review responses (see best practices above)
   - **Priority:** High (affects core functionality)

2. **User Confusion on Auto-Restart**
   - **Risk:** Users don't realize RPIV restarted automatically
   - **Solution:** Clear logging, notifications, story metadata updates
   - **Add:** `last_restart_reason` and `last_restart_timestamp` fields

3. **Manual Intervention Workflow**
   - **Challenge:** What happens when max retries reached?
   - **Required:** Clear indication in `status` command
   - **Required:** Command to reset retries: `agentic-sdlc reset-retries <story-id>`
   - **Required:** Prevent auto-mode from processing these stories

4. **Feedback Loop Quality**
   - **Challenge:** Rejection feedback needs to be actionable for agents
   - **Risk:** Generic feedback → same failure repeated
   - **Solution:** Template rejection feedback format, extract specific issues
   - **Enhancement:** Append rejection feedback to planning phase context

### Edge Cases

1. **Review Agent Timeout/Crash**
   - **Requirement:** "Does not count as rejection"
   - **Challenge:** Distinguish between crash and rejection
   - **Solution:** Wrap review agent in try-catch, treat errors as neither approval nor rejection
   - **Action:** Allow manual retry without incrementing counter

2. **Empty Review Feedback**
   - **Scenario:** Review rejects but provides no actionable feedback
   - **Handling:** Treat as agent failure, don't increment retry
   - **Log:** Warning for operator review

3. **Retry Count Manipulation**
   - **Risk:** Users manually edit story to reset `retry_count`
   - **Mitigation:** Acceptable (manual intervention is allowed)
   - **Audit:** Log all retry count changes

4. **Negative/Zero Max Retries**
   - **Config validation:** Reject negative values
   - **Zero value:** Disable auto-retry entirely (require manual approval after first rejection)

## 5. Dependencies and Prerequisites

### Code Dependencies

1. **Existing Infrastructure (Already Available)**
   - ✅ Story frontmatter system with atomic writes
   - ✅ Workflow state persistence mechanism
   - ✅ Configuration loading system
   - ✅ Agent result return types
   - ✅ Story metadata update utilities

2. **New Utilities Required**
   - `resetRPIVCycle()` - Clear workflow flags for retry
   - `incrementRetryCount()` - Atomic retry counter increment
   - `appendReviewHistory()` - Persist review attempt
   - `isAtMaxRetries()` - Check retry limit
   - `parseReviewDecision()` - Extract structured decision from review output

### Testing Dependencies

1. **Test Fixtures Needed**
   - Sample stories at various retry states (0, 1, 2, 3+)
   - Sample review responses (approval, rejection, failure)
   - Sample configurations with different maxRetries values

2. **Test Scenarios**
   - Review approval → auto-complete flow
   - Review rejection → RPIV restart flow
   - Max retries reached → manual intervention
   - Config override via environment variable
   - Edge case: review agent crash
   - Edge case: empty feedback
   - Backward compatibility: story without retry_count

### Documentation Prerequisites

1. **User Documentation Updates**
   - Explain retry behavior in README
   - Document max retries configuration
   - Document manual intervention workflow
   - Document `reset-retries` command

2. **Migration Guide**
   - How to upgrade existing stories
   - What to expect after upgrade
   - How to adjust max retries for specific stories

### Deployment Considerations

1. **State Migration**
   - Add `retry_count: 0` to all existing stories
   - No breaking changes (field is optional with default)

2. **Configuration Discovery**
   - Update `.agentic-sdlc.json` schema documentation
   - Add example configuration snippet

3. **Monitoring**
   - Add metrics: retry rate, max retries hit rate
   - Log review decisions for analytics

## Implementation Sequence Recommendation

Based on dependency analysis:

1. **Phase 1: Type Definitions** (`src/types/index.ts`)
   - Add new frontmatter fields and interfaces
   - No breaking changes, additive only

2. **Phase 2: Configuration** (`src/core/config.ts`)
   - Add review config with validation
   - Add environment variable support

3. **Phase 3: Story Utilities** (`src/core/story.ts`)
   - Implement helper functions for retry management
   - Implement RPIV reset logic

4. **Phase 4: Review Agent** (`src/agents/review.ts`)
   - Refactor to return structured decisions
   - Add retry checking before execution
   - Persist review history

5. **Phase 5: Workflow Runner** (`src/cli/runner.ts`)
   - Implement post-review decision handling
   - Add auto-completion on approval
   - Add RPIV restart on rejection
   - Add max retry enforcement

6. **Phase 6: State Assessment** (`src/core/kanban.ts`)
   - Update action recommendations for retry scenarios
   - Add manual intervention detection

7. **Phase 7: CLI Enhancements** (`src/cli/commands.ts`)
   - Update status display with retry indicators
   - Add reset-retries command
   - Update details command

## Summary

This implementation will require **moderate effort** across 7 core files, introducing:
- Retry tracking in story frontmatter
- Configurable max retries (default 3)
- Structured review decisions
- Automatic RPIV cycle restart on rejection
- Automatic completion on approval
- Manual intervention workflow for exceeded retries

The existing codebase provides excellent foundations (workflow state, configuration system, story utilities) that can be leveraged. The primary complexity lies in coordinating the workflow state machine transitions and ensuring robust retry semantics.

---

**Sources:**
- Existing codebase analysis (files listed above)
- Martin Fowler - Circuit Breaker Pattern
- OWASP Severity Ratings
- JSON Lines format specification

## Implementation Plan

# Implementation Plan: Fix Review Flow with Auto-complete, RPIV Restart, and Configurable Retries

## Overview
This plan implements automatic review flow handling with configurable retry limits. The work is broken into 7 phases following a test-driven development approach where possible.

---

## Phase 1: Type Definitions and Schema Updates

### 1.1 Core Type Extensions
- [ ] Add `ReviewDecision` enum to `src/types/index.ts` with values: `APPROVED`, `REJECTED`, `FAILED`
- [ ] Add `ReviewSeverity` enum with values: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- [ ] Create `ReviewAttempt` interface with fields: `timestamp`, `decision`, `severity`, `feedback`, `blockers`
- [ ] Extend `StoryFrontmatter` interface to include:
  - `retry_count?: number`
  - `max_retries?: number`
  - `last_restart_reason?: string`
  - `last_restart_timestamp?: string`
  - `review_history?: ReviewAttempt[]`

### 1.2 Configuration Types
- [ ] Create `ReviewConfig` interface in `src/types/index.ts` with fields:
  - `maxRetries: number`
  - `maxRetriesUpperBound: number`
  - `autoCompleteOnApproval: boolean`
  - `autoRestartOnRejection: boolean`
- [ ] Extend `Config` interface to include `reviewConfig?: ReviewConfig`

### 1.3 Review Result Types
- [ ] Create `ReviewResult` interface with fields:
  - `decision: ReviewDecision`
  - `severity?: ReviewSeverity`
  - `feedback: string`
  - `blockers: string[]`
  - `codeReviewPassed: boolean`
  - `securityReviewPassed: boolean`
  - `poReviewPassed: boolean`

---

## Phase 2: Configuration System

### 2.1 Config Schema and Defaults
- [ ] Update `src/core/config.ts` to define default `ReviewConfig`:
  ```typescript
  maxRetries: 3,
  maxRetriesUpperBound: 10,
  autoCompleteOnApproval: true,
  autoRestartOnRejection: true
  ```
- [ ] Add config validation function `validateReviewConfig()` that ensures:
  - `maxRetries` is between 0 and `maxRetriesUpperBound`
  - Rejects negative values
  - Logs warnings for unusual values (e.g., 0 or > 5)

### 2.2 Environment Variable Support
- [ ] Add environment variable loader in `src/core/config.ts`:
  - `AGENTIC_SDLC_MAX_RETRIES` overrides `reviewConfig.maxRetries`
  - `AGENTIC_SDLC_AUTO_COMPLETE` overrides `autoCompleteOnApproval`
  - `AGENTIC_SDLC_AUTO_RESTART` overrides `autoRestartOnRejection`
- [ ] Update `loadConfig()` function to merge: env vars > file config > defaults

### 2.3 Config Loading Integration
- [ ] Update `.agentic-sdlc.json` schema documentation in README
- [ ] Add example configuration snippet to README showing `reviewConfig` section
- [ ] Test config loading with various combinations of file config and env vars

---

## Phase 3: Story Utility Functions

### 3.1 Retry Management Utilities
- [ ] Implement `incrementRetryCount(story: StoryFrontmatter): void` in `src/core/story.ts`
  - Increment `retry_count` (initialize to 0 if missing)
  - Set `last_restart_timestamp` to current ISO timestamp
- [ ] Implement `isAtMaxRetries(story: StoryFrontmatter, config: Config): boolean`
  - Compare `retry_count` against story's `max_retries` or config default
  - Handle missing fields gracefully (default to 0)
- [ ] Implement `getEffectiveMaxRetries(story: StoryFrontmatter, config: Config): number`
  - Return `story.max_retries` if set, otherwise `config.reviewConfig.maxRetries`

### 3.2 RPIV Cycle Reset
- [ ] Implement `resetRPIVCycle(story: StoryFrontmatter, reason: string): void` in `src/core/story.ts`
  - Set `plan_complete: false`
  - Set `implementation_complete: false`
  - Set `reviews_complete: false`
  - Keep `research_complete: true` (preserve research)
  - Set `last_restart_reason: reason`
  - Set `last_restart_timestamp` to current ISO timestamp
  - Increment `retry_count` via `incrementRetryCount()`

### 3.3 Review History Management
- [ ] Implement `appendReviewHistory(story: StoryFrontmatter, attempt: ReviewAttempt): void`
  - Initialize `review_history` array if missing
  - Append new `ReviewAttempt` to array
  - Limit history to last 10 attempts (prevent unbounded growth)
- [ ] Implement `getLatestReviewAttempt(story: StoryFrontmatter): ReviewAttempt | null`
  - Return most recent review attempt or null if none exist

### 3.4 Story Completion
- [ ] Implement `markStoryComplete(story: StoryFrontmatter): void` in `src/core/story.ts`
  - Set all workflow flags to true
  - Add completion metadata (timestamp, final retry count)

---

## Phase 4: Review Agent Refactoring

### 4.1 Structured Response Parsing
- [ ] Create `parseReviewDecision(codeReview: string, securityReview: string, poReview: string): ReviewResult` in `src/agents/review.ts`
  - Parse each review for APPROVED/REJECTED/FAILED keywords
  - Detect severity levels from review text
  - Extract feedback and blockers
  - Return structured `ReviewResult`
- [ ] Update review agent prompts to request structured YAML/JSON responses (optional enhancement)

### 4.2 Review Execution Pre-checks
- [ ] Add retry limit check at start of `runReviewAgent()`:
  - Load story and config
  - Call `isAtMaxRetries(story, config)`
  - If at max retries, return early with error message
  - Log warning: "Story {id} has reached max retries ({count}), requires manual intervention"

### 4.3 Review Result Persistence
- [ ] Refactor `runReviewAgent()` to return `ReviewResult` instead of void
- [ ] After review completes, create `ReviewAttempt` object from result
- [ ] Call `appendReviewHistory(story, attempt)` to persist history
- [ ] Update story frontmatter with latest review metadata
- [ ] Return `ReviewResult` to caller (WorkflowRunner)

### 4.4 Review Decision Logic
- [ ] Refactor approval/rejection detection to use structured `ReviewResult`:
  - `APPROVED`: All sub-reviews passed
  - `REJECTED`: One or more sub-reviews failed
  - `FAILED`: Review agent crashed or returned malformed data
- [ ] Remove keyword-based detection (`block`, `critical`, `reject`)
- [ ] Use severity field to categorize rejection types

---

## Phase 5: Workflow Runner Integration

### 5.1 Review Decision Handling
- [ ] Create `handleReviewDecision(story: StoryFrontmatter, result: ReviewResult, config: Config): Action | null` in `src/cli/runner.ts`
  - Takes review result and determines next action
  - Returns next `Action` or null if manual intervention needed
- [ ] Implement approval path in `handleReviewDecision()`:
  - If `result.decision === APPROVED` and `config.reviewConfig.autoCompleteOnApproval`:
    - Call `markStoryComplete(story)`
    - Return action to move story to done folder (if applicable)
    - Log: "Review approved, auto-completing story {id}"
- [ ] Implement rejection path in `handleReviewDecision()`:
  - If `result.decision === REJECTED` and `config.reviewConfig.autoRestartOnRejection`:
    - Check if `isAtMaxRetries(story, config)`
    - If at max retries:
      - Set `last_error: "Max retries reached, manual intervention required"`
      - Log warning and return null (halt automation)
    - If under max retries:
      - Call `resetRPIVCycle(story, result.feedback)`
      - Return action to restart planning phase
      - Log: "Review rejected, restarting RPIV cycle (attempt {retry_count + 1}/{max_retries})"

### 5.2 Review Action Execution Update
- [ ] Update `executeAction()` in `WorkflowRunner` for `review` action type:
  - Capture `ReviewResult` returned by `runReviewAgent()`
  - Call `handleReviewDecision()` to determine next action
  - If next action exists, queue it for execution
  - If null (manual intervention), halt automation and notify user

### 5.3 Max Retries Snapshot
- [ ] When starting a review action, snapshot `max_retries` to story frontmatter:
  - If `story.max_retries` is undefined, set it to `config.reviewConfig.maxRetries`
  - This ensures config changes don't affect in-progress cycles
  - Log: "Captured max_retries={value} for story {id}"

### 5.4 Failed Review Handling
- [ ] Add error handling for `FAILED` review decision:
  - Do NOT increment retry count (doesn't count as attempt)
  - Log error details for debugging
  - Allow manual retry without penalty
  - Notify user of review agent failure

---

## Phase 6: State Assessment Updates

### 6.1 Manual Intervention Detection
- [ ] Update `assessState()` in `src/core/kanban.ts` to detect max retry scenarios:
  - Check if `isAtMaxRetries(story, config)` for stories in `doing` column
  - If true, generate special `manual_intervention` action type (or skip action recommendation)
  - Log: "Story {id} requires manual intervention (max retries reached)"

### 6.2 Action Prioritization
- [ ] Update action recommendation logic to consider retry counts:
  - Deprioritize stories with high retry counts (e.g., 2+ retries)
  - Prioritize fresh stories (0 retries)
  - Add retry count to action metadata for visibility

### 6.3 Blocked Story Handling
- [ ] Add detection for stories blocked by max retries in status assessment
- [ ] Return appropriate status indicators for these stories

---

## Phase 7: CLI Enhancements

### 7.1 Status Display Updates
- [ ] Update `status` command in `src/cli/commands.ts` to show retry indicators:
  - Display retry count next to story title: `[DOING] Story Title 🔄×2` (for 2 retries)
  - Show warning icon for stories at max retries: `⚠️ Manual intervention required`
  - Color-code by retry count (green=0, yellow=1-2, red=3+)

### 7.2 Details Command Enhancement
- [ ] Update `details` command to display review history:
  - Show `retry_count / max_retries` field
  - List recent review attempts with timestamps and decisions
  - Display latest rejection feedback if applicable
  - Show `last_restart_timestamp` and `last_restart_reason`

### 7.3 Reset Retries Command
- [ ] Create new `reset-retries <story-id>` command:
  - Load story by ID
  - Reset `retry_count: 0`
  - Clear `last_error` field
  - Clear `last_restart_reason` and `last_restart_timestamp`
  - Optionally preserve review history for audit
  - Log: "Reset retry count for story {id}, automation re-enabled"
  - Require confirmation flag for safety: `--confirm`

### 7.4 Logging Enhancements
- [ ] Add structured logging for review decisions:
  - Create `.agentic-sdlc/logs/review-history.jsonl` (JSON Lines format)
  - Log each review decision with: story ID, timestamp, decision, severity, retry count
  - Log RPIV cycle restarts with reason
  - Log max retry events

---

## Phase 8: Testing

### 8.1 Unit Tests - Configuration
- [ ] Test `validateReviewConfig()` with valid configs (0, 3, 10)
- [ ] Test validation rejection for negative values
- [ ] Test validation rejection for values > maxRetriesUpperBound
- [ ] Test environment variable override precedence
- [ ] Test config loading with missing reviewConfig (uses defaults)

### 8.2 Unit Tests - Story Utilities
- [ ] Test `incrementRetryCount()` initializes to 1 from undefined
- [ ] Test `incrementRetryCount()` increments existing count
- [ ] Test `isAtMaxRetries()` returns true at limit
- [ ] Test `isAtMaxRetries()` returns false under limit
- [ ] Test `getEffectiveMaxRetries()` prefers story value over config
- [ ] Test `resetRPIVCycle()` clears correct flags and preserves research
- [ ] Test `resetRPIVCycle()` increments retry count
- [ ] Test `appendReviewHistory()` limits history to 10 entries

### 8.3 Unit Tests - Review Agent
- [ ] Test `parseReviewDecision()` detects APPROVED when all pass
- [ ] Test `parseReviewDecision()` detects REJECTED when any fail
- [ ] Test `parseReviewDecision()` extracts feedback correctly
- [ ] Test `parseReviewDecision()` handles malformed input (returns FAILED)
- [ ] Test review agent halts when `isAtMaxRetries()` is true

### 8.4 Unit Tests - Workflow Runner
- [ ] Test `handleReviewDecision()` triggers completion on APPROVED
- [ ] Test `handleReviewDecision()` triggers RPIV restart on REJECTED (under max retries)
- [ ] Test `handleReviewDecision()` halts on REJECTED at max retries
- [ ] Test `handleReviewDecision()` allows manual retry on FAILED
- [ ] Test max_retries snapshot to story frontmatter on review start

### 8.5 Integration Tests
- [ ] Test full approval flow: review → auto-complete → story moved to done
- [ ] Test full rejection flow: review → RPIV restart → retry count incremented
- [ ] Test max retries reached: review → rejection → halt → manual intervention flag
- [ ] Test review agent crash: error handling → no retry increment → manual retry allowed
- [ ] Test config change mid-cycle: story uses snapshotted max_retries, not new config
- [ ] Test backward compatibility: story without retry_count defaults to 0

### 8.6 Edge Case Tests
- [ ] Test empty review feedback (treated as FAILED)
- [ ] Test concurrent reviews (file locking/versioning prevents corruption)
- [ ] Test manual retry_count manipulation (system handles gracefully)
- [ ] Test maxRetries = 0 (disables auto-retry, requires manual after first rejection)
- [ ] Test review history growth (limits to 10 entries)

---

## Phase 9: Documentation

### 9.1 User Documentation
- [ ] Update README with "Review Flow Automation" section explaining:
  - Auto-completion on approval
  - Auto-restart on rejection with retry limits
  - Default max retries (3) and how to configure
  - Manual intervention workflow when max retries reached
- [ ] Document environment variables:
  - `AGENTIC_SDLC_MAX_RETRIES`
  - `AGENTIC_SDLC_AUTO_COMPLETE`
  - `AGENTIC_SDLC_AUTO_RESTART`
- [ ] Document `reset-retries` command usage and when to use it
- [ ] Add troubleshooting section for common retry scenarios

### 9.2 Configuration Documentation
- [ ] Add `.agentic-sdlc.json` schema example with `reviewConfig`:
  ```json
  {
    "reviewConfig": {
      "maxRetries": 3,
      "maxRetriesUpperBound": 10,
      "autoCompleteOnApproval": true,
      "autoRestartOnRejection": true
    }
  }
  ```
- [ ] Document per-story `max_retries` override in story frontmatter

### 9.3 Migration Guide
- [ ] Create migration guide for upgrading existing projects:
  - Explain that existing stories default to `retry_count: 0`
  - No action required for backward compatibility
  - Optionally run migration script to add explicit `retry_count: 0` to all stories
- [ ] Document breaking changes (none expected)

### 9.4 Developer Documentation
- [ ] Add JSDoc comments to all new functions
- [ ] Document `ReviewResult` and `ReviewAttempt` types in code
- [ ] Update architecture documentation with review flow state machine diagram

---

## Phase 10: Verification and Deployment

### 10.1 Manual Testing Scenarios
- [ ] Create test story and run through approval path:
  - Verify auto-completion works
  - Verify story moves to done (if applicable)
  - Verify completion logged
- [ ] Create test story and run through rejection path (under max retries):
  - Verify RPIV cycle resets
  - Verify retry count increments
  - Verify rejection feedback persisted
  - Verify restart logged
- [ ] Create test story and reach max retries:
  - Verify automation halts
  - Verify manual intervention flag set
  - Verify warning logged
  - Run `reset-retries` command and verify automation re-enabled
- [ ] Test config override via environment variable:
  - Set `AGENTIC_SDLC_MAX_RETRIES=5`
  - Verify effective max retries is 5
- [ ] Test review agent failure scenario:
  - Force review agent to crash
  - Verify FAILED decision
  - Verify retry count NOT incremented
  - Verify manual retry allowed

### 10.2 Performance Verification
- [ ] Verify atomic file writes for retry count updates (no race conditions)
- [ ] Verify review history doesn't cause performance degradation (limit to 10 entries)
- [ ] Verify log file growth is manageable (`.agentic-sdlc/logs/review-history.jsonl`)

### 10.3 Acceptance Criteria Validation
- [ ] ✅ Review approved → story auto-transitions to completed
- [ ] ✅ Review rejected → RPIV cycle restarts automatically
- [ ] ✅ Max retry limit configurable via `.agentic-sdlc.json` or env var
- [ ] ✅ Default max retry limit is 3
- [ ] ✅ Max retries reached → automation halts and flags for manual intervention
- [ ] ✅ Rejection feedback persisted and available to subsequent cycles
- [ ] ✅ Retry count visible in story metadata
- [ ] ✅ Review decisions logged with timestamps and retry counts
- [ ] ✅ Review agent failure doesn't increment retry count
- [ ] ✅ Config changes apply to new cycles, not in-progress ones

### 10.4 Code Quality Checks
- [ ] Run linter and fix all issues
- [ ] Run type checker (TypeScript) and resolve all errors
- [ ] Ensure all tests pass
- [ ] Code review by peer (if applicable)
- [ ] Check test coverage (aim for >80% on new code)

### 10.5 Deployment Preparation
- [ ] Create release notes summarizing new features
- [ ] Tag release version (semantic versioning)
- [ ] Update CHANGELOG.md
- [ ] Prepare rollback plan (config can be disabled via env vars)

---

## Summary

This implementation plan covers:
- **7 core file modifications** (types, config, story utils, review agent, workflow runner, state assessor, CLI)
- **45+ unit tests** covering all new functionality
- **6 integration tests** for end-to-end flows
- **5 edge case tests** for robustness
- **Complete documentation** including migration guide
- **Comprehensive verification** against all acceptance criteria

**Estimated Effort:** Medium (8-12 hours for experienced developer)

**Risk Mitigation:**
- Test-driven approach minimizes bugs
- Backward compatibility ensures safe deployment
- Configuration allows feature toggle via env vars
- Extensive edge case testing prevents unexpected failures

**Dependencies:**
- No external library changes required
- Leverages existing workflow state and configuration infrastructure
- Minimal schema changes (additive only)
