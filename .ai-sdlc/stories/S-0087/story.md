---
id: S-0087
title: Convert Implementation Agent to Class-Based
priority: 10
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
slug: convert-implementation-agent
dependencies:
  - S-0082
  - S-0083
---
# Convert Implementation Agent to Class-Based Implementation

## User Story

**As a** developer maintaining ai-sdlc
**I want** the implementation agent converted to a class extending BaseAgent
**So that** it follows the new architecture and supports the Generator-Critic pattern

## Summary

This story converts `src/agents/implementation.ts` from a function-based implementation to a class-based implementation extending `BaseAgent`. The implementation agent is central to the TDD workflow and implements the "Generator" role in the Generator-Critic pattern.

## Technical Context

**Current State:**
- `implementation.ts` exports `runImplementation()` function
- Handles TDD phases (red, green, refactor)
- Contains retry logic for implementation failures
- ~400 lines

**Target State:**
- `ImplementationAgent` class extending `BaseAgent`
- TDD phases as structured methods
- Provider injected via constructor
- Backward-compatible function export

## Acceptance Criteria

### ImplementationAgent Class

- [ ] Create `ImplementationAgent` class in `src/agents/implementation.ts`
- [ ] Extend `BaseAgent`
- [ ] Implement TDD phase methods:
  - [ ] `runRedPhase()` - Write failing tests
  - [ ] `runGreenPhase()` - Make tests pass
  - [ ] `runRefactorPhase()` - Clean up code
- [ ] Define `requiredCapabilities`

### Class Structure

```typescript
export class ImplementationAgent extends BaseAgent {
  readonly name = 'implementation';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsSystemPrompt',
    'supportsTools',
    'supportsMultiTurn',
  ];

  async execute(context: AgentContext): Promise<ImplementationResult> {
    // Full TDD cycle
  }

  async runRedPhase(context: AgentContext, task: ImplementationTask): Promise<PhaseResult> {
    // Write failing tests
  }

  async runGreenPhase(context: AgentContext, task: ImplementationTask): Promise<PhaseResult> {
    // Make tests pass
  }

  async runRefactorPhase(context: AgentContext): Promise<PhaseResult> {
    // Clean up
  }
}
```

### Generator-Critic Integration

- [ ] Designed to work with `ReviewAgent` as critic
- [ ] Result format compatible with review feedback
- [ ] Supports iteration on review feedback

### Backward Compatibility

- [ ] Keep `runImplementation()` function export
- [ ] Function delegates to `ImplementationAgent`

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/agents/implementation.ts` | Modify | Convert to class + backward compat |
| `src/agents/factory.ts` | Modify | Register ImplementationAgent |

## Testing Requirements

- [ ] Unit test: `ImplementationAgent.execute()`
- [ ] Unit test: Individual TDD phase methods
- [ ] Unit test: Retry logic
- [ ] Integration test: Backward compat function
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `ImplementationAgent` class implemented
- [ ] All TDD phases working
- [ ] Registered with `AgentFactory`
- [ ] Backward-compatible function export
- [ ] All existing tests pass
- [ ] Build succeeds

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 10.6
- Google ADK Pattern: Generator-Critic (implementation is generator)
- Current implementation: `src/agents/implementation.ts`
