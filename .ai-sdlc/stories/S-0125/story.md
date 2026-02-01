---
id: S-0125
title: Ollama Native Integration
priority: 2
status: backlog
type: feature
created: '2026-02-01'
labels:
  - provider-integration
  - local-llm
  - ollama
  - epic-local-llm
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: ollama-native-integration
dependencies:
  - S-0124
  - S-0079
---
# Ollama Native Integration

## User Story

**As a** developer using ai-sdlc
**I want** to run SDLC agents with Ollama
**So that** I can use local models without cloud API costs

## Summary

This story implements the `OllamaProvider` class that integrates Ollama's native API with ai-sdlc. It uses the official `ollama` npm package for reliable interaction with the Ollama server.

## Technical Context

**Current State:**
- Abstract local provider base exists (S-0124)
- No Ollama-specific implementation

**Target State:**
- Full `OllamaProvider` implementing `IProvider`
- Streaming support via Ollama's async generators
- Model listing and management
- Connection health checks

## Acceptance Criteria

### Package Installation

- [ ] Install `ollama` npm package (official SDK)
- [ ] Add to dependencies in `package.json`

### OllamaProvider Class

- [ ] Create `src/providers/local/ollama-provider.ts` implementing `LocalLLMProvider`:
  - [ ] `name` property returns 'ollama'
  - [ ] `capabilities` returns Ollama-specific capabilities
  - [ ] `query()` using Ollama's chat API
  - [ ] `validateConfiguration()` checks Ollama server is running
  - [ ] `getAuthenticator()` returns `OllamaAuthenticator`
  - [ ] `getStatus()` returns server connection status
  - [ ] `listModels()` lists available models via `/api/tags`

### Streaming Support

- [ ] Implement streaming via Ollama's async generator
- [ ] Map streaming chunks to `ProviderProgressEvent`
- [ ] Handle stream interruption gracefully

### OllamaAuthenticator

- [ ] Create `OllamaAuthenticator` implementing `IAuthenticator`
- [ ] `isConfigured()` checks if Ollama server is reachable
- [ ] `getCredentialType()` returns 'none' (no auth required)
- [ ] `validateCredentials()` pings Ollama server

### Error Handling

- [ ] Connection errors: "Ollama not running. Start with: `ollama serve`"
- [ ] Model not found: "Model not found. Pull with: `ollama pull <model>`"
- [ ] Timeout errors with retry guidance

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/local/ollama-provider.ts` | Create | Ollama provider implementation |
| `src/providers/local/ollama-authenticator.ts` | Create | Ollama connection validation |
| `package.json` | Modify | Add ollama dependency |

## Implementation Specification

```typescript
// src/providers/local/ollama-provider.ts

import { Ollama } from 'ollama';
import { ProviderCapabilities, ProviderQueryOptions, ProviderProgressEvent } from '../types.js';
import { LocalLLMProvider } from './base-provider.js';
import { LocalLLMConfig, LocalProviderStatus, LocalModelInfo, DEFAULT_LOCAL_CONFIG } from './types.js';
import { OllamaAuthenticator } from './ollama-authenticator.js';

export class OllamaProvider extends LocalLLMProvider {
  readonly name = 'ollama';
  private client: Ollama;
  private authenticator: OllamaAuthenticator;

  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsTools: false, // Ollama tool support varies by model
    supportsSystemPrompt: true,
    supportsMultiTurn: true,
    maxContextTokens: 8192, // Varies by model
    supportedModels: ['llama3.1', 'llama3.2', 'mistral', 'codellama', 'deepseek-coder'],
  };

  constructor(config: LocalLLMConfig = {}) {
    super({ ...DEFAULT_LOCAL_CONFIG, ...config });
    this.client = new Ollama({ host: this.getBaseUrl() });
    this.authenticator = new OllamaAuthenticator(this.getBaseUrl());
  }

  async query(options: ProviderQueryOptions): Promise<string> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: options.prompt });

    if (options.onProgress) {
      return this.streamQuery(messages, options);
    }

    const response = await this.client.chat({
      model: this.config.model || DEFAULT_LOCAL_CONFIG.model,
      messages,
    });

    return response.message.content;
  }

  private async streamQuery(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: ProviderQueryOptions
  ): Promise<string> {
    const stream = await this.client.chat({
      model: this.config.model || DEFAULT_LOCAL_CONFIG.model,
      messages,
      stream: true,
    });

    let content = '';
    for await (const part of stream) {
      const delta = part.message.content;
      content += delta;
      options.onProgress?.({ type: 'message', content: delta });
    }

    options.onProgress?.({ type: 'completion' });
    return content;
  }

  async validateConfiguration(): Promise<boolean> {
    return this.authenticator.validateCredentials();
  }

  getAuthenticator(): OllamaAuthenticator {
    return this.authenticator;
  }

  async getStatus(): Promise<LocalProviderStatus> {
    try {
      const models = await this.client.list();
      return {
        isConnected: true,
        availableModels: models.models.map((m) => m.name),
        loadedModel: this.config.model,
      };
    } catch (error) {
      return {
        isConnected: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  async listModels(): Promise<LocalModelInfo[]> {
    const response = await this.client.list();
    return response.models.map((model) => ({
      name: model.name,
      size: model.details?.parameter_size,
      quantization: model.details?.quantization_level,
      capabilities: {
        chat: true,
        completion: true,
        embedding: model.name.includes('embed'),
      },
    }));
  }
}
```

```typescript
// src/providers/local/ollama-authenticator.ts

import { IAuthenticator } from '../types.js';

export class OllamaAuthenticator implements IAuthenticator {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  isConfigured(): boolean {
    // Ollama doesn't require configuration - just needs to be running
    return true;
  }

  getCredentialType(): 'none' {
    return 'none';
  }

  async configure(): Promise<void> {
    const isValid = await this.validateCredentials();
    if (isValid) {
      console.log('Ollama server is running and ready.');
    } else {
      console.log('Ollama server not detected.');
      console.log('Start with: ollama serve');
      console.log('Install from: https://ollama.ai');
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

## Testing Requirements

- [ ] Unit test: Provider instantiation with default config
- [ ] Unit test: `query()` with mocked Ollama client
- [ ] Unit test: Streaming with progress callbacks
- [ ] Unit test: `listModels()` response parsing
- [ ] Unit test: `getStatus()` for connected/disconnected states
- [ ] Unit test: Authenticator validation
- [ ] Integration test: Real Ollama server (optional)
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `ollama` package installed
- [ ] `OllamaProvider` class fully implemented
- [ ] `OllamaAuthenticator` class implemented
- [ ] Streaming support working
- [ ] Model listing working
- [ ] Error messages guide users to solutions
- [ ] Registered with `ProviderRegistry`
- [ ] Unit tests with mocked dependencies
- [ ] `make verify` passes

## References

- Ollama npm package: https://www.npmjs.com/package/ollama
- Ollama API: https://github.com/ollama/ollama/blob/main/docs/api.md
- Depends on: S-0124, S-0079 (ProviderRegistry)
