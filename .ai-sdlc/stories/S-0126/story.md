---
id: S-0126
title: OpenAI-Compatible Endpoint Provider
priority: 3
status: backlog
type: feature
created: '2026-02-01'
labels:
  - provider-integration
  - local-llm
  - openai-compatible
  - epic-local-llm
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: openai-compatible-provider
dependencies:
  - S-0124
---
# OpenAI-Compatible Endpoint Provider

## User Story

**As a** developer using ai-sdlc
**I want** to use any OpenAI-compatible local server (LM Studio, llama.cpp)
**So that** I have maximum flexibility in choosing my local LLM server

## Summary

This story implements a provider that works with any OpenAI-compatible API endpoint. This covers LM Studio, llama.cpp server, text-generation-webui, and other tools that expose an OpenAI-compatible REST API.

## Technical Context

**Current State:**
- Ollama-specific provider exists (S-0125)
- No OpenAI-compatible endpoint support

**Target State:**
- `OpenAICompatibleProvider` using OpenAI SDK with custom baseURL
- Support for LM Studio (port 1234), llama.cpp (port 8080), and custom ports
- Optional API key authentication
- Model listing via `/v1/models`

## Acceptance Criteria

### OpenAICompatibleProvider Class

- [ ] Create `src/providers/local/openai-compatible-provider.ts` implementing `LocalLLMProvider`:
  - [ ] `name` property returns 'openai-compatible'
  - [ ] `capabilities` returns capabilities based on server
  - [ ] `query()` using OpenAI SDK with custom baseURL
  - [ ] `validateConfiguration()` checks server is reachable
  - [ ] `getAuthenticator()` returns appropriate authenticator
  - [ ] `getStatus()` returns server connection status
  - [ ] `listModels()` lists models via `/v1/models`

### Configuration Support

- [ ] Use OpenAI SDK with configurable `baseURL`
- [ ] Support optional API key authentication
- [ ] Default ports: 1234 (LM Studio), 8080 (llama.cpp)
- [ ] Handle cases where model name is ignored (llama.cpp)

### Streaming Support

- [ ] Implement streaming via OpenAI SDK streaming API
- [ ] Map streaming chunks to `ProviderProgressEvent`
- [ ] Handle stream errors gracefully

### Server Compatibility

- [ ] LM Studio compatibility verified
- [ ] llama.cpp server compatibility verified
- [ ] text-generation-webui compatibility verified

## Files to Create

| File | Purpose |
|------|---------|
| `src/providers/local/openai-compatible-provider.ts` | OpenAI-compatible provider |

## Implementation Specification

```typescript
// src/providers/local/openai-compatible-provider.ts

import OpenAI from 'openai';
import { ProviderCapabilities, ProviderQueryOptions, IAuthenticator } from '../types.js';
import { LocalLLMProvider } from './base-provider.js';
import { LocalLLMConfig, LocalProviderStatus, LocalModelInfo } from './types.js';

export interface OpenAICompatibleConfig extends LocalLLMConfig {
  /** API key (optional for most local servers) */
  apiKey?: string;
}

export class OpenAICompatibleProvider extends LocalLLMProvider {
  readonly name = 'openai-compatible';
  private client: OpenAI;
  private apiKey?: string;

  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsTools: false, // Varies by server
    supportsSystemPrompt: true,
    supportsMultiTurn: true,
    maxContextTokens: 8192, // Varies by model
    supportedModels: [], // Dynamic based on server
  };

  constructor(config: OpenAICompatibleConfig = {}) {
    super(config);
    this.apiKey = config.apiKey;

    const baseURL = this.getOpenAIBaseUrl();
    this.client = new OpenAI({
      baseURL,
      apiKey: this.apiKey || 'not-needed', // Some servers require a value
    });
  }

  async query(options: ProviderQueryOptions): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: options.prompt });

    if (options.onProgress) {
      return this.streamQuery(messages, options);
    }

    const response = await this.client.chat.completions.create({
      model: this.config.model || 'default', // llama.cpp ignores this
      messages,
    });

    return response.choices[0]?.message?.content || '';
  }

  private async streamQuery(
    messages: OpenAI.ChatCompletionMessageParam[],
    options: ProviderQueryOptions
  ): Promise<string> {
    const stream = await this.client.chat.completions.create({
      model: this.config.model || 'default',
      messages,
      stream: true,
    });

    let content = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      content += delta;
      options.onProgress?.({ type: 'message', content: delta });
    }

    options.onProgress?.({ type: 'completion' });
    return content;
  }

  async validateConfiguration(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  getAuthenticator(): IAuthenticator {
    return {
      isConfigured: () => true,
      getCredentialType: () => this.apiKey ? 'api_key' : 'none',
      configure: async () => {
        console.log('OpenAI-compatible server configured at:', this.getOpenAIBaseUrl());
      },
      validateCredentials: () => this.validateConfiguration(),
    };
  }

  async getStatus(): Promise<LocalProviderStatus> {
    try {
      const models = await this.client.models.list();
      return {
        isConnected: true,
        availableModels: models.data.map((m) => m.id),
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
    try {
      const response = await this.client.models.list();
      return response.data.map((model) => ({
        name: model.id,
        capabilities: {
          chat: true,
          completion: true,
          embedding: model.id.includes('embed'),
        },
      }));
    } catch {
      // Some servers don't support model listing
      return [];
    }
  }

  private getOpenAIBaseUrl(): string {
    const host = this.config.host || 'http://localhost';
    const port = this.config.port || 1234; // LM Studio default
    return `${host}:${port}/v1`;
  }
}
```

## Testing Requirements

- [ ] Unit test: Provider instantiation with default config
- [ ] Unit test: Provider with custom port (1234, 8080)
- [ ] Unit test: `query()` with mocked OpenAI client
- [ ] Unit test: Streaming with progress callbacks
- [ ] Unit test: `listModels()` response parsing
- [ ] Unit test: Handling servers that don't support model listing
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `OpenAICompatibleProvider` class fully implemented
- [ ] LM Studio compatibility tested
- [ ] llama.cpp compatibility tested
- [ ] Streaming support working
- [ ] Model listing working (with fallback for unsupported servers)
- [ ] Unit tests with mocked dependencies
- [ ] `make verify` passes

## References

- OpenAI Node SDK: https://github.com/openai/openai-node
- LM Studio: https://lmstudio.ai
- llama.cpp server: https://github.com/ggerganov/llama.cpp/tree/master/examples/server
- Depends on: S-0124
