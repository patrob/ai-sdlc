---
id: story-68074184-15b1
title: Add FAR scale validation agent for research quality
priority: 6
status: ready
type: feature
created: '2026-01-10'
labels:
  - validation
  - research
  - quality-assurance
  - agent
  - retry-logic
  - blocking
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
updated: '2026-01-11'
---
I'll refine this story to make it more actionable and well-defined.

# Add FAR scale validation agent for research quality

## User Story

As a **development team member**, I want **research outputs to be automatically validated for quality using the FAR scale**, so that **I can trust that research findings are factual, actionable, and relevant before proceeding to planning and implementation**.

## Summary

Implement an automated validation system that evaluates research output quality using the FAR (Factual/Actionable/Relevant) scale. Each dimension is scored 0-5, with a minimum threshold of 4/5 required to pass. Failed validations trigger automatic research retries (max 3 attempts) with feedback. After 3 failed attempts, the story is marked as blocked with a detailed validation failure reason.

**Dependencies**: 
- Story 02 (codebase-first research) must be completed first
- Requires access to Claude Agent SDK for validation agent

**Reference Implementation**: 
- See `/Users/probinson/.claude/plugins/cache/on-par/rpi/0.6.0/commands/validate-research.md`

## Acceptance Criteria

### Core Validation Functionality
- [ ] Validation agent evaluates research output across three FAR dimensions:
  - [ ] **Factual** (0-5): Research is grounded in codebase facts, not speculation
  - [ ] **Actionable** (0-5): Findings enable concrete planning decisions
  - [ ] **Relevant** (0-5): Research directly addresses the story requirements
- [ ] Overall FAR score is calculated (average or minimum of three dimensions - clarify which)
- [ ] Validation passes if FAR score ≥ 4.0, fails if < 4.0

### Automatic Retry Logic
- [ ] Validation runs automatically after research action completes
- [ ] Failed validation triggers automatic research retry (up to 3 total attempts)
- [ ] Each retry receives structured feedback including:
  - [ ] Which FAR dimension(s) scored below threshold
  - [ ] Specific reasons for low scores
  - [ ] Concrete suggestions for improvement
- [ ] Retry counter persists in story state (prevent infinite loops on restart)

### Failure Handling
- [ ] After 3 failed validation attempts, story status changes to "blocked"
- [ ] Blocked story includes:
  - [ ] Clear validation failure reason (which FAR dimensions failed)
  - [ ] History of all validation scores across attempts
  - [ ] Actionable next steps for manual intervention
- [ ] Blocked stories do not automatically retry without manual intervention

### Integration & Testing
- [ ] Validation integrates into existing action workflow without breaking changes
- [ ] All existing tests pass (`npm test` succeeds)
- [ ] New unit tests cover:
  - [ ] FAR score calculation logic
  - [ ] Retry counter increment/reset logic
  - [ ] Validation feedback generation
- [ ] New integration tests cover:
  - [ ] End-to-end research → validation → retry flow
  - [ ] End-to-end research → validation → blocking flow
  - [ ] Validation feedback propagates to retry attempt

### Type Safety & Action Integration
- [ ] New `validate_research` action type added following conventions in CLAUDE.md
- [ ] ActionType union updated in `src/types/index.ts`
- [ ] Action verb added to `formatAction()` in `src/cli/commands.ts`
- [ ] Handler added to `executeAction()` in `src/cli/commands.ts`
- [ ] `npm run build` succeeds with no TypeScript errors

## Constraints & Edge Cases

### Scoring Constraints
- **Decision Required**: Should overall FAR score be the average of three dimensions, or the minimum? (e.g., [5, 5, 2] = 4.0 average but 2.0 minimum)
  - Recommendation: Use minimum to ensure all dimensions meet threshold
  
### Retry Behavior
- Research retries should use the same research agent configuration (model, tools, etc.)
- Feedback must be injected into the retry prompt without modifying original story requirements
- If research agent crashes during retry, it counts as a failed attempt

### Blocked Story Handling
- Blocked stories should remain visible in workflow but not auto-progress
- Manual unblocking should reset retry counter to 0
- Consider adding `unblock` action type for manual intervention

### Performance Considerations
- Validation agent should use `haiku` model (fast, cheap) since validation is structured evaluation
- Timeout: Validation should complete within 30 seconds or count as failed
- Large research outputs (>10k tokens) may need truncation before validation

### Edge Cases
1. **Empty research output**: Should auto-fail validation (score 0/0/0)
2. **Malformed research output**: Should auto-fail validation with clear error message
3. **Validation agent crashes**: Should count as failed attempt, not block indefinitely
4. **Story edited during retry**: Should cancel retry and reset validation state
5. **Multiple stories validating concurrently**: Ensure retry counters don't interfere

## Technical Notes

### Suggested Implementation Approach
1. Create `src/agents/validate-research.ts` with FAR scoring logic
2. Add `ValidationResult` type with `{ factual: number, actionable: number, relevant: number, passed: boolean, feedback: string }`
3. Store validation state in story: `{ validationAttempts: number, lastValidationResult?: ValidationResult }`
4. Modify research action to auto-trigger validation on completion
5. Create validation → retry loop in action executor

### Files Likely to Change
- `src/types/index.ts` (add ActionType, ValidationResult types)
- `src/cli/commands.ts` (add validate_research action handler)
- `src/agents/research.ts` (inject validation feedback on retry)
- `src/agents/validate-research.ts` (new file)
- `src/core/story.ts` (add validation state fields)

### Testing Strategy
- Unit test FAR scoring with mock research outputs (good/bad examples)
- Integration test full retry cycle with mocked agents
- Test edge cases (empty output, crashes, concurrent validation)

---

## Effort Estimate
**Effort**: medium

**Rationale**: Requires new agent creation, retry logic, state management, and integration with existing workflow. Not small (>1 file change, new patterns), not large (no architectural changes, clear scope).

## Labels
validation, research, quality-assurance, agent, retry-logic, blocking
