---
id: S-0084
title: Convert Planning Agent to Class-Based Implementation
priority: 7
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
slug: convert-planning-agent
dependencies:
  - S-0082
  - S-0083
---
# Convert Planning Agent to Class-Based Implementation

## User Story

**As a** developer maintaining ai-sdlc
**I want** the planning agent converted to a class extending BaseAgent
**So that** it follows the new architecture and has injectable dependencies

## Summary

This story converts `src/agents/planning.ts` from a function-based implementation to a class-based implementation extending `BaseAgent`. This is one of the simpler agents to convert, making it a good starting point.

## Technical Context

**Current State:**
- `planning.ts` exports `runPlanning()` function
- Imports `runAgentQuery` directly
- Contains `PLANNING_SYSTEM_PROMPT` constant
- 224 lines

**Target State:**
- `PlanningAgent` class extending `BaseAgent`
- Provider injected via constructor
- System prompt as method
- Backward-compatible function export

## Acceptance Criteria

### PlanningAgent Class

- [ ] Create `PlanningAgent` class in `src/agents/planning.ts`
- [ ] Extend `BaseAgent`
- [ ] Implement all abstract methods:
  - [ ] `getSystemPrompt()`
  - [ ] `buildPrompt()`
  - [ ] `parseResult()`
- [ ] Define `requiredCapabilities`

### Class Structure

```typescript
export class PlanningAgent extends BaseAgent {
  readonly name = 'planning';
  readonly requiredCapabilities: (keyof ProviderCapabilities)[] = [
    'supportsSystemPrompt',
    'supportsTools',
  ];

  getSystemPrompt(context: AgentContext): string {
    return PLANNING_SYSTEM_PROMPT;
  }

  protected buildPrompt(context: AgentContext): string {
    // Build planning prompt from story content
  }

  protected parseResult(result: string, context: AgentContext): PlanningResult {
    // Parse implementation plan from result
  }
}
```

### Backward Compatibility

- [ ] Keep `runPlanning()` function export
- [ ] Function delegates to `PlanningAgent` instance
- [ ] Same function signature and return type

```typescript
// Backward compatibility wrapper
export async function runPlanning(
  storyPath: string,
  sdlcRoot: string,
  options?: PlanningOptions
): Promise<PlanningResult> {
  const agent = AgentFactory.create('planning');
  return agent.execute({ storyPath, sdlcRoot, options });
}
```

### Register with Factory

- [ ] Register `PlanningAgent` in `AgentFactory`

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/agents/planning.ts` | Modify | Convert to class + backward compat |
| `src/agents/factory.ts` | Modify | Register PlanningAgent |

## Testing Requirements

- [ ] Unit test: `PlanningAgent.execute()` with mock provider
- [ ] Unit test: System prompt generation
- [ ] Unit test: Result parsing
- [ ] Integration test: Backward compat function still works
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `PlanningAgent` class implemented
- [ ] Extends `BaseAgent` properly
- [ ] Registered with `AgentFactory`
- [ ] Backward-compatible function export
- [ ] All existing tests pass
- [ ] Build succeeds

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 6
- Current implementation: `src/agents/planning.ts`
