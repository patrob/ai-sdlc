---
id: story-mk8p9g9u-030t
title: Enhance planning agent with TDD structure
priority: 7
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
# Enhance planning agent with TDD structure

## User Story

**As a** developer using the AI-SDLC workflow  
**I want** the planning agent to generate structured, TDD-focused implementation plans with Red-Green-Refactor task patterns  
**So that** I can follow a test-driven development approach with clear atomic tasks and explicit test expectations

## Context

The current planning agent needs to be enhanced to match the patterns from the RPI plugin's `software-task-planner` agent and `/rpi:plan` command. The enhanced planner should consume validated research output from Story 02a and produce plans organized in TDD triplets (🔴 Red, 🟢 Green, 🔵 Refactor).

**Dependencies**: 
- Story 02a (FAR validation) - planning must receive validated research output from the story's Research section

**Reference Materials**:
- `~/.claude/plugins/cache/on-par/rpi/0.6.0/agents/software-task-planner.md` - Agent system prompt patterns
- `~/.claude/plugins/cache/on-par/rpi/0.6.0/commands/plan.md` - TDD output format specification

## Acceptance Criteria

### System Prompt Enhancement
- [ ] Planning agent uses an enhanced system prompt based on `software-task-planner` patterns
- [ ] System prompt explicitly instructs the agent to consume the Research section from the story document
- [ ] System prompt defines the TDD triplet structure (Red-Green-Refactor phases)

### Input Processing
- [ ] Planning agent reads and validates that a Research section exists in the story before planning
- [ ] Planning agent references specific research findings when creating tasks
- [ ] Planning agent handles missing or incomplete research gracefully (warns user, requests research be run first)

### Output Structure
- [ ] Plan uses TDD phase indicators: 🔴 Red (write failing test), 🟢 Green (implement to pass), 🔵 Refactor
- [ ] Each phase includes three components: Goal, Context (file references), Tasks
- [ ] Tasks are atomic (single, focused actions) and include explicit test expectations:
  - `(expect fail)` for Red phase test writing
  - `(expect pass)` for Green phase implementation
  - `(keep passing)` for Refactor phase improvements
- [ ] Plan output is written to the story file's "Implementation Plan" section (not a separate file)

### Integration
- [ ] Planning agent integrates with `executeAction()` in `src/cli/commands.ts` for the `plan` action type
- [ ] Planning maintains consistency with existing action patterns (refine, research, implement, etc.)
- [ ] Error handling provides clear messages if research is missing or invalid

### Testing
- [ ] Unit tests cover the planning agent's core logic (consuming research, generating TDD structure)
- [ ] Integration tests verify the full flow: story with research → planning agent → story with plan
- [ ] All existing tests continue to pass (`npm test` succeeds)
- [ ] New tests verify TDD triplet structure, atomic tasks, and explicit expectations
- [ ] Tests verify graceful handling of missing/invalid research input

### Documentation
- [ ] Planning agent's behavior is documented in code comments
- [ ] Example plan output is included in tests as a fixture/snapshot

## Edge Cases & Constraints

### Edge Cases
1. **Missing Research Section**: Story exists but has no or empty Research section
2. **Partial Research**: Research section is incomplete or only contains partial information
3. **Large Research Output**: Research section is very long; plan must still be focused and actionable
4. **Multi-file Changes**: Plan must reference multiple files in Context sections
5. **Complex Dependencies**: Tasks may have sequential dependencies within a phase
6. **Research References**: Plan must cite specific research findings without duplicating all research content

### Constraints
1. **No Breaking Changes**: Must maintain backward compatibility with existing story structure
2. **File Location**: Plan output must write to story file's Implementation Plan section (in-document, not separate file)
3. **Type Safety**: Must follow ActionType patterns defined in `src/types/index.ts`
4. **Testing Standards**: Must follow project's testing pyramid (unit tests colocated, integration in `tests/integration/`)
5. **No External Dependencies**: Should use existing Claude Agent SDK patterns, avoid new dependencies unless necessary
6. **Format Consistency**: TDD indicators (🔴🟢🔵) must be used consistently across all generated plans

### Technical Considerations
- Planning agent will need access to file system to read/write story content
- May need helper functions to parse and validate Research section format
- Should reuse existing story file I/O utilities if available
- Consider prompt token limits when including research context in agent prompt

## Implementation Notes

### Key Files to Modify
- `src/agents/planning.ts` - Main planning agent logic
- `src/cli/commands.ts` - Integration with `executeAction()` for `plan` action
- `src/types/index.ts` - Verify `ActionType` includes `plan` (likely already exists)

### Suggested Approach
1. **Phase 1**: Extract and study patterns from reference files (`software-task-planner.md`, `plan.md`)
2. **Phase 2**: Create story parsing utilities (extract Research section, validate format)
3. **Phase 3**: Build enhanced system prompt with TDD structure instructions
4. **Phase 4**: Implement planning agent with TDD triplet generation
5. **Phase 5**: Add comprehensive tests (unit + integration)
6. **Phase 6**: Integrate with CLI commands and validate end-to-end flow

---

## Research

<!-- Populated by research agent -->

## Implementation Plan

<!-- Populated by planning agent -->

## Review Notes

<!-- Populated by review agents -->

---

**Effort**: large  
**Labels**: enhancement, planning-agent, tdd, agent-architecture, depends-on-02a
