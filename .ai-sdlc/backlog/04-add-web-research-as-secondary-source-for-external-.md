---
id: story-mk8p9hcm-163q
title: Add web research as secondary source for external libraries and docs
priority: 3
status: backlog
type: feature
created: '2026-01-10'
labels: []
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
---
# Add web research as secondary source for external libraries and docs

## Summary

Extend the research agent to optionally use web research as a secondary source AFTER codebase analysis is complete. Web research should be used for:
- External library documentation and best practices
- Solutions to problems not found in the codebase
- Current industry patterns for the problem domain

**Depends on**: Story 02 (codebase-first research) should be completed first.

**Reference**: See `/Users/probinson/.claude/plugins/cache/on-par/rpi/0.6.0/agents/web-research-specialist.md` for the web research patterns.

## Acceptance Criteria

- [ ] Research agent performs codebase analysis FIRST (existing behavior from Story 02)
- [ ] After codebase analysis, agent determines if web research would help (external libraries, unfamiliar patterns, etc.)
- [ ] Web research uses Context7 MCP tools when available for library docs
- [ ] Web research uses WebSearch/WebFetch for general solutions
- [ ] Web research findings are integrated into the structured output under a "Web Research Findings" section
- [ ] Agent includes FAR scale evaluation for web research portion
- [ ] Output continues to go into story file's Research section
- [ ] Existing tests pass and new tests cover web research integration

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->
