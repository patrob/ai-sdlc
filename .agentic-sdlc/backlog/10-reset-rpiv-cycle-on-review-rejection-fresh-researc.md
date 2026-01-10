---
id: story-eay4p3yka4v
title: >-
  Reset RPIV cycle on review rejection with fresh research-first approach
priority: 2
status: backlog
type: enhancement
created: '2026-01-10'
labels:
  - workflow
  - review
  - rpiv
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Reset RPIV cycle on review rejection with fresh research-first approach

## Summary

As a developer using agentic-sdlc, when a review is rejected, I want the workflow to restart from the Research phase with the reviewer's feedback as input, so that subsequent attempts take a genuinely different approach rather than retrying the same failing implementation.

**Current behavior:** When review is rejected:
- Research stays marked complete (not re-run)
- Plan and implement phases reset but don't incorporate feedback effectively
- Review notes keep appending, making documents unwieldy
- System essentially retries similar approaches, leading to repeated failures

**Desired behavior:** When review is rejected:
1. Clear previous RPIV content (Research, Plan, Implementation sections) - keep only a summary
2. Track iteration count clearly (e.g., "Iteration 2 of 3")
3. Restart from Research phase with reviewer feedback as primary input
4. Research agent analyzes what went wrong and proposes a different approach
5. Fresh Plan → Implement cycle based on the new research

## Acceptance Criteria

- [ ] On review rejection, clear Research/Plan/Implementation sections (archive or summarize previous attempt)
- [ ] Add iteration tracking visible in story document (e.g., "## Iteration 2")
- [ ] Reset `research_complete` to false on rejection (currently stays true)
- [ ] Research agent receives structured reviewer feedback as input context
- [ ] Research output addresses specific issues raised in review
- [ ] Previous review notes consolidated into summary (not accumulated verbatim)
- [ ] Story document remains readable after multiple iterations (not bloated)
- [ ] Existing tests continue to pass

## Technical Notes

**Current flow on rejection:**
```
Review REJECTED
    ↓
resetRPIVCycle()
    ├─ research_complete: true (unchanged)  ← PROBLEM: doesn't re-research
    ├─ plan_complete: false
    ├─ implementation_complete: false
    └─ reviews_complete: false
    ↓
Plan agent runs (without new research)
    ↓
Implement agent runs
    ↓
Review runs → likely same issues → REJECTED again
```

**Proposed flow on rejection:**
```
Review REJECTED
    ↓
archiveIteration()
    ├─ Summarize previous Research/Plan/Implementation into "Previous Attempts" section
    ├─ Clear main content sections
    └─ Increment iteration_count
    ↓
resetRPIVCycle()
    ├─ research_complete: false  ← NOW RESET
    ├─ plan_complete: false
    ├─ implementation_complete: false
    └─ reviews_complete: false
    ↓
Research agent runs WITH:
    ├─ Reviewer feedback (blockers, critical issues, suggestions)
    ├─ Previous attempt summary
    └─ Instruction: "Address these specific issues with a different approach"
    ↓
Plan agent runs (based on NEW research)
    ↓
Implement agent runs
    ↓
Review runs → hopefully different outcome
```

**Key files to modify:**
- `src/cli/commands.ts` - `resetRPIVCycle()` function
- `src/agents/research.ts` - Accept and use review feedback context
- `src/core/story.ts` - Add `archiveIteration()` function to clean up/summarize previous attempt
- `src/types/index.ts` - Add `iteration_count` to frontmatter type if not present

**Document structure after rejection:**
```markdown
---
iteration_count: 2
research_complete: false
...
---
# Story Title

## Summary
...

## Previous Attempts

### Iteration 1
**Review outcome:** REJECTED
**Key issues:**
- Blocker: Missing input validation on user-provided paths
- Critical: No error handling for file system operations

**Approach taken:** Direct file manipulation without validation
**Why it failed:** Security and reliability concerns

---

## Research
<!-- Fresh research addressing the review feedback -->

## Implementation Plan
<!-- Fresh plan based on new research -->

## Review Notes
<!-- Current iteration's review -->
```

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
