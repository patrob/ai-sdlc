---
id: S-0014
title: Enhance research agent with codebase-first approach
priority: 5
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
slug: enhance-research-agent-with-codebase-first-approac
---
I'll refine this story into a well-defined, actionable user story with clear acceptance criteria and testable outcomes.

---

# Enhance research agent with codebase-first approach

## User Story

**As a** developer using the ai-sdlc workflow,  
**I want** the research agent to deeply analyze the existing codebase using structured investigation patterns,  
**So that** I get comprehensive, actionable research output that identifies all relevant files, dependencies, and patterns before implementation begins.

## Summary

The current research agent provides basic codebase context. This enhancement will adopt sophisticated prompting patterns from the `codebase-solution-researcher` agent (RPI plugin) to produce structured, thorough research output that traces dependencies, identifies affected files, and provides a clear foundation for planning and implementation.

**Reference**: `/Users/probinson/.claude/plugins/cache/on-par/rpi/0.6.0/agents/codebase-solution-researcher.md`

## Acceptance Criteria

- [ ] Research agent's system prompt is updated with codebase-solution-researcher patterns (structured investigation approach, comprehensive file analysis)
- [ ] Research output includes all required structured sections:
  - [ ] Problem Summary (clear statement of what needs to be researched)
  - [ ] Codebase Context (existing patterns, architecture, related implementations)
  - [ ] Files Requiring Changes (identified files with rationale for each)
  - [ ] Testing Strategy (relevant test files, patterns to follow)
  - [ ] Additional Context (constraints, dependencies, edge cases)
- [ ] `gatherCodebaseContext()` function performs deeper analysis:
  - [ ] Traces import/export dependencies for relevant files
  - [ ] Identifies architectural patterns used in similar features
  - [ ] Locates related test files and testing patterns
  - [ ] Discovers configuration files or constants that may be affected
- [ ] Research output is written to story file's `## Research` section (maintains existing behavior)
- [ ] All existing tests pass (`npm test` with 0 failures)
- [ ] New unit tests cover enhanced `gatherCodebaseContext()` functionality
- [ ] `npm run build` succeeds with no type errors

## Constraints & Edge Cases

**Constraints:**
- Must maintain compatibility with existing story file format (markdown sections)
- Research output must remain machine-readable for downstream agents (planning, implementation)
- Cannot introduce external dependencies beyond existing stack (Claude Agent SDK, existing tools)
- Must respect project file hygiene rules (no temp files, no shell scripts)

**Edge Cases:**
- Story requests research on new feature with no existing similar code → Research should acknowledge this and suggest starting patterns from closest analogous features
- Very large codebases → May need to limit depth of dependency tracing or use sampling strategies
- Research for modifications to core types/interfaces → Must identify all downstream consumers
- External dependencies without source → Document API surface from usage patterns

## Technical Considerations

1. **Prompting Strategy**: Study the referenced `codebase-solution-researcher.md` for:
   - Instruction structure and ordering
   - Output format specifications
   - Depth-of-analysis directives

2. **Tool Usage**: Leverage existing CLI tools effectively:
   - `Glob` for pattern-based file discovery
   - `Grep` for usage/reference tracing
   - `Read` for in-depth file analysis
   - `LSP` (if available) for symbol navigation

3. **Testing Approach**: 
   - Unit test `gatherCodebaseContext()` with fixture codebases
   - Integration test full research execution flow with mocked file system
   - Verify structured output format is parseable and complete

4. **Performance**: Research should complete in reasonable time (<2 minutes for typical stories)

## Definition of Done

- [ ] Code review completed
- [ ] All tests passing (`npm test` shows 0 failures)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Manual verification: Research output for a sample story includes all structured sections
- [ ] No temporary files created during development

---

**effort:** medium

**labels:** enhancement, agent-improvement, research-agent, code-quality
