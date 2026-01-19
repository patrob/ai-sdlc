---
id: S-0066
title: Blocking Condition Detection
priority: 16
status: backlog
type: feature
created: '2026-01-18'
labels:
  - automation
  - error-handling
  - p1-production
  - epic-backlog-processor
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: blocking-condition-detection
---
# Blocking Condition Detection

## User Story

**As a** developer using ai-sdlc batch processing
**I want** the system to intelligently classify blocking conditions
**So that** transient errors are auto-retried while conditions requiring my input stop processing

## Summary

This story adds intelligent classification of blocking conditions. The system must distinguish between:
1. **Auto-recoverable**: Transient API errors, minor test failures (retry automatically)
2. **Requires human input**: Ambiguous requirements, architecture decisions, max retries exceeded (stop and notify)

This enables the backlog processor to make smart decisions about when to continue vs when to pause for user intervention.

## Technical Context

**Existing Infrastructure:**
- Circuit breakers in `kanban.ts` for max retries/refinements
- `moveToBlocked()` in `story.ts` with reason tracking
- Error handling in `runner.ts` and `daemon.ts`

**New Components:**
- `BlockingDetector` service with classification logic
- `BlockingCategory` enum for categorization
- Integration with BacklogProcessor

## Acceptance Criteria

- [ ] Create `BlockingDetector` service in `src/services/blocking-detector.ts`
- [ ] Define blocking categories:
  - `transient` - API rate limits, network errors (auto-retry)
  - `test_failure` - Tests fail after N attempts (block)
  - `requirements_unclear` - Missing acceptance criteria, ambiguous scope (block)
  - `approval_required` - Security review, architecture decision needed (block)
  - `external_dependency` - Waiting on external API/service (block)
  - `max_retries_exceeded` - Circuit breaker tripped (block)
  - `merge_conflict` - Git conflicts detected (block)
- [ ] Classify errors from agent responses:
  - Detect "I need clarification on..." → `requirements_unclear`
  - Detect "This requires approval..." → `approval_required`
  - Detect test failures after 2+ attempts → `test_failure`
- [ ] Return structured `BlockingDecision`:
  ```typescript
  interface BlockingDecision {
    category: BlockingCategory;
    autoRecoverable: boolean;
    reason: string;
    suggestedAction: string;
  }
  ```
- [ ] Integrate with existing `moveToBlocked()` to set appropriate reason
- [ ] Log classification decisions at DEBUG level for troubleshooting

## Blocking Category Details

| Category | Auto-Recoverable | Example Trigger | Suggested Action |
|----------|-----------------|-----------------|------------------|
| `transient` | Yes | 429, 503, ETIMEDOUT | Wait and retry |
| `test_failure` | No | Tests fail 2+ times | Review test output, fix code |
| `requirements_unclear` | No | Agent asks clarifying question | Update acceptance criteria |
| `approval_required` | No | Security/architecture decision | Get stakeholder sign-off |
| `external_dependency` | No | External API unavailable | Resolve external blocker |
| `max_retries_exceeded` | No | 3+ full cycle failures | Investigate root cause |
| `merge_conflict` | No | Git merge conflict | Resolve conflicts manually |

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/services/blocking-detector.ts` | Create | BlockingDetector service |
| `src/types/index.ts` | Modify | Add BlockingCategory, BlockingDecision |
| `src/core/story.ts` | Modify | Enhance moveToBlocked() with category |
| `tests/unit/blocking-detector.test.ts` | Create | Unit tests for classification |

## Detection Heuristics

**From Agent Response Text:**
```typescript
const clarificationPatterns = [
  /I need (more information|clarification|details) (about|on|regarding)/i,
  /Could you (clarify|specify|explain)/i,
  /The requirements (are unclear|don't specify)/i,
  /Before I can proceed, I need to know/i
];

const approvalPatterns = [
  /This (requires|needs) (approval|sign-off|review)/i,
  /security (review|approval|assessment)/i,
  /architecture decision/i
];
```

**From Error Types:**
```typescript
const transientErrors = [429, 503, 'ETIMEDOUT', 'ECONNRESET'];
const permanentErrors = [400, 401, 403, 404];
```

## Edge Cases

- Agent asks question but continues working → Not a block
- Test failure on first attempt → Retry, don't block yet
- Multiple categories apply → Use most specific (e.g., `requirements_unclear` over `max_retries`)
- Unknown error type → Default to blocking with `unknown` category

## Definition of Done

- [ ] BlockingDetector service implemented
- [ ] All 7 blocking categories properly classified
- [ ] Unit tests for each category with sample inputs
- [ ] Integration with moveToBlocked() verified
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
