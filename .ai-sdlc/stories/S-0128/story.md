---
id: S-0128
title: Local LLM Error Handling and Fallback
priority: 5
status: backlog
type: feature
created: '2026-02-01'
labels:
  - provider-integration
  - local-llm
  - error-handling
  - epic-local-llm
research_complete: false
plan_complete: false
implementation_complete: false
reviews_complete: false
slug: local-llm-error-handling
dependencies:
  - S-0125
  - S-0126
  - S-0127
---
# Local LLM Error Handling and Fallback

## User Story

**As a** user of ai-sdlc with local LLMs
**I want** graceful handling of local LLM failures
**So that** I'm not blocked when my local server crashes or becomes unresponsive

## Summary

This story implements robust error handling for local LLM providers, including retry logic, structured error types, optional fallback chains, and health monitoring. It ensures a smooth experience when working with potentially unstable local servers.

## Technical Context

**Current State:**
- Basic error handling in local providers
- No retry logic
- No fallback mechanism
- No health monitoring

**Target State:**
- Structured error types for local providers
- Retry logic with exponential backoff
- Configurable timeout per provider
- Optional fallback chain (local → cloud)
- Health check endpoint polling

## Acceptance Criteria

### Structured Error Types

- [ ] Create `src/providers/local/errors.ts` with:
  - [ ] `LocalProviderConnectionError` - Server not running
  - [ ] `LocalProviderTimeoutError` - Request timed out
  - [ ] `LocalProviderModelError` - Model not found/loaded
  - [ ] `LocalProviderMemoryError` - Out of memory
  - [ ] `LocalProviderError` base class

### Retry Logic

- [ ] Implement retry with exponential backoff
- [ ] Configurable max retries (default: 3)
- [ ] Configurable base delay (default: 1000ms)
- [ ] Emit `retry` progress events

### Timeout Configuration

- [ ] Per-provider timeout configuration
- [ ] Default: 120000ms (2 minutes for large models)
- [ ] Configurable via `.ai-sdlc.json`
- [ ] AbortController for request cancellation

### Fallback Chain

- [ ] Implement optional fallback chain configuration:
  ```json
  {
    "providers": {
      "fallbackChain": ["local", "claude"]
    }
  }
  ```
- [ ] Try providers in order until one succeeds
- [ ] Log fallback events for visibility

### Health Monitoring

- [ ] Implement health check polling for long sessions
- [ ] Detect server disconnection during execution
- [ ] Emit health status events
- [ ] Auto-reconnect on server restart

### Helpful Error Messages

- [ ] Connection error: "Ollama not running. Start with: `ollama serve`"
- [ ] Model error: "Model not found. Pull with: `ollama pull llama3.1`"
- [ ] Timeout error: "Request timed out after 120s. Try a smaller model or increase timeout."
- [ ] Memory error: "Out of memory. Try a smaller/quantized model."

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/local/errors.ts` | Create | Structured error types |
| `src/providers/local/retry.ts` | Create | Retry logic implementation |
| `src/providers/local/health.ts` | Create | Health monitoring |
| `src/providers/local/fallback.ts` | Create | Fallback chain logic |
| `src/providers/local/ollama-provider.ts` | Modify | Integrate error handling |
| `src/providers/local/openai-compatible-provider.ts` | Modify | Integrate error handling |

## Implementation Specification

```typescript
// src/providers/local/errors.ts

export class LocalProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly guidance?: string
  ) {
    super(message);
    this.name = 'LocalProviderError';
  }
}

export class LocalProviderConnectionError extends LocalProviderError {
  constructor(host: string, port: number) {
    super(
      `Cannot connect to local LLM server at ${host}:${port}`,
      'CONNECTION_ERROR',
      'Start the server with: ollama serve'
    );
    this.name = 'LocalProviderConnectionError';
  }
}

export class LocalProviderTimeoutError extends LocalProviderError {
  constructor(timeoutMs: number) {
    super(
      `Request timed out after ${timeoutMs / 1000}s`,
      'TIMEOUT_ERROR',
      'Try a smaller model or increase the timeout in configuration'
    );
    this.name = 'LocalProviderTimeoutError';
  }
}

export class LocalProviderModelError extends LocalProviderError {
  constructor(model: string, provider: string) {
    const pullCommand = provider === 'ollama'
      ? `ollama pull ${model}`
      : 'Load the model in your server';

    super(
      `Model '${model}' not found`,
      'MODEL_ERROR',
      `Install with: ${pullCommand}`
    );
    this.name = 'LocalProviderModelError';
  }
}

export class LocalProviderMemoryError extends LocalProviderError {
  constructor() {
    super(
      'Out of memory while loading model',
      'MEMORY_ERROR',
      'Try a smaller or more quantized model (e.g., Q4_K_M instead of Q8_0)'
    );
    this.name = 'LocalProviderMemoryError';
  }
}
```

```typescript
// src/providers/local/retry.ts

import { ProviderProgressCallback } from '../types.js';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onProgress?: ProviderProgressCallback;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt > opts.maxRetries) {
        break;
      }

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt - 1),
        opts.maxDelayMs
      );

      opts.onProgress?.({
        type: 'retry',
        attempt,
        delay,
        error: lastError.message,
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

```typescript
// src/providers/local/fallback.ts

import { IProvider, ProviderQueryOptions } from '../types.js';
import { ProviderRegistry } from '../registry.js';

export interface FallbackChainOptions {
  providers: string[];
  onFallback?: (from: string, to: string, error: Error) => void;
}

export class FallbackChain {
  private providers: string[];
  private onFallback?: (from: string, to: string, error: Error) => void;

  constructor(options: FallbackChainOptions) {
    this.providers = options.providers;
    this.onFallback = options.onFallback;
  }

  async query(options: ProviderQueryOptions): Promise<{ result: string; provider: string }> {
    let lastError: Error | null = null;

    for (let i = 0; i < this.providers.length; i++) {
      const providerName = this.providers[i];

      try {
        const provider = ProviderRegistry.get(providerName);
        const result = await provider.query(options);
        return { result, provider: providerName };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (i < this.providers.length - 1) {
          const nextProvider = this.providers[i + 1];
          this.onFallback?.(providerName, nextProvider, lastError);
        }
      }
    }

    throw lastError || new Error('All providers failed');
  }
}
```

## Testing Requirements

- [ ] Unit test: Each error type instantiation and properties
- [ ] Unit test: Retry logic with exponential backoff
- [ ] Unit test: Retry progress event emission
- [ ] Unit test: Fallback chain success on first provider
- [ ] Unit test: Fallback chain success on subsequent provider
- [ ] Unit test: Fallback chain all providers fail
- [ ] Unit test: Timeout handling
- [ ] Integration with local providers
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] All error types implemented with guidance messages
- [ ] Retry logic with exponential backoff working
- [ ] Fallback chain implemented and configurable
- [ ] Health monitoring for long sessions
- [ ] Integration with OllamaProvider and OpenAICompatibleProvider
- [ ] Unit tests with full coverage
- [ ] Error messages are helpful and actionable
- [ ] `make verify` passes

## References

- Exponential backoff: https://en.wikipedia.org/wiki/Exponential_backoff
- AbortController: https://developer.mozilla.org/en-US/docs/Web/API/AbortController
- Depends on: S-0125, S-0126, S-0127
