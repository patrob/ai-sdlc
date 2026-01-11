---
id: story-mk8p9g9u-030t
title: Enhance planning agent with TDD structure
priority: 2
status: backlog
type: feature
created: '2026-01-10'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Enhance planning agent with TDD structure

## Summary

Improve the planning agent (`src/agents/planning.ts`) to use TDD-focused structure with Red-Green-Refactor task patterns, modeled after the `software-task-planner` agent and `/rpi:plan` command from the RPI plugin. Planning consumes the research output from the story.

**Depends on**: Story 02a (FAR validation) - planning should receive validated research output.

**References**:
- `/Users/probinson/.claude/plugins/cache/on-par/rpi/0.6.0/agents/software-task-planner.md` - Agent patterns
- `/Users/probinson/.claude/plugins/cache/on-par/rpi/0.6.0/commands/plan.md` - TDD output format

## Acceptance Criteria

- [ ] Planning agent uses enhanced system prompt based on software-task-planner patterns
- [ ] Planning agent consumes the validated Research section from the story
- [ ] Plan output uses TDD triplets with indicators: 🔴 (write failing test), 🟢 (implement to pass), 🔵 (refactor)
- [ ] Each phase has: Goal, Context (file references), Tasks
- [ ] Plan references the Research section from the story (not a separate file path)
- [ ] Tasks are atomic and include explicit expectations: (expect fail), (expect pass), (keep passing)
- [ ] Output continues to go into story file's Implementation Plan section
- [ ] Existing tests pass and new tests cover the enhanced functionality

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
