---
id: S-0082
title: Create IAgent Interface and BaseAgent Abstract Class
priority: 5
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
slug: create-iagent-interface
dependencies:
  - S-0078
---
# Create IAgent Interface and BaseAgent Abstract Class

## User Story

**As a** developer maintaining ai-sdlc
**I want** a common interface and base class for all agents
**So that** agents have consistent structure, injectable dependencies, and testable design

## Summary

This story creates the foundational `IAgent` interface and `BaseAgent` abstract class that all agents will implement. This enables dependency injection (provider, logger), consistent execution patterns, and capability validation.

## Technical Context

**Current State:**
- Agents are standalone functions (e.g., `runResearch()`, `runPlanning()`)
- Each agent imports `runAgentQuery` directly
- No common structure or interface
- Hardcoded system prompts in each file

**Target State:**
- `IAgent` interface defining agent contract
- `BaseAgent` abstract class with:
  - Injected `IProvider` dependency
  - Template method for execution lifecycle
  - Capability validation
  - Common utilities (logging, prompt building)

## Acceptance Criteria

### IAgent Interface

- [ ] Create `src/agents/types.ts` with:
  - [ ] `IAgent` interface
  - [ ] `AgentContext` interface
  - [ ] `AgentResult` type (unified)
  - [ ] `AgentOptions` interface

### Interface Definition

```typescript
export interface IAgent {
  readonly name: string;
  readonly requiredCapabilities: (keyof ProviderCapabilities)[];

  execute(context: AgentContext): Promise<AgentResult>;
  getSystemPrompt(context: AgentContext): string;
}

export interface AgentContext {
  storyPath: string;
  sdlcRoot: string;
  provider: IProvider;
  options?: AgentOptions;
}

export interface AgentOptions {
  onProgress?: ProviderProgressCallback;
  timeout?: number;
  model?: string;
}
```

### BaseAgent Abstract Class

- [ ] Create `src/agents/base-agent.ts` with:
  - [ ] Constructor accepting `IProvider`
  - [ ] Capability validation in constructor
  - [ ] Template method `execute()` with lifecycle hooks
  - [ ] Abstract methods for subclasses
  - [ ] Protected `runQuery()` helper

### Template Method Pattern

```typescript
export abstract class BaseAgent implements IAgent {
  abstract readonly name: string;
  abstract readonly requiredCapabilities: (keyof ProviderCapabilities)[];

  constructor(protected provider: IProvider) {
    this.validateCapabilities();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      this.beforeExecute(context);
      const prompt = this.buildPrompt(context);
      const result = await this.runQuery(prompt, context);
      const parsed = this.parseResult(result, context);
      await this.afterExecute(context, parsed);
      return this.buildSuccessResult(parsed);
    } catch (error) {
      return this.buildErrorResult(error);
    }
  }

  // Hook methods (optional override)
  protected beforeExecute(context: AgentContext): void {}
  protected afterExecute(context: AgentContext, result: unknown): void {}

  // Abstract methods (must implement)
  abstract getSystemPrompt(context: AgentContext): string;
  protected abstract buildPrompt(context: AgentContext): string;
  protected abstract parseResult(result: string, context: AgentContext): unknown;
}
```

### Capability Validation

- [ ] Validate provider supports required capabilities
- [ ] Throw clear error if capability missing
- [ ] Log validation at debug level

## Files to Create

| File | Purpose |
|------|---------|
| `src/agents/types.ts` | Agent interface definitions |
| `src/agents/base-agent.ts` | BaseAgent abstract class |
| `src/agents/index.ts` | Barrel export for agents module |

## Testing Requirements

- [ ] Unit test: Capability validation
- [ ] Unit test: Template method execution order
- [ ] Unit test: Error handling in execute()
- [ ] Mock provider for testing
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `IAgent` interface defined
- [ ] `BaseAgent` abstract class implemented
- [ ] Template method pattern working
- [ ] Capability validation implemented
- [ ] All tests pass
- [ ] Build succeeds

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 3.4
- Design Pattern: Template Method Pattern
- SOLID Principle: Dependency Inversion (DIP), Liskov Substitution (LSP)
