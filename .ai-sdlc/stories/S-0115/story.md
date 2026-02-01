---
id: S-0115
title: OpenAI Provider Types and Configuration Schema
priority: 2
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
slug: openai-provider-types
dependencies:
  - S-0078
---
# OpenAI Provider Types and Configuration Schema

## User Story

**As a** developer integrating OpenAI
**I want** well-defined types for OpenAI provider configuration
**So that** I have type-safe configuration and clear contracts

## Summary

This story defines TypeScript types and interfaces specific to the OpenAI provider integration, including configuration schemas, response types, and model options.

## Technical Context

**Current State:**
- Generic `ProviderQueryOptions` exists from S-0078
- No OpenAI-specific types

**Target State:**
- OpenAI-specific configuration types
- Model enum with supported models
- Response mapping types
- JSON schema for config validation

## Acceptance Criteria

### Type Definitions

- [ ] Create `src/providers/openai/types.ts` with:
  - [ ] `OpenAIProviderConfig` interface (apiKey, model, baseUrl, organization)
  - [ ] `OpenAIModel` type (gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini, o1-pro, o3-mini)
  - [ ] `OpenAIQueryOptions` extending `ProviderQueryOptions`
  - [ ] `OpenAIToolDefinition` interface for function calling
  - [ ] `OpenAIResponseMapping` types

### Configuration Schema

- [ ] Add OpenAI config section to `.ai-sdlc.json` schema:
  ```json
  {
    "providers": {
      "openai": {
        "model": "gpt-4o",
        "baseUrl": "https://api.openai.com/v1",
        "organization": "org-xxx"
      }
    }
  }
  ```

### Model Defaults

- [ ] Default model: `gpt-4o`
- [ ] Default base URL: `https://api.openai.com/v1`
- [ ] Configurable organization ID (optional)

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/providers/openai/types.ts` | Create | OpenAI-specific type definitions |
| `src/core/config.ts` | Modify | Add OpenAI config schema validation |

## Implementation Specification

```typescript
// src/providers/openai/types.ts

import { ProviderQueryOptions } from '../types.js';

export type OpenAIModel =
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4-turbo'
  | 'o1'
  | 'o1-mini'
  | 'o1-pro'
  | 'o3-mini';

export interface OpenAIProviderConfig {
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Model to use for completions */
  model?: OpenAIModel;
  /** Base URL for API (for proxies or Azure) */
  baseUrl?: string;
  /** Organization ID for multi-org accounts */
  organization?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

export interface OpenAIQueryOptions extends ProviderQueryOptions {
  /** OpenAI-specific: temperature (0-2) */
  temperature?: number;
  /** OpenAI-specific: max tokens in response */
  maxTokens?: number;
  /** OpenAI-specific: response format */
  responseFormat?: 'text' | 'json_object';
}

export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const DEFAULT_OPENAI_CONFIG: Required<Pick<OpenAIProviderConfig, 'model' | 'baseUrl' | 'timeout'>> = {
  model: 'gpt-4o',
  baseUrl: 'https://api.openai.com/v1',
  timeout: 120000,
};
```

## Testing Requirements

- [ ] Type compilation tests (ensure interfaces are valid)
- [ ] Unit test: Default config values
- [ ] Unit test: Config schema validation
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] All types defined in `src/providers/openai/types.ts`
- [ ] Config schema updated in `src/core/config.ts`
- [ ] JSDoc documentation on all public types
- [ ] Types exported from `src/providers/openai/index.ts`
- [ ] All tests pass
- [ ] `make verify` passes

## References

- OpenAI Models: https://platform.openai.com/docs/models
- OpenAI API Reference: https://platform.openai.com/docs/api-reference
- Depends on: S-0078 (ProviderQueryOptions)
