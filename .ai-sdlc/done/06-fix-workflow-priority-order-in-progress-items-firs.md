---
id: story-mk6yzmne-06ta
title: >-
  Fix workflow priority order: in-progress items first (finish WIP), then ready
  items, then backlog refinement. Current logic is backwards.
priority: 6
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
---
# Fix workflow priority order: in-progress items first (finish WIP), then ready items, then backlog refinement

## Summary

**As a** development team using this workflow automation system,  
**I want** the agent to prioritize work-in-progress items first, then ready items, and finally backlog refinement,  
**So that** we finish started work before taking on new tasks and maintain healthy WIP limits.

The current implementation has the priority order backwards, causing the system to refine backlog items before completing in-progress work, which violates lean principles and increases context switching.

## Acceptance Criteria

- [ ] Agent checks for in-progress items first and completes them before moving to other work
- [ ] After all in-progress items are complete, agent processes items in the ready state
- [ ] Backlog refinement only occurs when there are no in-progress or ready items
- [ ] Priority logic is clearly documented in code comments
- [ ] Existing unit tests are updated to reflect correct priority order
- [ ] New tests verify that WIP items are processed before ready items
- [ ] New tests verify that ready items are processed before backlog items
- [ ] Agent logs indicate which priority tier it's working on (in-progress/ready/backlog)

## Constraints & Edge Cases

**Constraints:**
- Must not break existing workflow state transitions
- Should maintain backward compatibility with existing story data structures
- Priority logic should be configurable if different teams have different preferences

**Edge Cases:**
- Multiple items in the same priority tier (should have clear secondary sort order)
- Items that transition states while agent is working (e.g., item moves from ready to in-progress)
- Empty states (no items in a priority tier)
- Blocked in-progress items (should they be skipped or wait?)
- Items with dependencies across priority tiers

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->

---

**effort:** small  
**labels:** bug, priority-order, workflow, technical-debt, lean-principles
