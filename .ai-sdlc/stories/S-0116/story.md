---
id: S-0116
title: OpenAI Agent Provider Implementation
priority: 3
status: backlog
type: feature
created: '2026-02-01'
labels:
  - provider-integration
  - openai
  - epic-openai-integration
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: openai-provider-implementation
dependencies:
  - S-0078
  - S-0079
  - S-0114
  - S-0115
---
# OpenAI Agent Provider Implementation

## User Story

**As a** developer using ai-sdlc
**I want** an OpenAI provider implementation
**So that** I can run SDLC agents using OpenAI's models instead of Claude

## Summary

This story implements the core `OpenAIProvider` class that integrates OpenAI's API with ai-sdlc's provider abstraction. It handles query execution, streaming responses, and progress event mapping.

## Technical Context

**Current State:**
- `IProvider` interface exists from S-0078
- `ProviderRegistry` exists from S-0079
- Authentication handled by S-0114
- Types defined in S-0115

**Target State:**
- Full `OpenAIProvider` implementing `IProvider`
- Streaming support via Server-Sent Events
- Progress event mapping to `ProviderProgressEvent`
- Tool/function calling support

## Acceptance Criteria

### OpenAIProvider Class

- [ ] Create `src/providers/openai/openai-provider.ts` implementing `IProvider`:
  - [ ] `name` property returns 'openai'
  - [ ] `capabilities` returns OpenAI-specific capabilities
  - [ ] `query()` executes prompts against OpenAI API
  - [ ] `validateConfiguration()` checks API key and connectivity
  - [ ] `getAuthenticator()` returns `OpenAIAuthenticator`

### Streaming Support

- [ ] Implement streaming via OpenAI SDK's async iterators
- [ ] Map streaming chunks to `ProviderProgressEvent`:
  - [ ] `message` events for content deltas
  - [ ] `tool_start` / `tool_end` for function calls
  - [ ] `completion` when stream ends
  - [ ] `error` for failures

### Tool/Function Calling

- [ ] Support OpenAI function calling format
- [ ] Map tools to OpenAI tool definitions
- [ ] Handle function call responses

### Error Handling

- [ ] Rate limit errors with retry logic
- [ ] Authentication errors with clear messages
- [ ] Model not found errors
- [ ] Context length exceeded errors

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/openai/openai-provider.ts` | Create | Main provider implementation |
| `src/providers/openai/index.ts` | Create | Barrel exports |
| `src/providers/index.ts` | Modify | Export OpenAI provider |

## Implementation Specification

```typescript
// src/providers/openai/openai-provider.ts

import OpenAI from 'openai';
import { IProvider, ProviderCapabilities, ProviderQueryOptions, ProviderProgressEvent } from '../types.js';
import { OpenAIAuthenticator } from './openai-authenticator.js';
import { OpenAIProviderConfig, DEFAULT_OPENAI_CONFIG } from './types.js';

export class OpenAIProvider implements IProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private authenticator: OpenAIAuthenticator;
  private config: OpenAIProviderConfig;

  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsTools: true,
    supportsSystemPrompt: true,
    supportsMultiTurn: true,
    maxContextTokens: 128000, // gpt-4o
    supportedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o1-pro', 'o3-mini'],
  };

  constructor(config?: OpenAIProviderConfig) {
    this.config = { ...DEFAULT_OPENAI_CONFIG, ...config };
    this.authenticator = new OpenAIAuthenticator();
    this.client = new OpenAI({
      apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
      baseURL: this.config.baseUrl,
      organization: this.config.organization,
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
      model: this.config.model || DEFAULT_OPENAI_CONFIG.model,
      messages,
    });

    return response.choices[0]?.message?.content || '';
  }

  private async streamQuery(
    messages: OpenAI.ChatCompletionMessageParam[],
    options: ProviderQueryOptions
  ): Promise<string> {
    const stream = await this.client.chat.completions.create({
      model: this.config.model || DEFAULT_OPENAI_CONFIG.model,
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
    return this.authenticator.validateCredentials();
  }

  getAuthenticator(): OpenAIAuthenticator {
    return this.authenticator;
  }
}
```

## Testing Requirements

- [ ] Unit test: Provider instantiation with config
- [ ] Unit test: `query()` with mocked OpenAI client
- [ ] Unit test: Streaming with progress callbacks
- [ ] Unit test: Error handling for various failure modes
- [ ] Unit test: Capabilities property values
- [ ] Integration test: Real API call (optional, requires key)
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `OpenAIProvider` class fully implemented
- [ ] Streaming support working
- [ ] Tool/function calling support
- [ ] Error handling with retry logic
- [ ] Registered with `ProviderRegistry`
- [ ] Unit tests with mocked dependencies
- [ ] `make verify` passes

## References

- OpenAI Node SDK: https://github.com/openai/openai-node
- OpenAI Chat Completions: https://platform.openai.com/docs/api-reference/chat
- Depends on: S-0078, S-0079, S-0114, S-0115
