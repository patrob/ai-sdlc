---
id: story-eay4p3yka4v
title: Reset RPIV cycle on review rejection with fresh research-first approach
priority: 13
status: ready
type: enhancement
created: '2026-01-10'
labels:
  - workflow
  - review
  - rpiv
  - s
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
updated: '2026-01-11'
---
# Reset RPIV cycle on review rejection with fresh research-first approach

## User Story

**As a** developer using agentic-sdlc  
**I want** the workflow to restart from Research when a review is rejected, using reviewer feedback as input  
**So that** subsequent attempts take genuinely different approaches rather than retrying the same failing implementation

## Context

Currently, when a review is rejected, the system resets Plan and Implementation phases but leaves Research marked complete. This causes the system to retry similar approaches, leading to repeated failures. The story document also accumulates review notes, becoming unwieldy after multiple iterations.

## Acceptance Criteria

### Core Functionality
- [ ] When review is rejected, `resetRPIVCycle()` sets `research_complete: false` (currently stays `true`)
- [ ] Add `iteration_count` to frontmatter type in `src/types/index.ts` if not present
- [ ] Implement `archiveIteration()` function in `src/core/story.ts` that:
  - [ ] Summarizes previous Research/Plan/Implementation content
  - [ ] Moves summary to "Previous Attempts" section
  - [ ] Clears main Research/Plan/Implementation sections
  - [ ] Increments `iteration_count`
- [ ] Call `archiveIteration()` before `resetRPIVCycle()` in rejection flow in `src/cli/commands.ts`

### Research Agent Enhancement
- [ ] Research agent in `src/agents/research.ts` accepts structured review feedback as context:
  - [ ] Blocker issues
  - [ ] Critical issues
  - [ ] Review suggestions
  - [ ] Previous approach summary
- [ ] Research agent prompt includes explicit instruction to address review feedback with different approach
- [ ] Research output explicitly addresses specific issues raised in review

### Document Structure
- [ ] Story document includes iteration tracking (e.g., `## Iteration 2 of 3`)
- [ ] Previous attempts section uses consistent format:
  ```markdown
  ### Iteration N
  **Review outcome:** REJECTED
  **Key issues:** [bulleted list]
  **Approach taken:** [1-2 sentence summary]
  **Why it failed:** [1-2 sentence summary]
  ```
- [ ] Story document remains readable after 3+ iterations (no bloat)
- [ ] Review notes for current iteration don't include historical notes from previous iterations

### Testing & Validation
- [ ] Existing tests continue to pass (`npm test`)
- [ ] Add unit test for `archiveIteration()` function
- [ ] Add integration test for full rejection-to-research flow
- [ ] Build succeeds (`npm run build`)

## Edge Cases & Constraints

### Edge Cases
1. **First rejection (no previous attempts):** Don't create "Previous Attempts" section until iteration 2
2. **Empty sections:** If Research/Plan/Implementation sections don't exist or are empty, skip archiving them
3. **Malformed review feedback:** Research agent should handle missing/incomplete feedback gracefully
4. **Multiple rapid rejections:** Iteration count increments correctly even if Research → Review happens quickly
5. **Max iterations:** Consider adding configurable max iteration limit (e.g., 3) to prevent infinite loops

### Constraints
1. **Backward compatibility:** Existing stories without `iteration_count` should default to 1
2. **Frontmatter validation:** `iteration_count` must be a positive integer
3. **Archive size:** Archived summaries should be concise (aim for 3-5 lines per section, not verbatim copy)
4. **Reviewer context:** Don't pass entire story history to Research agent—only relevant feedback and previous approach summary
5. **Type safety:** Follow conventions in CLAUDE.md—if adding iteration-related action types, update all required locations

## Technical Approach

### Files to Modify
1. **`src/types/index.ts`**
   - Add `iteration_count?: number` to frontmatter type
   - Add `archived_attempts?: string[]` to frontmatter type (optional, if storing structured history)

2. **`src/core/story.ts`**
   - Add `archiveIteration(story: Story): Story` function
   - Extract and summarize Research/Plan/Implementation sections
   - Return updated story with archived content and incremented count

3. **`src/cli/commands.ts`**
   - Modify rejection flow to call `archiveIteration()` before `resetRPIVCycle()`
   - Update `resetRPIVCycle()` to set `research_complete: false`

4. **`src/agents/research.ts`**
   - Add parameters for review feedback context
   - Update prompt to include feedback and instruction to take different approach
   - Ensure research output references specific review issues

### Proposed Flow
```
Review REJECTED
    ↓
archiveIteration(story)
    ├─ Extract content from Research/Plan/Implementation sections
    ├─ Summarize each (max 3-5 lines per section)
    ├─ Append to "Previous Attempts" section
    ├─ Clear main content sections
    ├─ Increment iteration_count
    └─ Return updated story
    ↓
resetRPIVCycle(story)
    ├─ research_complete: false  ← KEY CHANGE
    ├─ plan_complete: false
    ├─ implementation_complete: false
    └─ reviews_complete: false
    ↓
Research agent runs WITH:
    ├─ Structured review feedback (blockers, critical issues, suggestions)
    ├─ Previous approach summary (from archive)
    └─ Explicit prompt: "Address these specific issues with a different approach"
```

## Open Questions
- Should there be a maximum iteration limit? (Suggest: 3, configurable)
- Should archived attempts be stored in frontmatter or just in markdown sections?
- How should the system handle reaching max iterations? (Auto-escalate to user? Mark story as blocked?)

## Definition of Done
- [ ] `npm test` passes with 0 failures
- [ ] `npm run build` succeeds
- [ ] Manual testing: Reject a review and verify Research phase re-runs with feedback
- [ ] Story document structure matches proposed format after rejection
- [ ] Code follows conventions in `CLAUDE.md` (type safety, action types pattern, etc.)

---

**effort:** large  
**labels:** enhancement, workflow, core-functionality, testing-required
