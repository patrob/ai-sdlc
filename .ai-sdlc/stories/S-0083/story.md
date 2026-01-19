---
id: S-0083
title: Create AgentFactory for Agent Instantiation
priority: 6
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
slug: create-agent-factory
dependencies:
  - S-0078
  - S-0079
  - S-0082
---
# Create AgentFactory for Agent Instantiation

## User Story

**As a** developer maintaining ai-sdlc
**I want** a centralized factory for creating agent instances
**So that** agents are created with correct dependencies and can be extended/replaced

## Summary

This story implements the `AgentFactory` class that creates agent instances with injected dependencies (provider, logger). This centralizes agent creation, enables dependency injection, and supports future custom agent registration.

## Technical Context

**Current State:**
- Agents are functions called directly
- No centralized creation
- Dependencies (like `runAgentQuery`) imported directly in each agent

**Target State:**
- `AgentFactory` creates all agent instances
- Provider injected at creation time
- Type-safe agent resolution by name

## Acceptance Criteria

### AgentFactory Class

- [ ] Create `src/agents/factory.ts` with:
  - [ ] `create(type: AgentType): IAgent` - Create agent by type
  - [ ] `createWithProvider(type: AgentType, provider: IProvider): IAgent` - Create with specific provider
  - [ ] `registerAgent(type: string, factory: AgentFactoryFn): void` - Register custom agents
  - [ ] `listAgentTypes(): string[]` - List available agent types

### AgentType Enum

```typescript
export type AgentType =
  | 'research'
  | 'planning'
  | 'implementation'
  | 'review'
  | 'single-task'
  | 'orchestrator'
  | 'rework'
  | 'state-assessor'
  | 'refinement';
```

### Default Provider Resolution

- [ ] Use `ProviderRegistry.getDefault()` when no provider specified
- [ ] Allow provider override for testing

### Factory Implementation

```typescript
export class AgentFactory {
  private static customAgents = new Map<string, AgentFactoryFn>();

  static create(type: AgentType): IAgent {
    const provider = ProviderRegistry.getDefault();
    return this.createWithProvider(type, provider);
  }

  static createWithProvider(type: AgentType, provider: IProvider): IAgent {
    // Check custom agents first
    if (this.customAgents.has(type)) {
      return this.customAgents.get(type)!(provider);
    }

    // Built-in agents
    switch (type) {
      case 'research':
        return new ResearchAgent(provider);
      case 'planning':
        return new PlanningAgent(provider);
      // ... etc
      default:
        throw new Error(`Unknown agent type: ${type}`);
    }
  }

  static registerAgent(type: string, factory: AgentFactoryFn): void {
    this.customAgents.set(type, factory);
  }
}
```

### Integration

- [ ] Existing code can still use functions (backward compat wrapper)
- [ ] New code uses factory

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/agents/factory.ts` | Create | AgentFactory implementation |
| `src/agents/index.ts` | Modify | Export factory |

## Testing Requirements

- [ ] Unit test: Create each agent type
- [ ] Unit test: Custom agent registration
- [ ] Unit test: Unknown agent type error
- [ ] Unit test: Provider injection
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `AgentFactory` class implemented
- [ ] All built-in agent types supported
- [ ] Custom agent registration working
- [ ] Exported from agents module
- [ ] All tests pass
- [ ] Build succeeds

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 5.2
- Design Pattern: Factory Pattern
- SOLID Principle: Open/Closed (OCP)
