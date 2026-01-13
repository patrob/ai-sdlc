---
id: S-0017
title: Add feedback accumulation to prevent retry loop starvation
priority: 26
status: backlog
type: feature
created: '2026-01-13'
labels:
  - p2-polish
  - reliability
  - agent-improvement
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: feedback-accumulation-retry-learning
---
# Add feedback accumulation to prevent retry loop starvation

## User Story

**As a** developer running retry loops on failing stories
**I want** each retry attempt to accumulate and learn from previous failures
**So that** the same mistakes aren't repeated across retries

## Summary

Currently, retry loops can get "stuck" making the same mistakes. The ReworkContext exists but needs enhancement to track persistent issues across attempts and emphasize them in prompts. This prevents wasting retries on the same problems.

## Acceptance Criteria

- [ ] Create `getReworkContext(story)` function that aggregates all previous review feedback
- [ ] Include in rework context:
  - Summary of issues from each previous attempt
  - Which issues persist across attempts (high priority)
  - Which issues were fixed (for positive reinforcement)
  - Total retry count and remaining attempts
- [ ] Update implementation agent prompt to include accumulated context when `story.frontmatter.retry_count > 0`
- [ ] Add `persistent_issues` tracking to story frontmatter (issues that appear in 2+ reviews)
- [ ] When persistent issues exist, add emphasis in agent prompt: "These issues have persisted across attempts"
- [ ] Unit tests for context accumulation logic
- [ ] Integration test: third retry attempt includes context from first two failures

## Technical Notes

**Files to modify:**
- `src/agents/rework.ts` - Enhance `packageReworkContext` (~line 164)
- `src/agents/implementation.ts` - Use accumulated context (~line 666)
- `src/types/index.ts` - Add `persistent_issues?: string[]` to StoryFrontmatter

**Implementation hints:**
- Compare current issues against previous `review_history` to identify persistent ones
- Consider exponential backoff on retries (more context/detail on later attempts)
- Pattern: issues appearing in 2+ reviews get tagged as "persistent"

**Complexity:** Medium (2-3 days)

## Out of Scope

- Machine learning-based issue classification
- Automatic escalation to human
- Cross-story learning (learning from other stories' failures)
