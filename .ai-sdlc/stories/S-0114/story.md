---
id: S-0114
title: OpenAI Authentication and Credential Management
priority: 1
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
slug: openai-authentication
dependencies:
  - S-0078
---
# OpenAI Authentication and Credential Management

## User Story

**As a** developer using ai-sdlc
**I want** secure credential management for OpenAI API access
**So that** I can use OpenAI as an alternative provider with proper authentication

## Summary

This story implements the `OpenAIAuthenticator` class that handles OpenAI API key management, validation, and secure storage. It follows the `IAuthenticator` interface from S-0078 to ensure consistency across providers.

## Technical Context

**Current State:**
- Only Claude authentication exists via `ClaudeAuthenticator`
- No OpenAI credential management

**Target State:**
- `OpenAIAuthenticator` implementing `IAuthenticator`
- API key validation against OpenAI API
- Secure credential storage in config
- Support for `OPENAI_API_KEY` environment variable

## Acceptance Criteria

### OpenAIAuthenticator Class

- [ ] Create `src/providers/openai/openai-authenticator.ts` implementing `IAuthenticator`:
  - [ ] `isConfigured()` - Check if API key exists in env or config
  - [ ] `getCredentialType()` - Return 'api_key'
  - [ ] `configure()` - Interactive API key setup
  - [ ] `validateCredentials()` - Test key against OpenAI models endpoint

### Credential Sources (Priority Order)

- [ ] Check `OPENAI_API_KEY` environment variable first
- [ ] Fall back to `.ai-sdlc.json` config file
- [ ] Fall back to `~/.config/openai/credentials.json`

### Validation

- [ ] Make test request to `GET /v1/models` endpoint
- [ ] Return true if request succeeds with valid auth
- [ ] Return false with descriptive error for invalid keys

### Error Handling

- [ ] Clear error messages for missing credentials
- [ ] Guidance to obtain API key from platform.openai.com
- [ ] Rate limit handling during validation

## Files to Create

| File | Purpose |
|------|---------|
| `src/providers/openai/openai-authenticator.ts` | OpenAI credential management |

## Implementation Specification

```typescript
// src/providers/openai/openai-authenticator.ts

import { IAuthenticator } from '../types.js';
import OpenAI from 'openai';

export class OpenAIAuthenticator implements IAuthenticator {
  private apiKey: string | null = null;

  isConfigured(): boolean {
    return this.getApiKey() !== null;
  }

  getCredentialType(): 'api_key' {
    return 'api_key';
  }

  async configure(): Promise<void> {
    // Interactive setup - prompt for API key
    // Store in config file
  }

  async validateCredentials(): Promise<boolean> {
    const apiKey = this.getApiKey();
    if (!apiKey) return false;

    try {
      const client = new OpenAI({ apiKey });
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  private getApiKey(): string | null {
    if (this.apiKey) return this.apiKey;
    return process.env.OPENAI_API_KEY || null;
  }
}
```

## Testing Requirements

- [ ] Unit test: `isConfigured()` with/without env var
- [ ] Unit test: `validateCredentials()` with mocked OpenAI client
- [ ] Unit test: Credential source priority order
- [ ] Integration test: Real API validation (optional, requires key)
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

## Definition of Done

- [ ] `OpenAIAuthenticator` class implemented
- [ ] All `IAuthenticator` methods implemented
- [ ] Error handling with helpful messages
- [ ] Unit tests with mocked dependencies
- [ ] Documentation comments on public methods
- [ ] `make verify` passes

## References

- OpenAI API Authentication: https://platform.openai.com/docs/api-reference/authentication
- Depends on: S-0078 (IAuthenticator interface)
