---
id: S-0088
title: Convert Remaining Agents to Class-Based
priority: 11
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
slug: convert-remaining-agents
dependencies:
  - S-0082
  - S-0083
  - S-0084
---
# Convert Remaining Agents to Class-Based

## User Story

**As a** developer maintaining ai-sdlc
**I want** all remaining agents converted to classes extending BaseAgent
**So that** the entire agent system follows the new architecture consistently

## Summary

This story converts the remaining agents to class-based implementations: `single-task`, `orchestrator`, `rework`, `state-assessor`, and `refinement`. These are grouped together as they are lower complexity conversions.

## Technical Context

**Remaining Agents:**
| Agent | File | Lines | Complexity |
|-------|------|-------|------------|
| single-task | `single-task.ts` | 442 | Medium |
| orchestrator | `orchestrator.ts` | 579 | Medium |
| rework | `rework.ts` | 212 | Low |
| state-assessor | `state-assessor.ts` | ~100 | Low |
| refinement | `refinement.ts` | ~200 | Medium |

## Acceptance Criteria

### SingleTaskAgent

- [ ] Create `SingleTaskAgent` class
- [ ] Handles individual task implementation
- [ ] Implements hierarchical decomposition pattern
- [ ] Backward-compatible `runSingleTask()` export

### OrchestratorAgent

- [ ] Create `OrchestratorAgent` class
- [ ] Coordinates task execution
- [ ] Implements coordinator/dispatcher pattern
- [ ] Backward-compatible `runOrchestrator()` export

### ReworkAgent

- [ ] Create `ReworkAgent` class
- [ ] Handles error remediation
- [ ] Implements iterative refinement pattern
- [ ] Backward-compatible `runRework()` export

### StateAssessorAgent

- [ ] Create `StateAssessorAgent` class
- [ ] Assesses workflow state
- [ ] Minimal complexity conversion
- [ ] Backward-compatible `assessState()` export

### RefinementAgent

- [ ] Create `RefinementAgent` class
- [ ] Manages refinement loop
- [ ] Implements iterative refinement pattern
- [ ] Backward-compatible `runRefinement()` export

### All Classes

- [ ] Extend `BaseAgent`
- [ ] Implement required abstract methods
- [ ] Define `requiredCapabilities`
- [ ] Register with `AgentFactory`

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/agents/single-task.ts` | Modify | Convert to SingleTaskAgent |
| `src/agents/orchestrator.ts` | Modify | Convert to OrchestratorAgent |
| `src/agents/rework.ts` | Modify | Convert to ReworkAgent |
| `src/agents/state-assessor.ts` | Modify | Convert to StateAssessorAgent |
| `src/agents/refinement.ts` | Modify | Convert to RefinementAgent |
| `src/agents/factory.ts` | Modify | Register all new agents |

## Testing Requirements

- [ ] Unit tests for each new agent class
- [ ] Integration tests for backward compat functions
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] All 5 agents converted to classes
- [ ] All extend `BaseAgent`
- [ ] All registered with `AgentFactory`
- [ ] All backward-compatible exports working
- [ ] All existing tests pass
- [ ] Build succeeds

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 6
- Google ADK Patterns: Coordinator, Hierarchical, Iterative Refinement
