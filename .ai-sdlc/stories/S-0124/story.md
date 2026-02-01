---
id: S-0124
title: Local LLM Provider Abstraction Layer
priority: 1
status: backlog
type: feature
created: '2026-02-01'
labels:
  - provider-integration
  - local-llm
  - epic-local-llm
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: local-llm-abstraction
dependencies:
  - S-0078
---
# Local LLM Provider Abstraction Layer

## User Story

**As a** developer using ai-sdlc
**I want** a unified interface for local LLM providers
**So that** I can easily switch between Ollama, LM Studio, and other local options

## Summary

This story creates the abstraction layer for local LLM providers, defining common configuration, types, and a factory function. This enables consistent integration with Ollama, LM Studio, llama.cpp, and other local LLM servers.

## Technical Context

**Current State:**
- Only cloud providers (Claude) supported
- No local LLM integration

**Target State:**
- `LocalLLMConfig` interface for configuration
- `LocalLLMProvider` abstract class
- Factory function for provider creation
- Shared types for local providers

## Acceptance Criteria

### Type Definitions

- [ ] Create `src/providers/local/types.ts` with:
  - [ ] `LocalLLMConfig` interface (host, port, model, timeout, options)
  - [ ] `LocalLLMType` enum ('ollama' | 'openai-compatible' | 'lm-studio' | 'llama-cpp')
  - [ ] `LocalModelInfo` interface (name, size, quantization, capabilities)
  - [ ] `LocalProviderStatus` type for health checks

### Abstract Base Class

- [ ] Create `LocalLLMProvider` abstract class extending common provider patterns
- [ ] Define abstract methods for subclass implementation
- [ ] Implement shared functionality (timeout handling, connection retry)

### Factory Function

- [ ] Create `createLocalProvider(config)` factory function
- [ ] Auto-detect provider type from endpoint if not specified
- [ ] Return appropriate provider implementation

### Configuration Defaults

- [ ] Default host: `http://localhost`
- [ ] Default timeout: 120000ms (2 minutes for large models)
- [ ] Configurable model selection

## Files to Create

| File | Purpose |
|------|---------|
| `src/providers/local/types.ts` | Type definitions for local providers |
| `src/providers/local/base-provider.ts` | Abstract base class |
| `src/providers/local/factory.ts` | Provider factory function |
| `src/providers/local/index.ts` | Barrel exports |

## Implementation Specification

```typescript
// src/providers/local/types.ts

export type LocalLLMType = 'ollama' | 'openai-compatible' | 'lm-studio' | 'llama-cpp';

export interface LocalLLMConfig {
  /** Provider type (auto-detected if not specified) */
  type?: LocalLLMType;
  /** Server host URL */
  host?: string;
  /** Server port */
  port?: number;
  /** Model name to use */
  model?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

export interface LocalModelInfo {
  /** Model name/identifier */
  name: string;
  /** Model size (e.g., '7B', '13B', '70B') */
  size?: string;
  /** Quantization level (e.g., 'Q4_K_M', 'Q5_K_S') */
  quantization?: string;
  /** Model capabilities */
  capabilities: {
    chat: boolean;
    completion: boolean;
    embedding: boolean;
  };
}

export interface LocalProviderStatus {
  /** Whether the server is reachable */
  isConnected: boolean;
  /** Server version if available */
  version?: string;
  /** Currently loaded model */
  loadedModel?: string;
  /** Available models */
  availableModels?: string[];
  /** Error message if connection failed */
  error?: string;
}

export const DEFAULT_LOCAL_CONFIG: Required<Omit<LocalLLMConfig, 'type' | 'options'>> = {
  host: 'http://localhost',
  port: 11434, // Ollama default
  model: 'llama3.1',
  timeout: 120000,
};
```

```typescript
// src/providers/local/base-provider.ts

import { IProvider, ProviderCapabilities, ProviderQueryOptions, IAuthenticator } from '../types.js';
import { LocalLLMConfig, LocalProviderStatus, LocalModelInfo } from './types.js';

export abstract class LocalLLMProvider implements IProvider {
  abstract readonly name: string;
  abstract readonly capabilities: ProviderCapabilities;

  protected config: LocalLLMConfig;

  constructor(config: LocalLLMConfig) {
    this.config = config;
  }

  abstract query(options: ProviderQueryOptions): Promise<string>;
  abstract validateConfiguration(): Promise<boolean>;
  abstract getAuthenticator(): IAuthenticator;

  /** Get server connection status */
  abstract getStatus(): Promise<LocalProviderStatus>;

  /** List available models */
  abstract listModels(): Promise<LocalModelInfo[]>;

  /** Get base URL for API calls */
  protected getBaseUrl(): string {
    const host = this.config.host || 'http://localhost';
    const port = this.config.port || 11434;
    return `${host}:${port}`;
  }
}
```

```typescript
// src/providers/local/factory.ts

import { LocalLLMConfig, LocalLLMType } from './types.js';
import { LocalLLMProvider } from './base-provider.js';

/**
 * Create a local LLM provider based on configuration
 */
export async function createLocalProvider(config: LocalLLMConfig): Promise<LocalLLMProvider> {
  const type = config.type || (await detectProviderType(config));

  switch (type) {
    case 'ollama':
      const { OllamaProvider } = await import('./ollama-provider.js');
      return new OllamaProvider(config);

    case 'openai-compatible':
    case 'lm-studio':
    case 'llama-cpp':
      const { OpenAICompatibleProvider } = await import('./openai-compatible-provider.js');
      return new OpenAICompatibleProvider(config);

    default:
      throw new Error(`Unknown local LLM type: ${type}`);
  }
}

/**
 * Auto-detect provider type by probing endpoints
 */
async function detectProviderType(config: LocalLLMConfig): Promise<LocalLLMType> {
  const host = config.host || 'http://localhost';
  const port = config.port || 11434;
  const baseUrl = `${host}:${port}`;

  // Try Ollama API
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (response.ok) return 'ollama';
  } catch { /* ignore */ }

  // Try OpenAI-compatible API
  try {
    const response = await fetch(`${baseUrl}/v1/models`);
    if (response.ok) return 'openai-compatible';
  } catch { /* ignore */ }

  // Default to Ollama
  return 'ollama';
}
```

## Testing Requirements

- [ ] Unit test: Type exports and defaults
- [ ] Unit test: Factory function with explicit type
- [ ] Unit test: Provider type auto-detection
- [ ] Unit test: Base URL generation
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] All types defined in `src/providers/local/types.ts`
- [ ] Abstract base class implemented
- [ ] Factory function working with auto-detection
- [ ] Barrel exports in `src/providers/local/index.ts`
- [ ] JSDoc documentation on public APIs
- [ ] All tests pass
- [ ] `make verify` passes

## References

- Ollama API: https://github.com/ollama/ollama/blob/main/docs/api.md
- OpenAI API: https://platform.openai.com/docs/api-reference
- Depends on: S-0078 (IProvider interface)
