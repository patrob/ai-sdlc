---
id: story-68074435-f961
title: Add FACTS scale validation agent for planning quality
priority: 8
status: ready
type: feature
created: '2026-01-10'
labels:
  - s
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
updated: '2026-01-11'
---
# Add FACTS scale validation agent for planning quality

## User Story

As a **development team member**, I want **planning outputs to be automatically validated against quality criteria (FACTS scale)** so that **we catch incomplete or unclear plans early and ensure high-quality implementation guidance**.

## Summary

Introduces a validation agent that evaluates planning output using the FACTS scale (Feasibility, Atomicity, Clarity, Testability, Scope - each scored 0-5). When validation fails (average score < 4.0), the planning agent automatically retries with feedback up to 3 times. If validation continues to fail after all retries, the story is marked as "blocked" with detailed failure reasons.

**Depends on**: Story 03 (TDD planning improvements) must be completed first to ensure planning outputs contain the necessary detail for FACTS evaluation.

**Reference**: See RPI plugin for FACTS validation patterns and scoring rubrics.

## Acceptance Criteria

- [ ] New validation agent implements FACTS scale evaluation with 5 criteria:
  - **F**easibility: Can the plan be realistically implemented?
  - **A**tomicity: Are tasks broken down into single-purpose units?
  - **C**larity: Is the plan unambiguous and easy to follow?
  - **T**estability: Are test requirements clearly specified?
  - **S**cope: Is the scope well-defined and appropriate?
- [ ] Each FACTS criterion is scored 0-5 with clear scoring rubrics documented
- [ ] Validation runs automatically after planning agent completes
- [ ] Overall FACTS score is calculated as average of 5 criteria scores
- [ ] If average FACTS score < 4.0, planning is automatically retried (max 3 attempts total)
- [ ] On retry, validation feedback (which criteria failed and why) is passed to planning agent
- [ ] If all 3 attempts fail validation (score < 4.0), story status changes to "blocked"
- [ ] Blocked stories include detailed validation failure information (scores + reasons)
- [ ] Validation results are persisted in story document under "## Validation" section
- [ ] All existing tests pass with no regressions
- [ ] New unit tests cover FACTS scoring logic for each criterion
- [ ] New integration tests verify retry loop and blocked status flow

## Edge Cases & Constraints

**Edge Cases:**
- Planning output is malformed or missing required sections (validation should handle gracefully)
- Score of exactly 4.0 (should PASS - threshold is < 4.0)
- Planning agent produces identical output on retry (validation should detect and suggest blocking)
- Validation agent itself fails/errors (should not block indefinitely - fallback behavior needed)

**Constraints:**
- Maximum 3 planning attempts (1 initial + 2 retries) to avoid infinite loops
- Validation must complete within reasonable time (suggest 30s timeout per validation)
- FACTS scoring must be deterministic and repeatable (same input = same scores)
- Blocked stories must preserve all validation history for debugging
- Integration with existing story status workflow (don't break current "in_progress"/"done" states)

**Dependencies:**
- Story 03 must be complete (TDD planning format required for meaningful validation)
- ActionType enum needs "blocked" status if not already present
- Story type needs validation_history field to track attempts

**Technical Considerations:**
- Validation agent should be separate from planning agent (single responsibility)
- Consider validation scoring as pure functions (testable without AI calls)
- Store FACTS rubrics as configuration/prompts (easy to iterate without code changes)
- Validation feedback format should be structured (JSON) for reliable parsing by planning agent

## Implementation Notes

Suggested approach:
1. Define FACTS scoring rubrics (prompts/config)
2. Create validation agent with scoring logic
3. Add retry loop in planning action handler
4. Implement blocked status and persistence
5. Add tests (unit: scoring, integration: retry flow)

---

**Effort**: large

**Labels**: enhancement, agent-workflow, quality-assurance, validation, blocking-capability
