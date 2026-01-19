---
id: S-0079
title: Create ProviderRegistry for Provider Management
priority: 2
status: backlog
type: refactor
created: '2026-01-19'
labels:
  - architecture
  - provider-abstraction
  - epic-modular-architecture
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: create-provider-registry
dependencies:
  - S-0078
---
# Create ProviderRegistry for Provider Management

## User Story

**As a** developer maintaining ai-sdlc
**I want** a centralized registry for AI providers
**So that** providers can be registered, resolved, and swapped without code changes

## Summary

This story implements the `ProviderRegistry` class that manages provider registration, instantiation, and resolution. It follows the Registry pattern to enable runtime provider selection and lazy initialization.

## Technical Context

**Current State:**
- No provider management - Claude SDK is directly imported
- Provider selection is not possible

**Target State:**
- Central registry for all providers
- Lazy instantiation (providers created on first use)
- Environment variable support for default provider selection
- Type-safe provider resolution

## Acceptance Criteria

### ProviderRegistry Class

- [ ] Create `src/providers/registry.ts` with:
  - [ ] `register(name: string, factory: () => IProvider)` - Register a provider factory
  - [ ] `get(name: string): IProvider` - Get provider by name (lazy instantiation)
  - [ ] `getDefault(): IProvider` - Get default provider (from config or env)
  - [ ] `listProviders(): string[]` - List registered provider names
  - [ ] `hasProvider(name: string): boolean` - Check if provider is registered
  - [ ] `clearInstances(): void` - Clear cached instances (for testing)

### Default Provider Selection

- [ ] Check `AI_SDLC_PROVIDER` environment variable
- [ ] Fall back to 'claude' if not specified
- [ ] Throw clear error if requested provider not registered

### Singleton Pattern

- [ ] Provider instances cached after first creation
- [ ] Same instance returned on subsequent calls
- [ ] `clearInstances()` method for test isolation

### Error Handling

- [ ] Clear error message when provider not found
- [ ] List available providers in error message

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/registry.ts` | Create | ProviderRegistry implementation |
| `src/providers/index.ts` | Modify | Export ProviderRegistry |

## Implementation Specification

```typescript
// src/providers/registry.ts

import { IProvider } from './types.js';

export class ProviderRegistry {
  private static providers = new Map<string, () => IProvider>();
  private static instances = new Map<string, IProvider>();

  static register(name: string, factory: () => IProvider): void {
    this.providers.set(name, factory);
  }

  static get(name: string): IProvider {
    if (!this.instances.has(name)) {
      const factory = this.providers.get(name);
      if (!factory) {
        const available = Array.from(this.providers.keys()).join(', ');
        throw new Error(
          `Provider '${name}' is not registered. Available: ${available || 'none'}`
        );
      }
      this.instances.set(name, factory());
    }
    return this.instances.get(name)!;
  }

  static getDefault(): IProvider {
    const defaultName = process.env.AI_SDLC_PROVIDER || 'claude';
    return this.get(defaultName);
  }

  static listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  static hasProvider(name: string): boolean {
    return this.providers.has(name);
  }

  static clearInstances(): void {
    this.instances.clear();
  }
}
```

## Testing Requirements

- [ ] Unit test: Register and retrieve provider
- [ ] Unit test: Lazy instantiation (factory called only once)
- [ ] Unit test: Default provider resolution
- [ ] Unit test: Error when provider not found
- [ ] Unit test: `clearInstances()` for test isolation
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `ProviderRegistry` class implemented
- [ ] All methods tested
- [ ] Exported from `src/providers/index.ts`
- [ ] Documentation comments on public methods
- [ ] All tests pass
- [ ] Build succeeds

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 3.3
- Design Pattern: Registry Pattern
- SOLID Principle: Open/Closed (OCP)
