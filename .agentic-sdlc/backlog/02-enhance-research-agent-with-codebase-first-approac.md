---
id: story-mk8p9bu7-bjga
title: Enhance research agent with codebase-first approach
priority: 1
status: backlog
type: feature
created: '2026-01-10'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Enhance research agent with codebase-first approach

## Summary

Improve the research agent (`src/agents/research.ts`) to use a more sophisticated codebase-first approach modeled after the `codebase-solution-researcher` agent from the RPI plugin. The research should deeply analyze the existing codebase with structured output.

**Reference**: See `/Users/probinson/.claude/plugins/cache/on-par/rpi/0.6.0/agents/codebase-solution-researcher.md` for the prompting patterns to adopt.

## Acceptance Criteria

- [ ] Research agent uses enhanced system prompt based on codebase-solution-researcher patterns
- [ ] Research output includes structured sections: Problem Summary, Codebase Context, Files Requiring Changes, Testing Strategy, Additional Context
- [ ] `gatherCodebaseContext()` is improved to do deeper analysis (trace dependencies, find patterns, identify affected files)
- [ ] Output continues to go into story file's Research section (no new markdown files)
- [ ] Existing tests pass and new tests cover the enhanced functionality

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
