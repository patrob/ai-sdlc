---
id: S-0085
title: Convert Review Agent to Class-Based Implementation
priority: 8
status: backlog
type: refactor
created: '2026-01-19'
labels:
  - architecture
  - agent-abstraction
  - epic-modular-architecture
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: convert-review-agent
dependencies:
  - S-0082
  - S-0083
---
# Convert Review Agent to Class-Based Implementation

## User Story

**As a** developer maintaining ai-sdlc
**I want** the review agent converted to a class extending BaseAgent
**So that** it follows the new architecture and has injectable dependencies

## Summary

This story converts `src/agents/review.ts` from a function-based implementation to a class-based implementation extending `BaseAgent`. The review agent is moderately complex with multiple review types and sub-reviews.

## Technical Context

**Current State:**
- `review.ts` exports multiple functions (`runReview()`, `runUnifiedReview()`, etc.)
- Contains review-specific prompts and evaluation logic
- Handles multiple review aspects (correctness, style, security, performance)
- ~500 lines

**Target State:**
- `ReviewAgent` class extending `BaseAgent`
- Sub-review logic encapsulated as methods
- Provider injected via constructor
- Backward-compatible function exports

## Acceptance Criteria

### ReviewAgent Class

- [ ] Create `ReviewAgent` class in `src/agents/review.ts`
- [ ] Extend `BaseAgent`
- [ ] Implement all abstract methods
- [ ] Define `requiredCapabilities`

### Review Types Support

- [ ] Support unified review mode
- [ ] Support aspect-based reviews (security, style, performance, correctness)
- [ ] Support recovery mode reviews

### Class Structure

```typescript
export class ReviewAgent extends BaseAgent {
  readonly name = 'review';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsSystemPrompt',
    'supportsTools',
  ];

  async execute(context: AgentContext): Promise<ReviewResult> {
    // Main review execution
  }

  async reviewAspect(
    context: AgentContext,
    aspect: ReviewAspect
  ): Promise<AspectReviewResult> {
    // Single aspect review
  }

  getSystemPrompt(context: AgentContext): string {
    return this.buildReviewSystemPrompt(context);
  }
}
```

### Backward Compatibility

- [ ] Keep `runReview()` function export
- [ ] Keep `runUnifiedReview()` function export
- [ ] Functions delegate to `ReviewAgent` instance

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/agents/review.ts` | Modify | Convert to class + backward compat |
| `src/agents/factory.ts` | Modify | Register ReviewAgent |

## Testing Requirements

- [ ] Unit test: `ReviewAgent.execute()` with mock provider
- [ ] Unit test: Aspect-based review
- [ ] Unit test: Review result parsing
- [ ] Integration test: Backward compat functions
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `ReviewAgent` class implemented
- [ ] All review modes supported
- [ ] Registered with `AgentFactory`
- [ ] Backward-compatible function exports
- [ ] All existing tests pass
- [ ] Build succeeds

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 6
- Current implementation: `src/agents/review.ts`
- Google ADK Pattern: Generator-Critic (review is the critic)
