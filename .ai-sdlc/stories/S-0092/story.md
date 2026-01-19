---
id: S-0092
title: Create Provider Adapter Framework
priority: 15
status: backlog
type: feature
created: '2026-01-19'
labels:
  - architecture
  - provider-abstraction
  - extensibility
  - epic-modular-architecture
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: provider-adapter-framework
dependencies:
  - S-0078
  - S-0079
  - S-0080
  - S-0091
---
# Create Provider Adapter Framework

## User Story

**As a** developer wanting to add a new AI provider
**I want** a clear adapter framework with documentation
**So that** I can integrate new providers (like GitHub Copilot SDK) with minimal effort

## Summary

This story creates a provider adapter framework that makes it easy to add new AI providers. It includes base adapter classes, testing utilities, and documentation for implementing new providers.

## Technical Context

**Current State:**
- Only `ClaudeProvider` exists
- No framework for adding new providers
- No testing utilities for providers

**Target State:**
- `BaseProviderAdapter` abstract class
- Provider testing utilities and mocks
- Documentation for adding providers
- Example adapter implementation

## Acceptance Criteria

### BaseProviderAdapter Class

- [ ] Create `src/providers/adapters/base-adapter.ts`:
  - [ ] Abstract base class for provider adapters
  - [ ] Common utilities for request/response translation
  - [ ] Error normalization
  - [ ] Progress event translation

### Adapter Interface

```typescript
export abstract class BaseProviderAdapter implements IProvider {
  abstract readonly name: string;
  abstract readonly capabilities: ProviderCapabilities;

  async query(options: ProviderQueryOptions): Promise<string> {
    const nativeRequest = this.translateRequest(options);
    const nativeResponse = await this.executeNative(nativeRequest);
    return this.translateResponse(nativeResponse);
  }

  protected abstract translateRequest(options: ProviderQueryOptions): unknown;
  protected abstract executeNative(request: unknown): Promise<unknown>;
  protected abstract translateResponse(response: unknown): string;

  protected normalizeError(error: unknown): ProviderError {
    // Common error normalization
  }

  protected translateProgressEvent(nativeEvent: unknown): ProviderProgressEvent {
    // Override for provider-specific events
  }
}
```

### Provider Testing Utilities

- [ ] Create `src/providers/testing/index.ts`:
  - [ ] `MockProvider` for unit testing
  - [ ] `ProviderTestHarness` for integration testing
  - [ ] `createMockResponse()` helper
  - [ ] `assertProviderCapabilities()` validator

### MockProvider

```typescript
export class MockProvider implements IProvider {
  readonly name = 'mock';
  readonly capabilities: ProviderCapabilities;

  private responses = new Map<string, string>();
  private calls: ProviderQueryOptions[] = [];

  setResponse(promptPattern: RegExp, response: string): void;
  getCallHistory(): ProviderQueryOptions[];
  assertCalled(times: number): void;
  reset(): void;
}
```

### Provider Test Harness

```typescript
export class ProviderTestHarness {
  constructor(provider: IProvider);

  async testBasicQuery(): Promise<TestResult>;
  async testStreaming(): Promise<TestResult>;
  async testToolExecution(): Promise<TestResult>;
  async testCapabilities(): Promise<TestResult>;

  runAllTests(): Promise<TestSuiteResult>;
}
```

### Documentation

- [ ] Create `docs/adding-providers.md`:
  - [ ] Step-by-step guide
  - [ ] Required interface implementations
  - [ ] Testing requirements
  - [ ] Registration process
  - [ ] Example: Adding OpenAI provider

### Example Adapter (Stub)

- [ ] Create `src/providers/adapters/openai-stub.ts`:
  - [ ] Example adapter showing patterns
  - [ ] Not functional, just structural reference

## File Structure

```
src/providers/
├── adapters/
│   ├── base-adapter.ts    # BaseProviderAdapter
│   └── openai-stub.ts     # Example adapter (stub)
├── testing/
│   ├── index.ts           # Barrel export
│   ├── mock-provider.ts   # MockProvider
│   └── test-harness.ts    # ProviderTestHarness
└── ...
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/providers/adapters/base-adapter.ts` | Base adapter class |
| `src/providers/adapters/openai-stub.ts` | Example adapter |
| `src/providers/testing/index.ts` | Testing utilities export |
| `src/providers/testing/mock-provider.ts` | MockProvider |
| `src/providers/testing/test-harness.ts` | ProviderTestHarness |
| `docs/adding-providers.md` | Provider integration guide |

## Testing Requirements

- [ ] Unit tests for `MockProvider`
- [ ] Unit tests for `ProviderTestHarness`
- [ ] Test the example adapter structure compiles
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `BaseProviderAdapter` abstract class implemented
- [ ] `MockProvider` and test utilities implemented
- [ ] Documentation written
- [ ] Example adapter created
- [ ] All tests pass
- [ ] Build succeeds

## References

- Architecture Analysis: `docs/architecture-analysis.md` Section 5.3 (Adapter Pattern)
- This enables future GitHub Copilot SDK integration when it's production-ready
